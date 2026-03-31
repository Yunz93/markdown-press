/**
 * Markdown Behavior - List Handling (Legacy Compatibility)
 * Wraps the new nested list modules with legacy ListInfo format
 */

import {
  parseListItem,
  formatListItem,
} from '../nestedListBehavior';
import type { ListInfo } from './core';

// 将新的 ListItemInfo 转换为旧的 ListInfo 格式
function convertToLegacyListInfo(item: ReturnType<typeof parseListItem>): ListInfo | null {
  if (!item) return null;
  return {
    type: item.type,
    indent: item.indent,
    marker: item.marker,
    content: item.content,
    number: item.number,
    delimiter: item.delimiter,
    checkbox: item.checkbox,
  };
}

// 从旧版 parseListLine 迁移到新版 parseListItem
export function parseListLine(lineText: string): ListInfo | null {
  // 使用新的解析器
  const item = parseListItem(lineText, 0, 0);
  return convertToLegacyListInfo(item);
}

export function formatListLine(
  quote: { indent: string; depth: number; spacedStyle: boolean } | null,
  list: ListInfo,
  overrides: Partial<ListInfo> = {}
): string {
  const nextList = { ...list, ...overrides };
  // 确保内容没有前导空格，避免格式化后出现多余空格
  const content = nextList.content.trimStart();
  const quotePrefix = quote
    ? `${quote.indent}${quote.spacedStyle ? '> '.repeat(quote.depth) : '>'.repeat(quote.depth) + ' '}`
    : '';

  if (nextList.type === 'ordered') {
    return `${quotePrefix}${nextList.indent}${nextList.number ?? 1}${nextList.delimiter ?? '.'} ${content}`;
  }

  if (nextList.type === 'task') {
    const checkbox = nextList.checkbox ?? '[ ]';
    return `${quotePrefix}${nextList.indent}${nextList.marker} ${checkbox} ${content}`;
  }

  return `${quotePrefix}${nextList.indent}${nextList.marker} ${content}`;
}
