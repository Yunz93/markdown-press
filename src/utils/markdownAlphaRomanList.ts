/**
 * 让预览端也认 alpha/roman 风格的有序列表(A./B./i./a./b. 等)。
 *
 * 背景:编辑器侧 (nestedListBehavior) 将单字母 [a-zA-Z] 和多字母 [ivxlcdm]+ 视为 alpha/roman
 * 风格的有序列表 marker,而 markdown-it 严格按 CommonMark 只认数字 marker。两侧不一致会让
 * 预览渲染出错——比如 `A. test\nB. test` 被当成段落 + soft break,失去列表结构和嵌套。
 *
 * 解决:在 markdown-it 解析前做两步:
 *   1. 把 alpha/roman marker 改写为对应的阿拉伯数字 marker,让 markdown-it 正常识别列表;
 *   2. 同步记录每行原始的标记风格 + 起始值,后续通过 token.map[0] 回填到 ordered_list_open
 *      的 `type` / `start` 属性,浏览器会按 HTML 标准渲染出 A. / B. / i. / ii. 等样式。
 *
 * 与编辑器侧的歧义判定保持一致(参见 nestedListBehavior.ts 的 inferOrderedMarkerStyleFromRawPart):
 *   - 多字母 [IVXLCDM]{2,} / [ivxlcdm]{2,} (且能解析为正整数罗马数字) → 罗马
 *   - 单字母 [A-Z] / [a-z] → alpha
 *
 * 额外约束:
 *   - fenced code block (``` 或 ~~~) 内容会被跳过,不会改写。
 *   - indented code block 也会被跳过,避免把 4 空格缩进代码里的 `A. text` 污染成列表。
 */

import type Token from 'markdown-it/lib/token.mjs';

export type AlphaRomanListType = 'A' | 'a' | 'I' | 'i';

export interface AlphaRomanListMetaEntry {
  type: AlphaRomanListType;
  start: number;
}

export type AlphaRomanListMeta = Map<number, AlphaRomanListMetaEntry>;

// 匹配 alpha/roman 列表行。多字母 roman 优先,避免 `ii.` 被当成单字母 alpha。
// 后跟空白或行尾,保证 `A.text` 这种无空格紧贴的不会误判为列表。
const ALPHA_ROMAN_LIST_RE = /^([ \t]*)([IVXLCDM]{2,}|[ivxlcdm]{2,}|[A-Z]|[a-z])([.)])(?=\s|$)(.*)$/;
const DECIMAL_LIST_RE = /^([ \t]*)\d+[.)](?=\s|$)/;
const BULLET_LIST_RE = /^([ \t]*)[-+*](?=\s|$)/;

