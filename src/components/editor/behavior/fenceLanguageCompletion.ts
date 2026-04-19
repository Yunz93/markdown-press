/**
 * Autocomplete markdown fenced-code language identifiers (```lang) using the same
 * language list as the editor / highlighter.
 */

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { editorCodeLanguages } from '../../../utils/editorCodeLanguages';
import { hasOpenFencedBlockBeforeLine, isInsideFrontmatter } from './core';

const LANG_ID = /^[\w.#+\-]*$/;

function buildFenceLanguageCompletions(): Completion[] {
  const seen = new Set<string>();
  const out: Completion[] = [];

  for (const desc of editorCodeLanguages) {
    const ids = new Set<string>([desc.name, ...desc.alias]);
    for (const id of ids) {
      const key = id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        label: id,
        displayLabel: desc.name === id ? id : `${id} · ${desc.name}`,
        type: 'type',
        apply: id,
      });
    }
  }

  return out.sort((a, b) => a.label.localeCompare(b.label));
}

const FENCE_LANG_COMPLETIONS = buildFenceLanguageCompletions();

export function markdownFenceLanguageCompletion(context: CompletionContext): CompletionResult | null {
  if (isInsideFrontmatter(context.state, context.pos)) {
    return null;
  }

  const line = context.state.doc.lineAt(context.pos);
  const lineText = line.text;
  const beforeCursor = lineText.slice(0, context.pos - line.from);

  const infoNode = syntaxTree(context.state).resolveInner(context.pos, -1);
  if (infoNode.type.name === 'CodeInfo') {
    return {
      from: infoNode.from,
      to: context.pos,
      options: FENCE_LANG_COMPLETIONS,
      validFor: LANG_ID,
    };
  }

  const partial = beforeCursor.match(/^([ \t]{0,3})```([\w.#+\-]*)$/);
  if (!partial) {
    return null;
  }

  const indentLen = partial[1].length;
  const langStart = line.from + indentLen + 3;

  if (hasOpenFencedBlockBeforeLine(context.state, line.number)) {
    const afterTicks = lineText.slice(indentLen);
    if (/^```\s*$/.test(afterTicks)) {
      return null;
    }
  }

  return {
    from: langStart,
    to: context.pos,
    options: FENCE_LANG_COMPLETIONS,
    validFor: LANG_ID,
  };
}
