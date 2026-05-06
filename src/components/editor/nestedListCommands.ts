/**
 * 多级列表命令实现
 * 
 * 基于 nestedListBehavior 模块，实现具体的编辑命令
 */

import { EditorSelection, EditorState, type StateCommand, type Transaction } from '@codemirror/state';
import { updateSelectedLines as updateSelectedLinesWithSelectionMap } from './behavior/core';
import {
  type ListItemInfo,
  type ListType,
  parseListItem,
  getListInfoAtLine,
  getSelectedListItems,
  formatListItem,
  isEmptyListItem,
  findPreviousSiblingItem,
  getStrictOrderedListNormalizationChanges,
  LIST_INDENT_SIZE,
  LIST_INDENT_UNIT,
  getLevelFromIndent,
  getIndentColumnWidth,
} from './nestedListBehavior';

// ==================== 辅助函数 ====================

function isBlankLine(lineText: string): boolean {
  return /^[ \t]*$/.test(lineText);
}

function getLeadingIndent(lineText: string): string {
  return lineText.match(/^[ \t]*/)![0];
}

function getMarkerText(item: ListItemInfo): string {
  if (item.type === 'ordered') {
    return `${item.number ?? 1}${item.delimiter ?? '.'}`;
  }

  if (item.type === 'task') {
    return `${item.marker} ${item.checkbox ?? '[ ]'}`;
  }

  return item.marker;
}

function getIndentByColumn(width: number): string {
  return ' '.repeat(Math.max(0, width));
}

function replaceCurrentLine(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  newText: string,
  cursorColumn?: number
): boolean {
  const line = state.doc.lineAt(state.selection.main.from);
  const column = cursorColumn ?? state.selection.main.from - line.from;
  const newColumn = Math.min(newText.length, column);

  dispatch(state.update({
    changes: { from: line.from, to: line.to, insert: newText },
    selection: { anchor: line.from + newColumn },
    scrollIntoView: true,
    userEvent: 'input',
  }));
  return true;
}

function getListContentStartColumn(item: ListItemInfo): number {
  const quoteLength = item.quotePrefix?.length ?? 0;
  const markerText = getMarkerText(item);
  return quoteLength + item.indent.length + markerText.length + 1;
}

function getChildIndentForParent(parent: ListItemInfo): string {
  const parentWidth = getIndentColumnWidth(parent.indent);
  const markerContentOffset = getMarkerText(parent).length + 1;
  return getIndentByColumn(parentWidth + Math.max(LIST_INDENT_UNIT.length, markerContentOffset));
}

function withIndent(item: ListItemInfo, indent: string): ListItemInfo {
  return {
    ...item,
    level: getLevelFromIndent(indent),
    indent,
    number: item.type === 'ordered' ? 1 : item.number,
  };
}

function findPreviousListItem(
  state: EditorState,
  lineNumber: number,
  quotePrefix: string,
  overrides?: Map<number, ListItemInfo>,
): ListItemInfo | null {
  for (let current = lineNumber - 1; current >= 1; current -= 1) {
    const overridden = overrides?.get(current);
    if (overridden) {
      if ((overridden.quotePrefix ?? '') === quotePrefix) return overridden;
      continue;
    }

    const line = state.doc.line(current);
    if (isBlankLine(line.text)) break;

    const item = parseListItem(line.text, current, line.from);
    if (item && (item.quotePrefix ?? '') === quotePrefix) {
      return item;
    }
  }

  return null;
}

function findOutdentIndent(state: EditorState, item: ListItemInfo): string {
  const currentWidth = getIndentColumnWidth(item.indent);

  for (let current = item.lineNumber - 1; current >= 1; current -= 1) {
    const line = state.doc.line(current);
    if (isBlankLine(line.text)) break;

    const candidate = parseListItem(line.text, current, line.from);
    if (!candidate || (candidate.quotePrefix ?? '') !== (item.quotePrefix ?? '')) continue;

    if (getIndentColumnWidth(candidate.indent) < currentWidth) {
      return candidate.indent;
    }
  }

  return '';
}

function mapListCursorColumn(
  oldItem: ListItemInfo,
  newItem: ListItemInfo,
  newText: string,
  oldColumn: number
): number {
  const oldContentStart = getListContentStartColumn(oldItem);
  const newContentStart = getListContentStartColumn(newItem);

  if (oldColumn <= oldContentStart) {
    return Math.min(newText.length, newContentStart);
  }

  return Math.min(newText.length, newContentStart + (oldColumn - oldContentStart));
}

