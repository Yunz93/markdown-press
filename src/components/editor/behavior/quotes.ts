/**
 * Markdown Behavior - Quote Handling
 * Blockquote parsing and manipulation
 */

import { getLeadingIndent } from './core';
import type { QuoteInfo } from './core';

export function parseQuote(lineText: string): QuoteInfo | null {
  const indent = getLeadingIndent(lineText);
  let index = indent.length;
  let depth = 0;

  while (lineText[index] === '>') {
    depth += 1;
    index += 1;

    while (lineText[index] === ' ') {
      index += 1;
    }
  }

  if (depth === 0) {
    return null;
  }

  const raw = lineText.slice(indent.length, index);
  return {
    indent,
    depth,
    raw,
    spacedStyle: />\s+>/.test(raw),
    content: lineText.slice(index),
  };
}

export function buildQuoteRaw(depth: number, spacedStyle: boolean): string {
  if (depth <= 0) return '';
  return spacedStyle ? `${'> '.repeat(depth)}` : `${'>'.repeat(depth)} `;
}

export function buildQuotePrefix(quote: QuoteInfo | null): string {
  if (!quote) return '';
  return `${quote.indent}${buildQuoteRaw(quote.depth, quote.spacedStyle)}`;
}