// fenced code 起止行(允许 0~3 空格缩进,与 CommonMark 一致)。
const FENCE_RE = /^([ ]{0,3})(`{3,}|~{3,})/;

const ROMAN_VALUES: Record<string, number> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
  d: 500,
  m: 1000,
};

function getIndentColumns(line: string): number {
  let columns = 0;
  for (const char of line) {
    if (char === ' ') {
      columns += 1;
      continue;
    }
    if (char === '\t') {
      columns += 4;
      continue;
    }
    break;
  }
  return columns;
}

function isListLikeLine(line: string): boolean {
  return ALPHA_ROMAN_LIST_RE.test(line)
    || DECIMAL_LIST_RE.test(line)
    || BULLET_LIST_RE.test(line);
}

/** 解析罗马数字字符串为正整数;无效返回 0。 */
function parseRoman(input: string): number {
  const s = input.toLowerCase();
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const v = ROMAN_VALUES[s[i]];
    if (!v) return 0;
    if (v < prev) total -= v;
    else {
      total += v;
      prev = v;
    }
  }
  return total > 0 ? total : 0;
}

/** 把 marker 文本分类为 alpha/roman + 对应的数值。无法分类返回 null。 */
function classifyMarker(markerPart: string): { type: AlphaRomanListType; value: number } | null {
  // 多字母 roman(必须能解析成正整数)
  if (markerPart.length >= 2 && /^[IVXLCDM]+$/.test(markerPart)) {
    const v = parseRoman(markerPart);
    if (v > 0) return { type: 'I', value: v };
  }
  if (markerPart.length >= 2 && /^[ivxlcdm]+$/.test(markerPart)) {
    const v = parseRoman(markerPart);
    if (v > 0) return { type: 'i', value: v };
  }
  // 单字母 alpha
  if (/^[A-Z]$/.test(markerPart)) {
    return { type: 'A', value: markerPart.charCodeAt(0) - 64 };
  }
  if (/^[a-z]$/.test(markerPart)) {
    return { type: 'a', value: markerPart.charCodeAt(0) - 96 };
  }
  return null;
}

/**
 * 预处理:把 alpha/roman marker 行改写成阿拉伯数字 marker,同时记录原始风格。
 *
 * 返回 src 行数与输入一致,仅替换 marker 文本,所以 markdown-it 解析后 token.map 的行号
 * 仍可与 meta 的 0-based 行号对应。
 */
export function preprocessAlphaRomanLists(src: string): { src: string; meta: AlphaRomanListMeta } {
  const lines = src.split('\n');
  const meta: AlphaRomanListMeta = new Map();
  let inFence = false;
  let fenceChar = '';
  let inIndentedCode = false;
  let activeListIndents: number[] = [];
  let pendingBlankListIndents: number[] = [];
  let previousNonBlankIndent: number | null = null;
  let previousNonBlankWasList = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const char = fenceMatch[2][0];
      if (!inFence) {
        inFence = true;
        fenceChar = char;
      } else if (char === fenceChar) {
        inFence = false;
        fenceChar = '';
      }
      continue;
    }
    if (inFence) continue;
    if (trimmed === '') {
      // 连续空行时 activeListIndents 已清空，勿用 [] 覆盖仍有效的 pending 上下文。
      if (activeListIndents.length > 0) {
        pendingBlankListIndents = [...activeListIndents];
      }
      activeListIndents = [];
      previousNonBlankIndent = null;
      previousNonBlankWasList = false;
      continue;
    }

    const indentColumns = getIndentColumns(line);
    const lineIsListLike = isListLikeLine(line);
    const hasBlankLineNestedListContext = lineIsListLike
      && pendingBlankListIndents.some((indent) => indent + 4 === indentColumns);
    pendingBlankListIndents = [];
    activeListIndents = activeListIndents.filter((indent) => indent <= indentColumns);
    const hasIndentedListContext = activeListIndents.includes(indentColumns)
      || hasBlankLineNestedListContext
      || (previousNonBlankWasList && previousNonBlankIndent !== null && previousNonBlankIndent <= indentColumns);

    if (inIndentedCode) {
      if (indentColumns >= 4 && !hasIndentedListContext) {
        previousNonBlankWasList = false;
        previousNonBlankIndent = indentColumns;
        continue;
      }
      inIndentedCode = false;
    }

    if (indentColumns >= 4 && !hasIndentedListContext) {
      // 4 空格缩进且前面没有明确列表上下文时,按 CommonMark 视为 indented code block。
      // 后续整段代码块都应跳过 alpha/roman 预处理,避免把代码内容改写成列表。
      inIndentedCode = true;
      previousNonBlankWasList = false;
      previousNonBlankIndent = indentColumns;
      continue;
    }

    const m = line.match(ALPHA_ROMAN_LIST_RE);
    if (m) {
      const [, indent, markerPart, delimiter, rest] = m;
      const cls = classifyMarker(markerPart);
      if (cls) {
        lines[i] = `${indent}${cls.value}${delimiter}${rest}`;
        meta.set(i, { type: cls.type, start: cls.value });
      }
    }

    if (isListLikeLine(lines[i])) {
      if (!activeListIndents.includes(indentColumns)) {
        activeListIndents.push(indentColumns);
      }
      previousNonBlankWasList = true;
      previousNonBlankIndent = indentColumns;
      continue;
    }

    previousNonBlankWasList = false;
    previousNonBlankIndent = indentColumns;
  }

  return { src: lines.join('\n'), meta };
}

/**
 * 把 ordered_list_open 的 type / start 属性按 meta 回填。
 *
 * markdown-it 的 token 是平铺数组(不是树),遍历一次即可。同一个列表组若内部 marker 风格
 * 不一致,只取首行的风格(由 token.map[0] 决定)。
 */
export function applyAlphaRomanListAttrs(tokens: Token[], meta: AlphaRomanListMeta): void {
  if (meta.size === 0) return;
  for (const token of tokens) {
    if (token.type !== 'ordered_list_open' || !token.map) continue;
    const entry = meta.get(token.map[0]);
    if (!entry) continue;
    token.attrSet('type', entry.type);
    if (entry.start !== 1) {
      token.attrSet('start', String(entry.start));
    }
  }
}
