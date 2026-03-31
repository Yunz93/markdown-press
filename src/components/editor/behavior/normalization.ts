/**
 * Markdown Behavior - List Normalization
 * Ordered list renumbering
 */

import type { EditorState, ChangeSpec } from '@codemirror/state';
import {
  parseStructuredLine,
  isBlankLine,
  getIndentColumnWidth,
} from './core';
import { getStrictOrderedListNormalizationChanges as getNewNormalizationChanges } from '../nestedListBehavior';
import { parseListLine, formatListLine } from './lists';
import type { StructuredLine, QuoteInfo, ListInfo } from './core';

function getListDepth(structured: StructuredLine): number {
  if (!structured.list) return 0;
  return ((structured.quote?.depth ?? 0) * 1000) + getIndentColumnWidth(structured.list.indent);
}

function getOrderedContextKey(structured: StructuredLine): string | null {
  if (structured.list?.type !== 'ordered') {
    return null;
  }

  return [
    structured.quote?.depth ?? 0,
    structured.list.indent,
    structured.list.delimiter ?? '.',
  ].join('|');
}

function replaceOrderedNumber(lineText: string, nextNumber: number): string {
  const structured = parseStructuredLine(lineText);
  if (structured.list?.type !== 'ordered') {
    return lineText;
  }

  return formatListLine(structured.quote, structured.list, {
    number: nextNumber,
  });
}

export function getStrictOrderedListNormalizationChanges(state: EditorState): ChangeSpec[] | null {
  // 优先使用新的标准化逻辑
  const newChanges = getNewNormalizationChanges(state);
  if (newChanges && newChanges.length > 0) {
    return newChanges;
  }

  // 回退到旧逻辑
  const changes: ChangeSpec[] = [];
  const stack: Array<{ depth: number; key: string; nextNumber: number }> = [];
  let consecutiveBlankLines = 0;

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const structured = parseStructuredLine(line.text);

    if (structured.isBlank) {
      consecutiveBlankLines++;
      // 两个连续空行才中断列表
      if (consecutiveBlankLines >= 2) {
        stack.length = 0;
      }
      continue;
    }

    consecutiveBlankLines = 0;

    if (!structured.list) {
      stack.length = 0;
      continue;
    }

    const depth = getListDepth(structured);

    while (stack.length > 0 && stack[stack.length - 1].depth > depth) {
      stack.pop();
    }

    if (structured.list.type !== 'ordered') {
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      continue;
    }

    const contextKey = getOrderedContextKey(structured);
    if (!contextKey) {
      continue;
    }

    while (
      stack.length > 0 &&
      stack[stack.length - 1].depth === depth &&
      stack[stack.length - 1].key !== contextKey
    ) {
      stack.pop();
    }

    const top = stack[stack.length - 1];
    let nextNumber = 1;

    if (top && top.depth === depth && top.key === contextKey) {
      top.nextNumber += 1;
      nextNumber = top.nextNumber;
    } else {
      stack.push({ depth, key: contextKey, nextNumber: 1 });
    }

    const normalized = replaceOrderedNumber(line.text, nextNumber);
    if (normalized !== line.text) {
      changes.push({
        from: line.from,
        to: line.to,
        insert: normalized,
      });
    }
  }

  return changes.length > 0 ? changes : null;
}
