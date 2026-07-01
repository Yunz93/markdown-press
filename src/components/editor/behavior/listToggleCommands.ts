/**
 * List toggle commands (bullet / ordered / task).
 *
 * Extracted from nestedListCommands: these three commands only depend on the
 * line-update helper and the list parser/formatter, so they form a cohesive,
 * self-contained group separate from the Enter/Tab/Backspace editing handlers.
 */

import { type StateCommand } from "@codemirror/state";
import {
  updateSelectedLines as updateSelectedLinesWithSelectionMap,
  getLeadingIndent,
  parseStructuredLine,
} from "./core";
import { buildQuotePrefix } from "./quotes";
import {
  type ListItemInfo,
  parseListItem,
  getSelectedListItems,
  formatListItem,
} from "./nestedListBehavior";

function plainTextFromListItem(item: ListItemInfo): string {
  return `${item.quotePrefix ?? ""}${item.content}`;
}

function listLineFromPlainText(lineText: string, marker: string): string {
  const parsed = parseStructuredLine(lineText);
  const quotePrefix = parsed.quote ? buildQuotePrefix(parsed.quote) : "";
  const contentSource = parsed.quote ? parsed.quote.content : lineText;
  const indent = getLeadingIndent(contentSource);
  return `${quotePrefix}${indent}${marker}${contentSource.slice(indent.length)}`;
}

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
        // 取消列表，保留引用前缀
        return plainTextFromListItem(item);
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

      // 普通文本转为列表（含引用块内文本）
      return listLineFromPlainText(lineText, "- ");
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
          // 取消列表，保留引用前缀
          return plainTextFromListItem(item);
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

        // 普通文本转为列表（含引用块内文本）
        return listLineFromPlainText(lineText, "1. ");
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

      // 普通文本转为任务列表（含引用块内文本）
      return listLineFromPlainText(lineText, "- [ ] ");
    },
  );
};