function dispatchListItemLevelChanges(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  updates: Array<{ item: ListItemInfo; newItem: ListItemInfo; newText: string }>,
  options?: { strictMode?: boolean },
): boolean {
  if (updates.length === 0) return false;

  const updatesByLine = new Map<number, (typeof updates)[number]>();
  const changes = updates.map((update) => {
    const line = state.doc.line(update.item.lineNumber);
    updatesByLine.set(update.item.lineNumber, update);
    return {
      from: line.from,
      to: line.to,
      insert: update.newText,
    };
  });

  const changeSet = state.changes(changes);
  const hasExpandedSelection = state.selection.ranges.some((range) => !range.empty);
  const selection = hasExpandedSelection
    ? undefined
    : EditorSelection.create(
      state.selection.ranges.map((range) => {
        const line = state.doc.lineAt(range.from);
        const update = updatesByLine.get(line.number);
        if (!update) {
          return EditorSelection.cursor(changeSet.mapPos(range.from, 1));
        }

        const newLineFrom = changeSet.mapPos(line.from, 1);
        const oldColumn = range.from - line.from;
        return EditorSelection.cursor(newLineFrom + mapListCursorColumn(
          update.item,
          update.newItem,
          update.newText,
          oldColumn,
        ));
      }),
      state.selection.mainIndex,
    );

  let finalChanges = changeSet;
  let finalSelection = selection;

  if (options?.strictMode) {
    const intermediate = state.update({ changes, selection });
    const normalizationChanges = getStrictOrderedListNormalizationChanges(intermediate.state);
    if (normalizationChanges) {
      const normalizationChangeSet = intermediate.state.changes(normalizationChanges);
      finalChanges = changeSet.compose(normalizationChangeSet);
      finalSelection = (finalSelection ?? intermediate.state.selection).map(normalizationChangeSet);
    }
  }

  dispatch(state.update({
    changes: finalChanges,
    selection: finalSelection,
    scrollIntoView: true,
    userEvent: 'input',
  }));

  return true;
}

// ==================== Enter 处理 ====================

export const handleListEnter: StateCommand = ({ state, dispatch }): boolean => {
  const main = state.selection.main;
  const line = state.doc.lineAt(main.from);
  const item = parseListItem(line.text, line.number, line.from);

  if (!item) return false;

  // 空列表项：退出列表
  if (isEmptyListItem(item) && main.from === line.to) {
    // 移除 marker，回退一级或转为普通行
    if (getIndentColumnWidth(item.indent) > 0) {
      const newItem = withIndent(item, findOutdentIndent(state, item));
      newItem.content = '';
      const next = formatListItem(newItem);
      const selectionColumn = getListContentStartColumn(newItem);
      const initialChanges = { from: line.from, to: line.to, insert: next };
      const initialSelection = EditorSelection.cursor(line.from + selectionColumn);
      const intermediate = state.update({
        changes: initialChanges,
        selection: initialSelection,
      });
      const normalizationChanges = getStrictOrderedListNormalizationChanges(intermediate.state);

      if (!normalizationChanges) {
        dispatch(state.update({
          changes: initialChanges,
          selection: initialSelection,
          scrollIntoView: true,
          userEvent: 'input',
        }));
        return true;
      }

      const normalizationChangeSet = intermediate.state.changes(normalizationChanges);
      dispatch(state.update({
        changes: state.changes(initialChanges).compose(normalizationChangeSet),
        selection: initialSelection.map(normalizationChangeSet),
        scrollIntoView: true,
        userEvent: 'input',
      }));
      return true;
    } else {
      // 转为普通行（引用块内则保留引用前缀）
      const replacement = item.quotePrefix ? item.quotePrefix : '';
      return replaceCurrentLine(state, dispatch, replacement, replacement.length);
    }
  }

  // 有序列表：编号递增
  if (item.type === 'ordered') {
    const nextNumber = (item.number ?? 0) + 1;
    const newItem: ListItemInfo = {
      ...item,
      number: nextNumber,
      content: '',
    };
    const insert = '\n' + formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT);

    dispatch(state.update({
      changes: { from: main.from, insert },
      selection: { anchor: main.from + insert.length },
      scrollIntoView: true,
      userEvent: 'input',
    }));
    return true;
  }

  // 任务列表：保持复选框状态
  if (item.type === 'task') {
    const checkbox = item.checkbox?.toLowerCase() === '[x]' ? '[x]' : '[ ]';
    const newItem: ListItemInfo = {
      ...item,
      checkbox,
      content: '',
    };
    const insert = '\n' + formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT);

    dispatch(state.update({
      changes: { from: main.from, insert },
      selection: { anchor: main.from + insert.length },
      scrollIntoView: true,
      userEvent: 'input',
    }));
    return true;
  }

  // 无序列表
  const newItem: ListItemInfo = {
    ...item,
    content: '',
  };
  const insert = '\n' + formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT);

  dispatch(state.update({
    changes: { from: main.from, insert },
    selection: { anchor: main.from + insert.length },
    scrollIntoView: true,
    userEvent: 'input',
  }));
  return true;
};

