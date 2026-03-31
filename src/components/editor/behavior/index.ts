/**
 * Markdown Behavior
 * Main entry point for markdown editing behaviors
 */

import type { KeyBinding } from '@codemirror/view';
import type { OrderedListMode } from '../../../types';

// Re-export core utilities
export {
  LIST_INDENT_UNIT,
  UNORDERED_LIST_REGEX,
  ORDERED_LIST_REGEX,
  TASK_LIST_REGEX,
  BLOCKQUOTE_REGEX,
  HEADING_REGEX,
  EMPTY_LINE_REGEX,
  isBlankLine,
  getLeadingIndent,
  getIndentColumnWidth,
  addIndentUnit,
  removeIndentUnit,
  isInsideFencedCode,
  mapColumnAfterLineUpdate,
  getSelectedLineNumbers,
  updateSelectedLines,
  replaceCurrentLine,
  unwrapInline,
  insertText,
  looksLikeUrl,
  isEmptyListItem,
  isEmptyQuoteLine,
} from './core';

// Re-export types
export type {
  LineDraft,
  QuoteInfo,
  ListInfo,
  StructuredLine,
  OrderedNormalizationMode,
} from './core';

// Re-export quote utilities
export {
  parseQuote,
  buildQuoteRaw,
  buildQuotePrefix,
} from './quotes';

// Re-export list utilities
export {
  parseListLine,
  formatListLine,
} from './lists';

// Re-export inline commands
export {
  toggleBold,
  toggleItalic,
  toggleInlineCode,
  insertLink,
  insertCodeBlock,
} from './commands/inline';

// Re-export block commands
export {
  toggleBlockquote,
  cycleHeading,
} from './commands/block';

// Re-export list commands
export {
  toggleUnorderedList,
  toggleOrderedList,
  createToggleOrderedList,
} from './commands/list';

// Re-export input handling
export {
  handleSmartEnter,
  handleSmartBackspace,
  handleSmartTab,
  handleSmartShiftTab,
  handleStructuredPaste,
  createHandleSmartTab,
  createHandleSmartShiftTab,
} from './input';

// Re-export normalization
export {
  getStrictOrderedListNormalizationChanges,
} from './normalization';

// Import for creating key bindings
import { toggleBold, toggleItalic, toggleInlineCode, insertLink, insertCodeBlock } from './commands/inline';
import { toggleBlockquote, cycleHeading } from './commands/block';
import { toggleUnorderedList, toggleOrderedList, createToggleOrderedList } from './commands/list';
import { handleSmartEnter, handleSmartBackspace, handleSmartTab, handleSmartShiftTab, handleStructuredPaste, createHandleSmartTab, createHandleSmartShiftTab } from './input';

// ==================== 命令导出 ====================

export const markdownCommands = {
  handleSmartEnter,
  handleSmartBackspace,
  handleSmartTab,
  handleSmartShiftTab,
  toggleUnorderedList,
  toggleOrderedList,
  toggleBlockquote,
  cycleHeading,
  toggleBold,
  toggleItalic,
  toggleInlineCode,
  insertLink,
  insertCodeBlock,
  handleStructuredPaste,
};

// ==================== 键绑定 ====================

export function createMarkdownKeyBindings(orderedListMode: OrderedListMode): KeyBinding[] {
  return [
    { key: 'Enter', run: handleSmartEnter },
    { key: 'Backspace', run: handleSmartBackspace },
    { key: 'Shift-Tab', run: createHandleSmartShiftTab(orderedListMode) },
    { key: 'Tab', run: createHandleSmartTab(orderedListMode) },
    { key: 'Mod-b', run: toggleBold },
    { key: 'Mod-i', run: toggleItalic },
    { key: 'Mod-k', run: insertLink },
    { key: 'Mod-Shift-k', run: insertCodeBlock },
    { key: 'Mod-`', run: toggleInlineCode },
    { key: 'Mod-Shift-l', run: toggleUnorderedList },
    { key: 'Mod-Shift-o', run: createToggleOrderedList(orderedListMode) },
    { key: 'Mod-Shift-.', run: toggleBlockquote },
    { key: 'Mod-Shift-h', run: cycleHeading },
  ];
}
