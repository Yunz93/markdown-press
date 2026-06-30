/**
 * 多级列表命令实现
 *
 * 基于 nestedListBehavior 模块，实现具体的编辑命令
 */

import {
  EditorSelection,
  EditorState,
  type StateCommand,
  type Transaction,
} from "@codemirror/state";
import {
  updateSelectedLines as updateSelectedLinesWithSelectionMap,
  isBlankLine,
  getLeadingIndent,
} from "./core";
import {
  type ListItemInfo,
  type ListType,
  parseListItem,
  getListInfoAtLine,
  getSelectedListItems,
  formatListItem,
  formatOrderedMarkerValue,
  isEmptyListItem,
  findPreviousSiblingItem,
  getStrictOrderedListNormalizationChanges,
  getOrderedListParentForContinuation,
  LIST_INDENT_SIZE,
  LIST_INDENT_UNIT,
  getLevelFromIndent,
  getIndentColumnWidth,
} from "./nestedListBehavior";

// ==================== 辅助函数 ====================

function getMarkerText(item: ListItemInfo): string {
  if (item.type === "ordered") {
    return formatOrderedMarkerValue(
      item.number ?? 1,
      item.markerStyle ?? "decimal",
      item.delimiter ?? ".",
    );
  }

  if (item.type === "task") {
    return `${item.marker} ${item.checkbox ?? "[ ]"}`;
  }

  return item.marker;
}

function getIndentByColumn(width: number): string {
  return " ".repeat(Math.max(0, width));
}

function replaceCurrentLine(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  newText: string,
  cursorColumn?: number,
): boolean {
  const line = state.doc.lineAt(state.selection.main.from);
  const column = cursorColumn ?? state.selection.main.from - line.from;
  const newColumn = Math.min(newText.length, column);

  dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert: newText },
      selection: { anchor: line.from + newColumn },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
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
  return getIndentByColumn(
    parentWidth + Math.max(LIST_INDENT_UNIT.length, markerContentOffset),
  );
}

function withIndent(
  item: ListItemInfo,
  indent: string,
  options?: { markerStyle?: ListItemInfo["markerStyle"] },
): ListItemInfo {
  return {
    ...item,
    level: getLevelFromIndent(indent),
    indent,
    number: item.type === "ordered" ? 1 : item.number,
    markerStyle:
      item.type === "ordered"
        ? (options?.markerStyle ?? item.markerStyle)
        : item.markerStyle,
  };
}

/**
 * 在 parent 之下、当前行之上查找已存在的「parent 直接子项」缩进，
 * 用于多个兄弟项之间保持一致缩进（避免 3 空格子项与 4 空格 marker-aware 缩进混用）。
 */
function findExistingChildIndentUnderParent(
  state: EditorState,
  parent: ListItemInfo,
  currentLineNumber: number,
): string | null {
  const parentWidth = getIndentColumnWidth(parent.indent);
  for (let i = parent.lineNumber + 1; i < currentLineNumber; i += 1) {
    const line = state.doc.line(i);
    if (isBlankLine(line.text)) continue;

    const it = parseListItem(line.text, i, line.from);
    if (!it) continue;
    if ((it.quotePrefix ?? "") !== (parent.quotePrefix ?? "")) continue;

    const w = getIndentColumnWidth(it.indent);
    if (w <= parentWidth) break; // 回到 parent 同级或更浅，停止
    return it.indent; // 第一个比 parent 更深的项就是 parent 的直接子级
  }
  return null;
}

/**
 * 查找用于 Tab 缩进嵌套的「上一项」父级。
 * 必须跳过比当前行更深的列表行（否则顶格续行会误挂到上一项的子列表下）。
 */
