/**
 * 多级列表行为处理模块
 * 
 * 设计原则：
 * 1. 层级由缩进决定，每级 4 空格
 * 2. 有序列表编号按层级独立计算
 * 3. Tab/Shift-Tab 调整缩进并重新计算编号
 * 4. Enter 续写保持当前层级
 * 5. 严格模式：自动修复整个文档的编号连续性
 * 
 * 层级定义：
 * - Level 0: 无缩进 (column 0)
 * - Level 1: 4 空格 (column 4)
 * - Level 2: 8 空格 (column 8)
 * ...以此类推
 */

import { EditorState, type ChangeSpec, type Transaction } from '@codemirror/state';
import { type EditorView } from '@codemirror/view';
import {
  getIndentColumnWidth as getIndentColumnWidthFromCore,
  getLevelFromIndent as getLevelFromIndentFromCore,
  getIndentFromLevel as getIndentFromLevelFromCore,
} from './behavior/core';

export const LIST_INDENT_UNIT = '    ';
export const LIST_INDENT_SIZE = 4;

// 列表类型定义
export type ListType = 'unordered' | 'ordered' | 'task';

export interface ListItemInfo {
  type: ListType;
  level: number;           // 层级 (0, 1, 2, ...)
  indent: string;          // 前导空格
  marker: string;          // -, *, +, 1., 2), 等
  content: string;         // 内容部分
  number?: number;         // 有序列表编号
  delimiter?: string;      // . 或 )
  checkbox?: string;       // [ ], [x], [X]
  lineNumber: number;      // 行号
  startPos: number;        // 行起始位置
}

export interface ListContext {
  parentLevel: number;     // 父级层级
  listType: ListType;      // 列表类型
  startNumber: number;     // 起始编号
}

/**
 * 计算缩进对应的层级
 * 优先使用 core.ts 的实现以保持一致性
 */
export function getLevelFromIndent(indent: string, tabSize: number = LIST_INDENT_SIZE): number {
  return getLevelFromIndentFromCore(indent, tabSize);
}

/**
 * 根据层级生成缩进
 * 优先使用 core.ts 的实现以保持一致性
 */
export function getIndentFromLevel(level: number, tabSize: number = LIST_INDENT_SIZE): string {
  return getIndentFromLevelFromCore(level, tabSize);
}

/**
 * 解析有序列表标记（支持阿拉伯数字、字母、罗马数字）
 * 返回解析出的序号值和分隔符
 */
function parseOrderedListMarker(markerText: string): { value: number; delimiter: string } | null {
  // 阿拉伯数字: 1., 2), etc.
  const arabicMatch = markerText.match(/^(\d+)([.)])$/);
  if (arabicMatch) {
    return { value: parseInt(arabicMatch[1], 10), delimiter: arabicMatch[2] };
  }
  
  // 小写字母: a., b), etc. (a=1, b=2, ...)
  const lowerAlphaMatch = markerText.match(/^([a-z])([.)])$/i);
  if (lowerAlphaMatch) {
    const charCode = lowerAlphaMatch[1].toLowerCase().charCodeAt(0) - 96; // 'a' = 97, so 97-96=1
    if (charCode >= 1 && charCode <= 26) {
      return { value: charCode, delimiter: lowerAlphaMatch[2] };
    }
  }
  
  // 罗马数字: i., ii), iv., etc.
  const romanMatch = markerText.match(/^([ivxlcdm]+)([.)])$/i);
  if (romanMatch) {
    const romanValue = parseRomanNumeral(romanMatch[1]);
    if (romanValue > 0) {
      return { value: romanValue, delimiter: romanMatch[2] };
    }
  }
  
  return null;
}

/**
 * 解析罗马数字字符串为数值
 */
function parseRomanNumeral(roman: string): number {
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  let prev = 0;
  
  for (let i = roman.length - 1; i >= 0; i--) {
    const current = values[roman[i].toLowerCase()] || 0;
    if (current < prev) {
      total -= current;
    } else {
      total += current;
      prev = current;
    }
  }
  
  return total;
}

/**
 * 解析单行列表项
 * 使用与 behavior/core.ts 一致的正则表达式
 * 扩展支持字母和罗马数字的有序列表
 */
