/**
 * Markdown Behavior - Inline Formatting Commands
 * Bold, italic, code, links
 */

import { EditorSelection, type StateCommand } from '@codemirror/state';
import { unwrapInline, insertText } from '../core';

export const toggleBold: StateCommand = ({ state, dispatch }): boolean => {
  return unwrapInline(state, dispatch, '**', '**');
};

export const toggleItalic: StateCommand = ({ state, dispatch }): boolean => {
  return unwrapInline(state, dispatch, '*', '*');
};

export const toggleInlineCode: StateCommand = ({ state, dispatch }): boolean => {
  return unwrapInline(state, dispatch, '`', '`');
};

export const insertLink: StateCommand = ({ state, dispatch }): boolean => {
  const hasSelection = state.selection.ranges.some((range) => !range.empty);

  if (!hasSelection) {
    const changes = state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: '[]()' },
      range: EditorSelection.cursor(range.from + 1),
    }));
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  }

  const changes = state.changeByRange((range) => {
    const selectedText = state.doc.sliceString(range.from, range.to);
    const insert = `[${selectedText}]()`;
    const urlStart = range.from + selectedText.length + 3;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(urlStart),
    };
  });

  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

export const insertCodeBlock: StateCommand = ({ state, dispatch }): boolean => {
  const changes = state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: '```\n\n```' },
    range: EditorSelection.cursor(range.from + 4),
  }));

  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};
