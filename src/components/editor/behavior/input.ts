/**
 * Markdown Behavior - Input Handling
 * Enter, Backspace, Tab, Shift-Tab, Paste
 */

import { indentLess, insertNewlineAndIndent } from '@codemirror/commands';
import { insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown';
import { EditorSelection, type StateCommand } from '@codemirror/state';
import type { OrderedListMode } from '../../../types';
import {
  isInsideFencedCode,
  isInsideFrontmatter,
  replaceCurrentLine,
  parseStructuredLine,
  isEmptyListItem,
  isEmptyQuoteLine,
  insertText,
  looksLikeUrl,
  LIST_INDENT_UNIT,
  getIndentUnit,
  updateSelectedLines,
  getLeadingIndent,
  removeIndentUnit,
} from './core';
import { buildQuotePrefix, buildQuoteRaw } from './quotes';
import { parseListItem } from '../nestedListBehavior';
import {
  handleListEnter,
  handleListBackspace,
  handleListTab,
  handleListShiftTab,
} from '../nestedListCommands';
import type { EditorView } from '@codemirror/view';

function handleFrontmatterEnter({ state, dispatch }: Parameters<StateCommand>[0]): boolean {
  const main = state.selection.main;
  const line = state.doc.lineAt(main.from);
  const text = line.text;

  const yamlListMatch = text.match(/^(\s*)-\s*(.*)$/);
  if (yamlListMatch && main.from === line.to) {
    const [, indent, content] = yamlListMatch;
    const nextIndent = `${indent}- `;
    const insert = content.trim() === '' ? '\n' : `\n${nextIndent}`;
    const cursorOffset = insert === '\n' ? 1 : insert.length;

    dispatch(state.update({
      changes: { from: main.from, insert },
      selection: { anchor: main.from + cursorOffset },
      scrollIntoView: true,
      userEvent: 'input',
    }));
    return true;
  }

  const yamlKeyMatch = text.match(/^(\s*[^:#\n][^:\n]*):\s*$/);
  if (yamlKeyMatch && main.from === line.to) {
    const [, keyPrefix] = yamlKeyMatch;
    const insert = `\n${getLeadingIndent(keyPrefix)}${getIndentUnit(state)}`;
    dispatch(state.update({
      changes: { from: main.from, insert },
      selection: { anchor: main.from + insert.length },
      scrollIntoView: true,
      userEvent: 'input',
    }));
    return true;
  }

  return insertNewlineAndIndent({ state, dispatch });
}

// ==================== 智能 Enter 处理 ====================

export const handleSmartEnter: StateCommand = ({ state, dispatch }): boolean => {
  const main = state.selection.main;

  // 有选区时使用默认行为
  if (!main.empty) {
    return insertNewlineContinueMarkupCommand({ nonTightLists: false })({ state, dispatch });
  }

  // 代码块内使用默认行为
  if (isInsideFencedCode(state, main.from)) {
    return insertNewlineAndIndent({ state, dispatch });
  }

  if (isInsideFrontmatter(state, main.from)) {
    return handleFrontmatterEnter({ state, dispatch });
  }

  const line = state.doc.lineAt(main.from);

  // 光标不在行尾时使用默认行为
  if (main.from !== line.to) {
    return insertNewlineContinueMarkupCommand({ nonTightLists: false })({ state, dispatch });
  }

  const structured = parseStructuredLine(line.text);

  // 使用新的列表处理逻辑
  if (structured.list) {
    // 检查是否使用新的多级列表处理
    const item = parseListItem(line.text, line.number, line.from);
    if (item) {
      return handleListEnter({ state, dispatch } as Parameters<StateCommand>[0]) ?? false;
    }
  }

  // 引用块处理
  if (structured.quote) {
    if (isEmptyQuoteLine(structured)) {
      const replacement = structured.quote.depth > 1
        ? `${structured.quote.indent}${buildQuoteRaw(structured.quote.depth - 1, structured.quote.spacedStyle)}`
        : structured.quote.indent;
      return replaceCurrentLine(state, dispatch, replacement, replacement.length);
    }

    const continuation = `${buildQuotePrefix(structured.quote)}`;
    dispatch(state.update({
      changes: { from: main.from, insert: `\n${continuation}` },
      selection: { anchor: main.from + continuation.length + 1 },
      scrollIntoView: true,
      userEvent: 'input',
    }));
    return true;
  }

  // 标题处理
  const headingMatch = line.text.match(/^([ \t]*)(#{1,6})( +)(.*)$/);
  if (headingMatch) {
    dispatch(state.update({
      changes: { from: main.from, insert: '\n' },
      selection: { anchor: main.from + 1 },
      scrollIntoView: true,
      userEvent: 'input',
    }));
    return true;
  }

  return insertNewlineContinueMarkupCommand({ nonTightLists: false })({ state, dispatch });
};

// ==================== 智能 Backspace 处理 ====================

export const handleSmartBackspace: StateCommand = ({ state, dispatch }): boolean => {
  const main = state.selection.main;
  if (!main.empty || isInsideFencedCode(state, main.from)) {
    return false;
  }

  if (isInsideFrontmatter(state, main.from)) {
    return false;
  }

  const line = state.doc.lineAt(main.from);
  const structured = parseStructuredLine(line.text);

  // 使用新的列表处理逻辑
  if (structured.list) {
    const item = parseListItem(line.text, line.number, line.from);
    if (item) {
      return handleListBackspace({ state, dispatch } as Parameters<StateCommand>[0]) ?? false;
    }
  }

  // 引用块处理
  if (structured.quote) {
    let markerBoundary = line.from + buildQuotePrefix(structured.quote).length;

    if (main.from === markerBoundary) {
      const nextText = structured.quote.depth > 1
        ? `${structured.quote.indent}${buildQuoteRaw(structured.quote.depth - 1, structured.quote.spacedStyle)}${structured.quote.content}`
        : `${structured.quote.indent}${structured.quote.content}`;
      return replaceCurrentLine(state, dispatch, nextText, nextText.length);
    }
  }

  return false;
};

// ==================== Tab / Shift-Tab 处理 ====================

export const handleSmartTab: StateCommand = ({ state, dispatch }): boolean => {
  return createHandleSmartTab('strict')({ state, dispatch });
};

export function createHandleSmartTab(orderedListMode: OrderedListMode): StateCommand {
  return ({ state, dispatch }): boolean => {
    const hasExpandedSelection = state.selection.ranges.some((range) => !range.empty);
    const line = state.doc.lineAt(state.selection.main.from);
    const structured = parseStructuredLine(line.text);
    const insideFencedCode = isInsideFencedCode(state, state.selection.main.from);
    const insideFrontmatter = isInsideFrontmatter(state, state.selection.main.from);

    // 代码块内处理
    if (insideFencedCode) {
      if (hasExpandedSelection) {
        return updateSelectedLines(state, dispatch, (lineText) => `${LIST_INDENT_UNIT}${lineText}`);
      }

      const changes = state.changeByRange((range) => ({
        changes: { from: range.from, to: range.to, insert: LIST_INDENT_UNIT },
        range: EditorSelection.cursor(range.from + LIST_INDENT_UNIT.length),
      }));

      dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
      return true;
    }

    if (insideFrontmatter) {
      if (hasExpandedSelection) {
        return updateSelectedLines(state, dispatch, (lineText) => `${getIndentUnit(state)}${lineText}`);
      }

      const indentUnit = getIndentUnit(state);
      const changes = state.changeByRange((range) => ({
        changes: { from: range.from, to: range.to, insert: indentUnit },
        range: EditorSelection.cursor(range.from + indentUnit.length),
      }));

      dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
      return true;
    }

    // 列表处理 - 使用新逻辑
    if (structured.list) {
      const cmd = handleListTab({ strictMode: orderedListMode === 'strict' });
      return cmd({ state, dispatch }) ?? false;
    }

    // 普通文本：有选区时按行首缩进，避免整段替换为一段空格
    if (hasExpandedSelection) {
      return updateSelectedLines(state, dispatch, (lineText) => `${LIST_INDENT_UNIT}${lineText}`);
    }

    const changes = state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: LIST_INDENT_UNIT },
      range: EditorSelection.cursor(range.from + LIST_INDENT_UNIT.length),
    }));

    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

export const handleSmartShiftTab: StateCommand = ({ state, dispatch }): boolean => {
  return createHandleSmartShiftTab('strict')({ state, dispatch });
};

export function createHandleSmartShiftTab(orderedListMode: OrderedListMode): StateCommand {
  return ({ state, dispatch }): boolean => {
    const line = state.doc.lineAt(state.selection.main.from);
    const structured = parseStructuredLine(line.text);
    const insideFencedCode = isInsideFencedCode(state, state.selection.main.from);
    const insideFrontmatter = isInsideFrontmatter(state, state.selection.main.from);

    // 代码块内处理
    if (insideFencedCode) {
      const handled = updateSelectedLines(state, dispatch, (lineText) => {
        const indent = getLeadingIndent(lineText);
        return `${removeIndentUnit(indent)}${lineText.slice(indent.length)}`;
      });

      return handled || indentLess({ state, dispatch });
    }

    if (insideFrontmatter) {
      return updateSelectedLines(state, dispatch, (lineText) => {
        const indent = getLeadingIndent(lineText);
        return `${removeIndentUnit(indent, getIndentUnit(state))}${lineText.slice(indent.length)}`;
      });
    }

    // 列表处理 - 使用新逻辑
    if (structured.list) {
      const cmd = handleListShiftTab({ strictMode: orderedListMode === 'strict' });
      return cmd({ state, dispatch }) ?? false;
    }

    // 普通文本
    const handled = updateSelectedLines(state, dispatch, (lineText) => {
      const indent = getLeadingIndent(lineText);
      return `${removeIndentUnit(indent)}${lineText.slice(indent.length)}`;
    });

    return handled || indentLess({ state, dispatch });
  };
}

// ==================== 粘贴处理 ====================

export function handleStructuredPaste(view: EditorView, event: ClipboardEvent): boolean {
  const text = event.clipboardData?.getData('text/plain');
  if (!text) {
    return false;
  }

  const normalized = text.replace(/\r\n?/g, '\n');
  const state = view.state;
  const selection = state.selection.main;

  // 仅粘贴 URL、无选区 → [](url)，光标在 [] 之间以便填写链接文字
  if (selection.empty && looksLikeUrl(normalized)) {
    if (isInsideFencedCode(state, selection.from) || isInsideFrontmatter(state, selection.from)) {
      return false;
    }
    event.preventDefault();
    const url = normalized.trim();
    view.dispatch(
      state.update({
        changes: { from: selection.from, to: selection.to, insert: `[](${url})` },
        selection: EditorSelection.cursor(selection.from + 1),
        scrollIntoView: true,
        userEvent: 'input.paste',
      }),
    );
    return true;
  }

  // 有选区且粘贴内容为 URL → [选区文本](url)
  if (!selection.empty && looksLikeUrl(normalized)) {
    if (isInsideFencedCode(state, selection.from) || isInsideFrontmatter(state, selection.from)) {
      return false;
    }
    const selectedText = state.doc.sliceString(selection.from, selection.to);
    event.preventDefault();
    insertText(view, `[${selectedText}](${normalized.trim()})`);
    return true;
  }

  // 单行或代码块内不处理
  if (!normalized.includes('\n') || isInsideFencedCode(state, selection.from)) {
    return false;
  }

  const line = state.doc.lineAt(selection.from);
  const item = parseListItem(line.text, line.number, line.from);
  if (!item) {
    return false;
  }

  const lines = normalized.split('\n');
  if (lines.length <= 1) {
    return false;
  }

  // 构建续行前缀
  const buildContinuation = (index: number): string => {
    const quotePrefix = item.quotePrefix ?? '';
    if (item.type === 'ordered') {
      return `${quotePrefix}${item.indent}${(item.number ?? 0) + index}. `;
    }

    if (item.type === 'task') {
      const checkbox = item.checkbox ?? '[ ]';
      return `${quotePrefix}${item.indent}${item.marker} ${checkbox} `;
    }

    return `${quotePrefix}${item.indent}${item.marker} `;
  };

  const insert = lines
    .map((segment, index) => (index === 0 ? segment : `${buildContinuation(index)}${segment}`))
    .join('\n');

  event.preventDefault();
  insertText(view, insert);
  return true;
}