export function parseListItem(lineText: string, lineNumber: number, startPos: number): ListItemInfo | null {
  // 导入 core.ts 的正则以确保一致性
  const TASK_LIST_REGEX = /^([ \t]*)([-+*]) (\[[ xX]\])(?: (.*)|$)$/;
  // 扩展有序列表正则：支持 1., a., i., I. 等格式
  const ORDERED_LIST_REGEX = /^([ \t]*)(\d+|[a-z]|[ivxlcdm]+)([.)]) (.*)$/i;
  const UNORDERED_LIST_REGEX = /^([ \t]*)([-+*]) (.*)$/;
  
  // 任务列表: - [ ] content 或 * [x] content
  const taskMatch = lineText.match(TASK_LIST_REGEX);
  if (taskMatch) {
    const [, indent, marker, checkbox, content = ''] = taskMatch;
    return {
      type: 'task',
      level: getLevelFromIndent(indent),
      indent,
      marker,
      content: content.trimStart(),
      checkbox,
      lineNumber,
      startPos,
    };
  }

  // 有序列表: 支持 1., a., i., I. 等格式，统一转换为阿拉伯数字
  const orderedMatch = lineText.match(ORDERED_LIST_REGEX);
  if (orderedMatch) {
    const [, indent, markerPart, delimiter, content] = orderedMatch;
    const markerInfo = parseOrderedListMarker(`${markerPart}${delimiter}`);
    if (markerInfo) {
      return {
        type: 'ordered',
        level: getLevelFromIndent(indent),
        indent,
        marker: `${markerInfo.value}${markerInfo.delimiter}`, // 统一使用阿拉伯数字格式
        content: content.trimStart(),
        number: markerInfo.value,
        delimiter: markerInfo.delimiter,
        lineNumber,
        startPos,
      };
    }
  }

  // 无序列表: - content 或 * content 或 + content
  const unorderedMatch = lineText.match(UNORDERED_LIST_REGEX);
  if (unorderedMatch) {
    const [, indent, marker, content] = unorderedMatch;
    return {
      type: 'unordered',
      level: getLevelFromIndent(indent),
      indent,
      marker,
      content: content.trimStart(),
      lineNumber,
      startPos,
    };
  }

  return null;
}

/**
 * 判断是否为空白行
 * 使用与 behavior/core.ts 一致的正则
 */
function isBlankLine(lineText: string): boolean {
  const EMPTY_LINE_REGEX = /^[ \t]*$/;
  return EMPTY_LINE_REGEX.test(lineText);
}

/**
 * 构建列表层级上下文
 * 分析文档中每个列表项的父级关系
 * 
 * 注意：根据 CommonMark 规范，列表中的空行不应该中断列表
 * 只有当空行后的内容缩进不足以构成列表延续时才中断
 */
export function buildListHierarchy(doc: EditorState['doc']): Map<number, ListContext> {
  const hierarchy = new Map<number, ListContext>();
  const stack: Array<{ level: number; type: ListType; lineNumber: number }> = [];
  let lastNonBlankLine = 0;
  let consecutiveBlankLines = 0;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const item = parseListItem(line.text, i, line.from);

    if (!item) {
      if (isBlankLine(line.text)) {
        consecutiveBlankLines++;
        // 两个连续空行才中断列表（段落分隔）
        if (consecutiveBlankLines >= 2) {
          stack.length = 0;
        }
      } else {
        // 非列表行且非空行，中断列表
        stack.length = 0;
        consecutiveBlankLines = 0;
      }
      continue;
    }

    // 是列表项
    consecutiveBlankLines = 0;
    lastNonBlankLine = i;

    // 找到当前项的父级
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    hierarchy.set(i, {
      parentLevel: parent?.level ?? -1,
      listType: item.type,
      startNumber: 1,
    });

    stack.push({ level: item.level, type: item.type, lineNumber: i });
  }

  return hierarchy;
}

/**
 * 计算有序列表的标准化编号
 * 严格模式：每个层级独立计数
 * 
 * 注意：根据 CommonMark 规范，列表中的空行不应该中断列表编号
 */
export function calculateOrderedListNumbers(
  state: EditorState,
  changes?: ChangeSpec[]
): Map<number, number> {
  const numbers = new Map<number, number>();
  const counters = new Map<string, number>(); // key: "parentLine:type:level"
  let consecutiveBlankLines = 0;

  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const item = parseListItem(line.text, i, line.from);

    if (!item || item.type !== 'ordered') {
      if (isBlankLine(line.text)) {
        consecutiveBlankLines++;
        // 两个连续空行才清空计数器
        if (consecutiveBlankLines >= 2) {
          counters.clear();
        }
      } else {
        // 非列表行且非空行，清空计数器
        counters.clear();
        consecutiveBlankLines = 0;
      }
      continue;
    }

    // 是有序列表项
    consecutiveBlankLines = 0;

    // 构建计数器 key: 基于父级上下文
    const parentKey = findParentCounterKey(state, i, item.level);
    const key = `${parentKey}:${item.level}`;

    const current = (counters.get(key) ?? 0) + 1;
    counters.set(key, current);
    numbers.set(i, current);
  }

  return numbers;
}

/**
 * 查找父级计数器 key
 */
function findParentCounterKey(state: EditorState, lineNumber: number, level: number): string {
  for (let i = lineNumber - 1; i >= 1; i--) {
    const line = state.doc.line(i);
    const item = parseListItem(line.text, i, line.from);

    if (!item) {
      if (isBlankLine(line.text)) return 'root';
      continue;
    }

    if (item.level < level) {
      return `${i}:${item.type}`;
    }
  }
  return 'root';
}