function findPreviousListItem(
  state: EditorState,
  lineNumber: number,
  quotePrefix: string,
  overrides: Map<number, ListItemInfo> | undefined,
  currentIndentColumnWidth: number,
): ListItemInfo | null {
  for (let current = lineNumber - 1; current >= 1; current -= 1) {
    const overridden = overrides?.get(current);
    if (overridden) {
      if ((overridden.quotePrefix ?? "") === quotePrefix) {
        if (
          getIndentColumnWidth(overridden.indent) > currentIndentColumnWidth
        ) {
          continue;
        }
        return overridden;
      }
      continue;
    }

    const line = state.doc.line(current);
    if (isBlankLine(line.text)) break;

    const item = parseListItem(line.text, current, line.from);
    if (item && (item.quotePrefix ?? "") === quotePrefix) {
      if (getIndentColumnWidth(item.indent) > currentIndentColumnWidth) {
        continue;
      }
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
    if (
      !candidate ||
      (candidate.quotePrefix ?? "") !== (item.quotePrefix ?? "")
    )
      continue;

    if (getIndentColumnWidth(candidate.indent) < currentWidth) {
      return candidate.indent;
    }
  }

  return "";
}

function getOutdentedOrderedItem(
  state: EditorState,
  item: ListItemInfo,
  indent: string,
): ListItemInfo {
  if (item.type !== "ordered") {
    return withIndent(item, indent);
  }

  const targetWidth = getIndentColumnWidth(indent);
  for (let current = item.lineNumber - 1; current >= 1; current -= 1) {
    const line = state.doc.line(current);
    if (isBlankLine(line.text)) break;

    const candidate = parseListItem(line.text, current, line.from);
    if (
      !candidate ||
      (candidate.quotePrefix ?? "") !== (item.quotePrefix ?? "")
    )
      continue;

    const candidateWidth = getIndentColumnWidth(candidate.indent);
    if (candidateWidth < targetWidth) {
      break;
    }

    if (candidate.type === "ordered" && candidateWidth === targetWidth) {
      return {
        ...withIndent(item, indent, {
          markerStyle: candidate.markerStyle ?? "decimal",
        }),
        number: (candidate.number ?? 0) + 1,
        delimiter: candidate.delimiter ?? item.delimiter,
      };
    }
  }

  return withIndent(item, indent);
}

function mapListCursorColumn(
  oldItem: ListItemInfo,
  newItem: ListItemInfo,
  newText: string,
  oldColumn: number,
): number {
  const oldContentStart = getListContentStartColumn(oldItem);
  const newContentStart = getListContentStartColumn(newItem);

  if (oldColumn <= oldContentStart) {
    return Math.min(newText.length, newContentStart);
  }

  return Math.min(
    newText.length,
    newContentStart + (oldColumn - oldContentStart),
  );
}

function dispatchListItemLevelChanges(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  updates: Array<{
    item: ListItemInfo;
    newItem: ListItemInfo;
    newText: string;
  }>,
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
  const hasExpandedSelection = state.selection.ranges.some(
    (range) => !range.empty,
  );
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
          return EditorSelection.cursor(
            newLineFrom +
              mapListCursorColumn(
                update.item,
                update.newItem,
                update.newText,
                oldColumn,
              ),
          );
        }),
        state.selection.mainIndex,
      );

  let finalChanges = changeSet;
  let finalSelection = selection;

  if (options?.strictMode) {
    const intermediate = state.update({ changes, selection });
    const normalizationChanges = getStrictOrderedListNormalizationChanges(
      intermediate.state,
    );
    if (normalizationChanges) {
      const normalizationChangeSet =
        intermediate.state.changes(normalizationChanges);
      finalChanges = changeSet.compose(normalizationChangeSet);
      finalSelection = (finalSelection ?? intermediate.state.selection).map(
        normalizationChangeSet,
      );
    }
  }

  dispatch(
    state.update({
      changes: finalChanges,
      selection: finalSelection,
      scrollIntoView: true,
      userEvent: "input",
    }),
  );

  return true;
}

function indentSelectedLine(lineText: string): string {
  return `${LIST_INDENT_UNIT}${lineText}`;
}