// ==================== Backspace 处理 ====================

export const handleListBackspace: StateCommand = ({ state, dispatch }): boolean => {
  const main = state.selection.main;
  if (!main.empty) return false;

  const line = state.doc.lineAt(main.from);
  const item = parseListItem(line.text, line.number, line.from);

  if (!item) return false;

  // 计算 marker 后的边界位置
  const quoteLen = item.quotePrefix?.length ?? 0;
  let markerEnd = line.from + quoteLen + item.indent.length + item.marker.length + 1; // +1 for space

  if (item.type === 'ordered') {
    markerEnd = line.from + quoteLen + item.indent.length + `${item.number}${item.delimiter} `.length;
  } else if (item.type === 'task') {
    markerEnd = line.from + quoteLen + item.indent.length + item.marker.length + 1 + (item.checkbox?.length ?? 3) + 1;
  }

  // 光标不在 marker 边界处，不处理
  if (main.from !== markerEnd) return false;

  // 有缩进时，先减少缩进
  if (getIndentColumnWidth(item.indent) > 0) {
    const newItem = withIndent(item, findOutdentIndent(state, item));
    const removedColumns = getIndentColumnWidth(item.indent) - getIndentColumnWidth(newItem.indent);
    const next = formatListItem(newItem);
    return replaceCurrentLine(state, dispatch, next, markerEnd - line.from - removedColumns);
  }

  // 无缩进时，移除列表 marker
  const plainText = `${item.quotePrefix ?? ''}${item.content}`;
  return replaceCurrentLine(state, dispatch, plainText, (item.quotePrefix?.length ?? 0));
};

// ==================== Tab / Shift-Tab 处理 ====================

export const handleListTab = (options?: { strictMode?: boolean }): StateCommand => {
  return ({ state, dispatch }): boolean => {
    const hasSelection = state.selection.ranges.some(r => !r.empty);
    const items = getSelectedListItems(state);

    // 有列表项被选中
    if (items.length > 0) {
      const updates: Array<{ item: ListItemInfo; newItem: ListItemInfo; newText: string }> = [];
      const plannedItems = new Map<number, ListItemInfo>();

      for (const item of items) {
        const parent = findPreviousListItem(state, item.lineNumber, item.quotePrefix ?? '', plannedItems);
        const nextIndent = parent
          ? getChildIndentForParent(parent)
          : `${item.indent}${LIST_INDENT_UNIT}`;
        const newItem = withIndent(item, nextIndent);
        // Ensure output uses spaces only, replace any tabs with the editor indent unit.
        const formatted = formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT);
        updates.push({ item, newItem, newText: formatted });
        plannedItems.set(item.lineNumber, newItem);
      }

      return dispatchListItemLevelChanges(state, dispatch, updates, { strictMode: options?.strictMode });
    }

    // 普通文本：有选区时按行首缩进，避免整段替换为一段空格
    if (hasSelection) {
      return updateSelectedLinesWithSelectionMap(state, dispatch, (lineText) => `${LIST_INDENT_UNIT}${lineText}`);
    }

    const changes = state.changeByRange(range => ({
      changes: { from: range.from, to: range.to, insert: LIST_INDENT_UNIT },
      range: EditorSelection.cursor(range.from + LIST_INDENT_UNIT.length),
    }));

    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
};

