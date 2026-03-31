/**
 * 多级列表命令实现
 * 
 * 基于 nestedListBehavior 模块，实现具体的编辑命令
 */

import { EditorSelection, EditorState, type StateCommand, type Transaction } from '@codemirror/state';
import {
  type ListItemInfo,
  type ListType,
  parseListItem,
  getListInfoAtLine,
  getSelectedListItems,
  adjustListItemLevel,
  formatListItem,
  isEmptyListItem,
  findPreviousSiblingItem,
  getStrictOrderedListNormalizationChanges,
  LIST_INDENT_SIZE,
  getIndentFromLevel,
} from './nestedListBehavior';

// ==================== 辅助函数 ====================

function isBlankLine(lineText: string): boolean {
  return /^[ \t]*$/.test(lineText);
}

function getLeadingIndent(lineText: string): string {
  return lineText.match(/^[ \t]*/)![0];
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

function updateSelectedLines(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  transform: (lineText: string, lineNumber: number) => string,
  options?: { renumberOrdered?: boolean }
): boolean {
  const changes: { from: number; to: number; insert: string }[] = [];
  const affectedLines = new Set<number>();

  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(Math.max(range.from, range.to - 1)).number;

    for (let i = startLine; i <= endLine; i++) {
      if (affectedLines.has(i)) continue;
      affectedLines.add(i);

      const line = state.doc.line(i);
      const newText = transform(line.text, i);
      if (newText !== line.text) {
        changes.push({ from: line.from, to: line.to, insert: newText });
      }
    }
  }

  if (changes.length === 0) return false;

  dispatch(state.update({
    changes,
    scrollIntoView: true,
    userEvent: 'input',
  }));

  // 如果需要重新编号，再次 dispatch
  if (options?.renumberOrdered) {
    const renumberChanges = getStrictOrderedListNormalizationChanges(state);
    if (renumberChanges) {
      // 注意：这里需要在新的 state 上操作
    }
  }

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
    if (item.level > 0) {
      const newItem = adjustListItemLevel(item, -1);
      newItem.content = '';
      return replaceCurrentLine(state, dispatch, formatListItem(newItem), newItem.indent.length);
    } else {
      // 转为普通行
      return replaceCurrentLine(state, dispatch, '', 0);
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
    const insert = '\n' + formatListItem(newItem);

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
    const insert = '\n' + formatListItem(newItem);

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
  const insert = '\n' + formatListItem(newItem);

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
  let markerEnd = line.from + item.indent.length + item.marker.length + 1; // +1 for space

  if (item.type === 'ordered') {
    markerEnd = line.from + item.indent.length + `${item.number}${item.delimiter} `.length;
  } else if (item.type === 'task') {
    markerEnd = line.from + item.indent.length + item.marker.length + 1 + (item.checkbox?.length ?? 3) + 1;
  }

  // 光标不在 marker 边界处，不处理
  if (main.from !== markerEnd) return false;

  // 有缩进时，先减少缩进
  if (item.level > 0) {
    const newItem = adjustListItemLevel(item, -1);
    return replaceCurrentLine(state, dispatch, formatListItem(newItem), markerEnd - line.from - LIST_INDENT_SIZE);
  }

  // 无缩进时，移除列表 marker
  const plainText = item.content;
  return replaceCurrentLine(state, dispatch, plainText, 0);
};

// ==================== Tab / Shift-Tab 处理 ====================

export const handleListTab = (options?: { strictMode?: boolean }): StateCommand => {
  return ({ state, dispatch }): boolean => {
    const hasSelection = state.selection.ranges.some(r => !r.empty);
    const items = getSelectedListItems(state);

    // 有列表项被选中
    if (items.length > 0) {
      const changes: { from: number; to: number; insert: string }[] = [];

      for (const item of items) {
        const line = state.doc.line(item.lineNumber);
        const newItem = adjustListItemLevel(item, +1);
        changes.push({
          from: line.from,
          to: line.to,
          insert: formatListItem(newItem),
        });
      }

      dispatch(state.update({
        changes,
        scrollIntoView: true,
        userEvent: 'input',
      }));

      // 严格模式下重新编号
      if (options?.strictMode) {
        setTimeout(() => {
          const renumberChanges = getStrictOrderedListNormalizationChanges(state);
          if (renumberChanges && dispatch) {
            // 需要在新的 dispatch 中处理
          }
        }, 0);
      }

      return true;
    }

    // 普通文本：插入缩进
    const changes = state.changeByRange(range => ({
      changes: { from: range.from, to: range.to, insert: '    ' },
      range: EditorSelection.cursor(range.from + 4),
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
      const changes: { from: number; to: number; insert: string }[] = [];

      for (const item of items) {
        if (item.level === 0) continue; // 无法继续减少缩进

        const line = state.doc.line(item.lineNumber);
        const newItem = adjustListItemLevel(item, -1);
        changes.push({
          from: line.from,
          to: line.to,
          insert: formatListItem(newItem),
        });
      }

      if (changes.length === 0) return false;

      dispatch(state.update({
        changes,
        scrollIntoView: true,
        userEvent: 'input',
      }));

      return true;
    }

    // 普通文本：删除缩进
    return updateSelectedLines(state, dispatch, (lineText) => {
      const indent = getLeadingIndent(lineText);
      if (indent.length === 0) return lineText;

      // 删除最多 4 个空格或一个 tab
      if (indent.startsWith('\t')) {
        return lineText.slice(1);
      }
      const toRemove = Math.min(4, indent.match(/^ */)?.[0].length ?? 0);
      return lineText.slice(toRemove);
    });
  };
};

// ==================== 列表切换命令 ====================

export const toggleUnorderedList: StateCommand = ({ state, dispatch }): boolean => {
  const items = getSelectedListItems(state);

  // 如果选中的都是无序列表，则取消列表
  const allUnordered = items.length > 0 && items.every(i => i.type === 'unordered');

  return updateSelectedLines(state, dispatch, (lineText, lineNumber) => {
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

    const handled = updateSelectedLines(state, dispatch, (lineText, lineNumber) => {
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
    });

    // 严格模式下重新编号
    if (handled && options?.strictMode) {
      const renumberChanges = getStrictOrderedListNormalizationChanges(state);
      if (renumberChanges) {
        dispatch(state.update({
          changes: renumberChanges,
          scrollIntoView: true,
          userEvent: 'input',
        }));
      }
    }

    return handled;
  };
};

export const toggleTaskList: StateCommand = ({ state, dispatch }): boolean => {
  const items = getSelectedListItems(state);

  // 如果选中的都是任务列表，则转为无序列表
  const allTask = items.length > 0 && items.every(i => i.type === 'task');

  return updateSelectedLines(state, dispatch, (lineText, lineNumber) => {
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