function outdentSelectedLine(
  state: EditorState,
  lineText: string,
  lineNumber: number,
): string {
  const item = parseListItem(lineText, lineNumber, 0);
  if (item) {
    if (getIndentColumnWidth(item.indent) === 0) {
      return `${item.quotePrefix ?? ""}${item.content}`;
    }

    const newItem = getOutdentedOrderedItem(
      state,
      item,
      findOutdentIndent(state, item),
    );
    return formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT);
  }

  const indent = getLeadingIndent(lineText);
  if (indent.length === 0) return lineText;

  // 删除最多一个缩进单位或一个 tab
  if (indent.startsWith("\t")) {
    return lineText.slice(1);
  }
  const toRemove = Math.min(
    LIST_INDENT_SIZE,
    indent.match(/^ */)?.[0].length ?? 0,
  );
  return lineText.slice(toRemove);
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
      const newItem = getOutdentedOrderedItem(
        state,
        item,
        findOutdentIndent(state, item),
      );
      newItem.content = "";
      const next = formatListItem(newItem);
      const selectionColumn = getListContentStartColumn(newItem);
      const initialChanges = { from: line.from, to: line.to, insert: next };
      const initialSelection = EditorSelection.cursor(
        line.from + selectionColumn,
      );
      const intermediate = state.update({
        changes: initialChanges,
        selection: initialSelection,
      });
      const normalizationChanges = getStrictOrderedListNormalizationChanges(
        intermediate.state,
      );

      if (!normalizationChanges) {
        dispatch(
          state.update({
            changes: initialChanges,
            selection: initialSelection,
            scrollIntoView: true,
            userEvent: "input",
          }),
        );
        return true;
      }

      const normalizationChangeSet =
        intermediate.state.changes(normalizationChanges);
      dispatch(
        state.update({
          changes: state
            .changes(initialChanges)
            .compose(normalizationChangeSet),
          selection: initialSelection.map(normalizationChangeSet),
          scrollIntoView: true,
          userEvent: "input",
        }),
      );
      return true;
    } else {
      // 转为普通行（引用块内则保留引用前缀）
      const replacement = item.quotePrefix ? item.quotePrefix : "";
      return replaceCurrentLine(
        state,
        dispatch,
        replacement,
        replacement.length,
      );
    }
  }

  // 有序列表：编号递增
  if (item.type === "ordered") {
    const nextNumber = (item.number ?? 0) + 1;
    const newItem: ListItemInfo = {
      ...item,
      number: nextNumber,
      content: "",
    };
    const insert =
      "\n" + formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT);

    dispatch(
      state.update({
        changes: { from: main.from, insert },
        selection: { anchor: main.from + insert.length },
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  }

  // 任务列表：保持复选框状态
  if (item.type === "task") {
    const checkbox = item.checkbox?.toLowerCase() === "[x]" ? "[x]" : "[ ]";
    const newItem: ListItemInfo = {
      ...item,
      checkbox,
      content: "",
    };
    const insert =
      "\n" + formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT);

    dispatch(
      state.update({
        changes: { from: main.from, insert },
        selection: { anchor: main.from + insert.length },
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  }

  // 无序列表
  const newItem: ListItemInfo = {
    ...item,
    content: "",
  };
  const insert =
    "\n" + formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT);

  dispatch(
    state.update({
      changes: { from: main.from, insert },
      selection: { anchor: main.from + insert.length },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

/** 在有序列表项的缩进延续段末尾按 Enter：插入下一项（避免落入默认 Markdown 续行并错误插入 `1.`） */
export const handleOrderedListContinuationEnter: StateCommand = ({
  state,
  dispatch,
}) => {
  const main = state.selection.main;
  if (!main.empty) return false;

  const line = state.doc.lineAt(main.from);
  if (main.from !== line.to) return false;

  const parent = getOrderedListParentForContinuation(state, line.number);
  if (!parent) return false;

  const newItem: ListItemInfo = {
    ...parent,
    number: (parent.number ?? 1) + 1,
    content: "",
  };
  const insert =
    "\n" + formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT);

  dispatch(
    state.update({
      changes: { from: main.from, insert },
      selection: { anchor: main.from + insert.length },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

// ==================== Backspace 处理 ====================

/** 在同一事务内将「行替换 + strict normalize」合并 dispatch，避免出现瞬时的重复编号 */
function dispatchLineReplacementWithNormalize(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  line: { from: number; to: number },
  newText: string,
  cursorAnchor: number,
  options?: { strictMode?: boolean },
): boolean {
  const baseChanges = { from: line.from, to: line.to, insert: newText };
  if (!options?.strictMode) {
    dispatch(
      state.update({
        changes: baseChanges,
        selection: { anchor: cursorAnchor },
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  }

  const baseChangeSet = state.changes(baseChanges);
  const intermediate = state.update({ changes: baseChanges });
  const normalizationChanges = getStrictOrderedListNormalizationChanges(
    intermediate.state,
  );
  if (!normalizationChanges) {
    dispatch(
      state.update({
        changes: baseChanges,
        selection: { anchor: cursorAnchor },
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  }

  const normalizationChangeSet =
    intermediate.state.changes(normalizationChanges);
  const composedChanges = baseChangeSet.compose(normalizationChangeSet);
  const mappedAnchor = normalizationChangeSet.mapPos(cursorAnchor, 1);
  dispatch(
    state.update({
      changes: composedChanges,
      selection: { anchor: mappedAnchor },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

export const createHandleListBackspace = (options?: {
  strictMode?: boolean;
}): StateCommand => {
  return ({ state, dispatch }): boolean => {
    const main = state.selection.main;
    if (!main.empty) return false;

    const line = state.doc.lineAt(main.from);
    const item = parseListItem(line.text, line.number, line.from);

    if (!item) return false;

    // 计算 marker 后的边界位置
    const quoteLen = item.quotePrefix?.length ?? 0;
    let markerEnd =
      line.from + quoteLen + item.indent.length + item.marker.length + 1;

    if (item.type === "ordered") {
      const seg = formatOrderedMarkerValue(
        item.number ?? 1,
        item.markerStyle ?? "decimal",
        item.delimiter ?? ".",
      );
      markerEnd = line.from + quoteLen + item.indent.length + seg.length + 1;
    } else if (item.type === "task") {
      markerEnd =
        line.from +
        quoteLen +
        item.indent.length +
        item.marker.length +
        1 +
        (item.checkbox?.length ?? 3) +
        1;
    }

    // 光标不在 marker 边界处，不处理
    if (main.from !== markerEnd) return false;

    // 有缩进时，先减少缩进
    if (getIndentColumnWidth(item.indent) > 0) {
      const newItem = withIndent(item, findOutdentIndent(state, item));
      const removedColumns =
        getIndentColumnWidth(item.indent) -
        getIndentColumnWidth(newItem.indent);
      const next = formatListItem(newItem);
      const cursorAnchor = line.from + (markerEnd - line.from - removedColumns);
      return dispatchLineReplacementWithNormalize(
        state,
        dispatch,
        { from: line.from, to: line.to },
        next,
        cursorAnchor,
        options,
      );
    }

    // 无缩进时，移除列表 marker
    const plainText = `${item.quotePrefix ?? ""}${item.content}`;
    const cursorAnchor = line.from + (item.quotePrefix?.length ?? 0);
    return dispatchLineReplacementWithNormalize(
      state,
      dispatch,
      { from: line.from, to: line.to },
      plainText,
      cursorAnchor,
      options,
    );
  };
};

/** 默认 strict 模式以匹配主键绑定；调用方可通过 createHandleListBackspace 自定义 */
export const handleListBackspace: StateCommand = (cmdArg) =>
  createHandleListBackspace({ strictMode: true })(cmdArg);

// ==================== Tab / Shift-Tab 处理 ====================

export const handleListTab = (options?: {
  strictMode?: boolean;
}): StateCommand => {
  return ({ state, dispatch }): boolean => {
    const hasSelection = state.selection.ranges.some((r) => !r.empty);
    if (hasSelection) {
      return updateSelectedLinesWithSelectionMap(
        state,
        dispatch,
        indentSelectedLine,
      );
    }

    const items = getSelectedListItems(state);

    // 有列表项被选中
    if (items.length > 0) {
      const updates: Array<{
        item: ListItemInfo;
        newItem: ListItemInfo;
        newText: string;
      }> = [];
      const plannedItems = new Map<number, ListItemInfo>();

      for (const item of items) {
        const currentWidth = getIndentColumnWidth(item.indent);
        const parent = findPreviousListItem(
          state,
          item.lineNumber,
          item.quotePrefix ?? "",
          plannedItems,
          currentWidth,
        );

        let nextIndent: string;
        if (parent) {
          // 优先复用 parent 下已有子项的缩进，让兄弟项视觉对齐
          const existingChildIndent = findExistingChildIndentUnderParent(
            state,
            parent,
            item.lineNumber,
          );
          const proposed = getChildIndentForParent(parent);

          if (
            existingChildIndent !== null &&
            getIndentColumnWidth(existingChildIndent) > currentWidth
          ) {
            nextIndent = existingChildIndent;
          } else if (getIndentColumnWidth(proposed) > currentWidth) {
            nextIndent = proposed;
          } else {
            // 已经处于该父级子列范围内（多次 Tab），在当前缩进上再加深一级
            nextIndent = `${item.indent}${LIST_INDENT_UNIT}`;
          }
        } else {
          nextIndent = `${item.indent}${LIST_INDENT_UNIT}`;
        }

        // markerStyle 继承策略：仅当 (父级是 ordered) 且 (当前子项内容为空)
        // 才把子项 marker 对齐父级。这样既能修正 `1. \na. ` 这类陈旧字母标记，
        // 也能尊重用户在非空项里显式选择的 markerStyle。
        const inheritParentStyle =
          parent?.type === "ordered" &&
          item.type === "ordered" &&
          item.content.trim() === "";
        const newItem = withIndent(item, nextIndent, {
          markerStyle: inheritParentStyle
            ? (parent!.markerStyle ?? "decimal")
            : undefined,
        });
        // Ensure output uses spaces only, replace any tabs with the editor indent unit.
        const formatted = formatListItem(newItem).replace(
          /\t/g,
          LIST_INDENT_UNIT,
        );
        updates.push({ item, newItem, newText: formatted });
        plannedItems.set(item.lineNumber, newItem);
      }

      return dispatchListItemLevelChanges(state, dispatch, updates, {
        strictMode: options?.strictMode,
      });
    }

    const changes = state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: LIST_INDENT_UNIT },
      range: EditorSelection.cursor(range.from + LIST_INDENT_UNIT.length),
    }));

    dispatch(
      state.update(changes, { scrollIntoView: true, userEvent: "input" }),
    );
    return true;
  };
};

export const handleListShiftTab = (options?: {
  strictMode?: boolean;
}): StateCommand => {
  return ({ state, dispatch }): boolean => {
    const hasSelection = state.selection.ranges.some((r) => !r.empty);
    if (hasSelection) {
      return updateSelectedLinesWithSelectionMap(
        state,
        dispatch,
        (lineText, { lineNumber }) =>
          outdentSelectedLine(state, lineText, lineNumber),
        options?.strictMode
          ? { normalizeOrderedNumbers: "document" }
          : undefined,
      );
    }

    const items = getSelectedListItems(state);

    // 有列表项被选中
    if (items.length > 0) {
      const updates: Array<{
        item: ListItemInfo;
        newItem: ListItemInfo;
        newText: string;
      }> = [];

      for (const item of items) {
        if (getIndentColumnWidth(item.indent) === 0) {
          return replaceCurrentLine(
            state,
            dispatch,
            `${item.quotePrefix ?? ""}${item.content}`,
            item.quotePrefix?.length ?? 0,
          );
        }

        const newItem = getOutdentedOrderedItem(
          state,
          item,
          findOutdentIndent(state, item),
        );
        updates.push({
          item,
          newItem,
          newText: formatListItem(newItem).replace(/\t/g, LIST_INDENT_UNIT),
        });
      }

      return dispatchListItemLevelChanges(state, dispatch, updates, {
        strictMode: options?.strictMode,
      });
    }

    // 普通文本：删除缩进
    return updateSelectedLinesWithSelectionMap(
      state,
      dispatch,
      (lineText, { lineNumber }) =>
        outdentSelectedLine(state, lineText, lineNumber),
    );
  };
};

// ==================== 列表切换命令 ====================

export const toggleUnorderedList: StateCommand = ({
  state,
  dispatch,
}): boolean => {
  const items = getSelectedListItems(state);

  // 如果选中的都是无序列表，则取消列表
  const allUnordered =
    items.length > 0 && items.every((i) => i.type === "unordered");

  return updateSelectedLinesWithSelectionMap(
    state,
    dispatch,
    (lineText, { lineNumber }) => {
      const item = parseListItem(lineText, lineNumber, 0);

      if (allUnordered && item?.type === "unordered") {
        // 取消列表
        return item.content;
      }

      if (item) {
        // 转换为无序列表，保持层级
        const newItem: ListItemInfo = {
          ...item,
          type: "unordered",
          marker: "-",
        };
        return formatListItem(newItem);
      }

      // 普通文本转为列表
      const indent = getLeadingIndent(lineText);
      return `${indent}- ${lineText.slice(indent.length)}`;
    },
  );
};

export const toggleOrderedList = (options?: {
  strictMode?: boolean;
}): StateCommand => {
  return ({ state, dispatch }): boolean => {
    const items = getSelectedListItems(state);

    // 如果选中的都是有序列表，则取消列表
    const allOrdered =
      items.length > 0 && items.every((i) => i.type === "ordered");

    return updateSelectedLinesWithSelectionMap(
      state,
      dispatch,
      (lineText, { lineNumber }) => {
        const item = parseListItem(lineText, lineNumber, 0);

        if (allOrdered && item?.type === "ordered") {
          // 取消列表
          return item.content;
        }

        if (item) {
          // 转换为有序列表，保持层级，编号重置为 1
          const newItem: ListItemInfo = {
            ...item,
            type: "ordered",
            number: 1,
            markerStyle: "decimal",
            delimiter: ".",
          };
          return formatListItem(newItem);
        }

        // 普通文本转为列表
        const indent = getLeadingIndent(lineText);
        return `${indent}1. ${lineText.slice(indent.length)}`;
      },
      options?.strictMode ? { normalizeOrderedNumbers: "document" } : undefined,
    );
  };
};

export const toggleTaskList: StateCommand = ({ state, dispatch }): boolean => {
  const items = getSelectedListItems(state);

  // 如果选中的都是任务列表，则转为无序列表
  const allTask = items.length > 0 && items.every((i) => i.type === "task");

  return updateSelectedLinesWithSelectionMap(
    state,
    dispatch,
    (lineText, { lineNumber }) => {
      const item = parseListItem(lineText, lineNumber, 0);

      if (allTask && item?.type === "task") {
        // 转为无序列表
        const newItem: ListItemInfo = {
          ...item,
          type: "unordered",
          marker: item.marker,
        };
        return formatListItem(newItem);
      }

      if (item?.type === "unordered") {
        // 无序列表转为任务列表
        const newItem: ListItemInfo = {
          ...item,
          type: "task",
          checkbox: "[ ]",
        };
        return formatListItem(newItem);
      }

      if (item?.type === "ordered") {
        // 有序列表转为任务列表（转为无序任务列表）
        const newItem: ListItemInfo = {
          ...item,
          type: "task",
          marker: "-",
          checkbox: "[ ]",
        };
        return formatListItem(newItem);
      }

      // 普通文本转为任务列表
      const indent = getLeadingIndent(lineText);
      return `${indent}- [ ] ${lineText.slice(indent.length)}`;
    },
  );
};

// ==================== 导出命令集合 ====================

export const nestedListCommands = {
  handleListEnter,
  handleOrderedListContinuationEnter,
  handleListBackspace,
  handleListTab,
  handleListShiftTab,
  toggleUnorderedList,
  toggleOrderedList,
  toggleTaskList,
};

export default nestedListCommands;