/**
 * 获取严格模式下的标准化更改
 */
export function getStrictOrderedListNormalizationChanges(
  state: EditorState
): ChangeSpec[] | null {
  const changes: ChangeSpec[] = [];
  const correctNumbers = calculateOrderedListNumbers(state);

  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const item = parseListItem(line.text, i, line.from);

    if (!item || item.type !== 'ordered') continue;

    const correctNumber = correctNumbers.get(i);
    if (correctNumber === undefined || correctNumber === item.number) continue;

    const newText = line.text.replace(
      new RegExp(`^([ \\t]*)${item.number}([.)])`),
      `$1${correctNumber}$2`
    );

    if (newText !== line.text) {
      changes.push({
        from: line.from,
        to: line.to,
        insert: newText,
      });
    }
  }

  return changes.length > 0 ? changes : null;
}

/**
 * 调整列表项层级（Tab/Shift-Tab）
 */
export function adjustListItemLevel(
  item: ListItemInfo,
  delta: number
): ListItemInfo {
  const newLevel = Math.max(0, item.level + delta);
  const newIndent = getIndentFromLevel(newLevel);
  console.log('[adjustListItemLevel] newLevel:', newLevel, 'newIndent:', JSON.stringify(newIndent));
  return {
    ...item,
    level: newLevel,
    indent: newIndent,
    number: item.type === 'ordered' ? 1 : item.number,
  };
}

/**
 * 格式化列表项为文本
 */
export function formatListItem(item: ListItemInfo): string {
  const indent = getIndentFromLevel(item.level);
  console.log('[formatListItem] item.level:', item.level);
  console.log('[formatListItem] indent:', JSON.stringify(indent));
  // 确保内容没有前导空格，避免格式化后出现多余空格
  const content = item.content.trimStart();

  if (item.type === 'ordered') {
    const number = item.number ?? 1;
    const delimiter = item.delimiter ?? '.';
    return `${indent}${number}${delimiter} ${content}`;
  }

  if (item.type === 'task') {
    const checkbox = item.checkbox ?? '[ ]';
    return `${indent}${item.marker} ${checkbox} ${content}`;
  }

  return `${indent}${item.marker} ${content}`;
}

/**
 * 判断列表项是否为空（只有 marker 没有内容）
 */
export function isEmptyListItem(item: ListItemInfo): boolean {
  return item.content.trim() === '';
}

/**
 * 获取行的列表信息
 */
export function getListInfoAtLine(state: EditorState, lineNumber: number): ListItemInfo | null {
  const line = state.doc.line(lineNumber);
  return parseListItem(line.text, lineNumber, line.from);
}

/**
 * 获取选中行的所有列表项
 */
export function getSelectedListItems(state: EditorState): ListItemInfo[] {
  const items: ListItemInfo[] = [];
  const selectedLines = new Set<number>();

  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    // Fix: when selection is empty (cursor mode), use range.to directly
    // to avoid lineAt(range.to - 1) returning wrong line when cursor is at line boundary
    const endPosition = range.empty ? range.to : Math.max(range.from, range.to - 1);
    const endLine = state.doc.lineAt(endPosition).number;
    for (let i = startLine; i <= endLine; i++) {
      selectedLines.add(i);
    }
  }

  for (const lineNumber of Array.from(selectedLines)) {
    const item = getListInfoAtLine(state, lineNumber);
    if (item) {
      items.push(item);
    }
  }

  return items;
}

/**
 * 查找同级上一个列表项
 */
export function findPreviousSiblingItem(
  state: EditorState,
  lineNumber: number,
  level: number
): ListItemInfo | null {
  for (let i = lineNumber - 1; i >= 1; i--) {
    const line = state.doc.line(i);
    if (isBlankLine(line.text)) break;

    const item = parseListItem(line.text, i, line.from);
    if (!item) continue;

    if (item.level === level) {
      return item;
    }
    if (item.level < level) {
      break; // 到达父级或更高级别
    }
  }
  return null;
}

/**
 * 查找同级下一个列表项
 */
export function findNextSiblingItem(
  state: EditorState,
  lineNumber: number,
  level: number
): ListItemInfo | null {
  for (let i = lineNumber + 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    if (isBlankLine(line.text)) break;

    const item = parseListItem(line.text, i, line.from);
    if (!item) continue;

    if (item.level === level) {
      return item;
    }
    if (item.level < level) {
      break; // 到达父级或更高级别
    }
  }
  return null;
}

/**
 * 检查是否为列表的最后一项
 */
export function isLastListItem(state: EditorState, lineNumber: number): boolean {
  const item = getListInfoAtLine(state, lineNumber);
  if (!item) return false;

  const nextItem = findNextSiblingItem(state, lineNumber, item.level);
  return nextItem === null;
}