export const handleListShiftTab = (options?: { strictMode?: boolean }): StateCommand => {
  return ({ state, dispatch }): boolean => {
    const items = getSelectedListItems(state);

    // 有列表项被选中
    if (items.length > 0) {
      const updates: Array<{ item: ListItemInfo; newItem: ListItemInfo; newText: string }> = [];

      for (const item of items) {
        if (getIndentColumnWidth(item.indent) === 0) continue; // 无法继续减少缩进

        const newItem = withIndent(item, findOutdentIndent(state, item));
        updates.push({
          item,
          newItem,
          newText: formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT),
        });
      }

      return dispatchListItemLevelChanges(state, dispatch, updates, { strictMode: options?.strictMode });
    }

    // 普通文本：删除缩进
    return updateSelectedLinesWithSelectionMap(state, dispatch, (lineText) => {
      const indent = getLeadingIndent(lineText);
      if (indent.length === 0) return lineText;

      // 删除最多一个缩进单位或一个 tab
      if (indent.startsWith('\t')) {
        return lineText.slice(1);
      }
      const toRemove = Math.min(LIST_INDENT_SIZE, indent.match(/^ */)?.[0].length ?? 0);
      return lineText.slice(toRemove);
    });
  };
};

// ==================== 列表切换命令 ====================

export const toggleUnorderedList: StateCommand = ({ state, dispatch }): boolean => {
  const items = getSelectedListItems(state);

  // 如果选中的都是无序列表，则取消列表
  const allUnordered = items.length > 0 && items.every(i => i.type === 'unordered');

  return updateSelectedLinesWithSelectionMap(state, dispatch, (lineText, { lineNumber }) => {
    const item = parseListItem(lineText, lineNumber, 0);

    if (allUnordered && item?.type === 'unordered') {
      // 取消列表
      return item.content;
    }

    if (item) {
      // 转换为无序列表，保持层级
      const newItem: ListItemInfo = {
        ...item,
        type: 'unordered',
        marker: '-',
      };
      return formatListItem(newItem);
    }

    // 普通文本转为列表
    const indent = getLeadingIndent(lineText);
    return `${indent}- ${lineText.slice(indent.length)}`;
  });
};

export const toggleOrderedList = (options?: { strictMode?: boolean }): StateCommand => {
  return ({ state, dispatch }): boolean => {
    const items = getSelectedListItems(state);

    // 如果选中的都是有序列表，则取消列表
    const allOrdered = items.length > 0 && items.every(i => i.type === 'ordered');

    return updateSelectedLinesWithSelectionMap(
      state,
      dispatch,
      (lineText, { lineNumber }) => {
        const item = parseListItem(lineText, lineNumber, 0);

        if (allOrdered && item?.type === 'ordered') {
          // 取消列表
          return item.content;
        }

        if (item) {
          // 转换为有序列表，保持层级，编号重置为 1
          const newItem: ListItemInfo = {
            ...item,
            type: 'ordered',
            number: 1,
            delimiter: '.',
          };
          return formatListItem(newItem);
        }

        // 普通文本转为列表
        const indent = getLeadingIndent(lineText);
        return `${indent}1. ${lineText.slice(indent.length)}`;
      },
      options?.strictMode ? { normalizeOrderedNumbers: 'document' } : undefined,
    );
  };
};

export const toggleTaskList: StateCommand = ({ state, dispatch }): boolean => {
  const items = getSelectedListItems(state);

  // 如果选中的都是任务列表，则转为无序列表
  const allTask = items.length > 0 && items.every(i => i.type === 'task');

  return updateSelectedLinesWithSelectionMap(state, dispatch, (lineText, { lineNumber }) => {
    const item = parseListItem(lineText, lineNumber, 0);

    if (allTask && item?.type === 'task') {
      // 转为无序列表
      const newItem: ListItemInfo = {
        ...item,
        type: 'unordered',
        marker: item.marker,
      };
      return formatListItem(newItem);
    }

    if (item?.type === 'unordered') {
      // 无序列表转为任务列表
      const newItem: ListItemInfo = {
        ...item,
        type: 'task',
        checkbox: '[ ]',
      };
      return formatListItem(newItem);
    }

    if (item?.type === 'ordered') {
      // 有序列表转为任务列表（转为无序任务列表）
      const newItem: ListItemInfo = {
        ...item,
        type: 'task',
        marker: '-',
        checkbox: '[ ]',
      };
      return formatListItem(newItem);
    }

    // 普通文本转为任务列表
    const indent = getLeadingIndent(lineText);
    return `${indent}- [ ] ${lineText.slice(indent.length)}`;
  });
};

// ==================== 导出命令集合 ====================

export const nestedListCommands = {
  handleListEnter,
  handleListBackspace,
  handleListTab,
  handleListShiftTab,
  toggleUnorderedList,
  toggleOrderedList,
  toggleTaskList,
};

export default nestedListCommands;
