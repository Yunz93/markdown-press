/**
 * Markdown Behavior - Block-level Commands
 * Blockquote, heading
 */

import { type StateCommand } from '@codemirror/state';
import {
  isBlankLine,
  getLeadingIndent,
  updateSelectedLines,
  parseStructuredLine,
  isEmptyListItem,
} from '../core';
import { buildQuoteRaw, buildQuotePrefix } from '../quotes';
import { HEADING_REGEX } from '../core';

export const toggleBlockquote: StateCommand = ({ state, dispatch }): boolean => {
  return updateSelectedLines(state, dispatch, (lineText) => {
    if (isBlankLine(lineText)) {
      return '> ';
    }

    const parsed = parseStructuredLine(lineText);
    if (!parsed.quote) {
      const indent = getLeadingIndent(lineText);
      return `${indent}> ${lineText.slice(indent.length)}`;
    }

    if (parsed.quote.depth >= 2) {
      return `${parsed.quote.indent}${parsed.quote.content}`;
    }

    return `${parsed.quote.indent}${buildQuoteRaw(parsed.quote.depth + 1, parsed.quote.spacedStyle)}${parsed.quote.content}`;
  });
};

export const cycleHeading: StateCommand = ({ state, dispatch }): boolean => {
  return updateSelectedLines(state, dispatch, (lineText) => {
    const parsed = parseStructuredLine(lineText);
    if (parsed.list) {
      return lineText;
    }

    const quotePrefix = buildQuotePrefix(parsed.quote);
    const headingTarget = parsed.quote ? parsed.quote.content : lineText;
    const indent = getLeadingIndent(headingTarget);
    const body = headingTarget.slice(indent.length);
    const match = body.match(/^(#{1,6})( +)(.*)$/);

    if (!match) {
      return `${quotePrefix}${indent}# ${body}`;
    }

    const [, marks, , content] = match;
    if (marks.length >= 6) {
      return `${quotePrefix}${indent}${content}`;
    }

    return `${quotePrefix}${indent}${'#'.repeat(marks.length + 1)} ${content}`;
  });
};
