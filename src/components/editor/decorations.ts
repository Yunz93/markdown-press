/**
 * CodeMirror 装饰器
 * 
 * 提供视觉装饰：
 * - Frontmatter 高亮
 * - 代码块高亮
 * - 列表标记高亮
 */

import { RangeSetBuilder } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { Decoration, ViewPlugin, type ViewUpdate, type EditorView } from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import {
  UNORDERED_LIST_REGEX,
  ORDERED_LIST_REGEX,
} from './behavior';

// ==================== 语法高亮样式 ====================

export const markdownHighlightStyle = HighlightStyle.define([
  { tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6], class: 'tok-heading mp-tok-heading' },
  { tag: tags.strong, class: 'tok-strong mp-tok-strong' },
  { tag: tags.emphasis, class: 'tok-emphasis mp-tok-emphasis' },
  { tag: [tags.link, tags.url], class: 'tok-link mp-tok-link' },
  { tag: [tags.quote, tags.list], class: 'mp-tok-muted' },
  { tag: [tags.separator, tags.contentSeparator, tags.punctuation, tags.meta, tags.processingInstruction], class: 'tok-punctuation tok-meta mp-tok-muted-soft' },
  { tag: [tags.monospace, tags.literal, tags.string], class: 'tok-string mp-tok-code' },
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], class: 'tok-string tok-regexp mp-tok-code' },
  { tag: [tags.keyword, tags.operatorKeyword], class: 'tok-keyword mp-tok-keyword' },
  { tag: [tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.modifier], class: 'tok-keyword tok-definitionKeyword mp-tok-keyword' },
  { tag: [tags.bool, tags.atom], class: 'tok-bool tok-atom mp-tok-atom' },
  { tag: tags.number, class: 'tok-number mp-tok-number' },
  { tag: [tags.propertyName, tags.attributeName, tags.labelName], class: 'tok-propertyName tok-labelName mp-tok-property' },
  { tag: [tags.variableName, tags.name, tags.local(tags.variableName)], class: 'tok-variableName mp-tok-variable' },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], class: 'tok-variableName tok-definition mp-tok-variable' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], class: 'tok-function mp-tok-function' },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.macroName], class: 'tok-typeName tok-className mp-tok-type' },
  { tag: [tags.operator, tags.arithmeticOperator, tags.logicOperator, tags.compareOperator, tags.definitionOperator, tags.updateOperator], class: 'tok-operator mp-tok-operator' },
  { tag: tags.comment, class: 'tok-comment mp-tok-comment' },
]);

// ==================== Frontmatter 装饰器 ====================

function buildFrontmatterDecorations(view: EditorView): DecorationSet {
  const { doc } = view.state;
  if (doc.lines === 0 || doc.line(1).text.trim() !== '---') {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const frontmatterLine = Decoration.line({ class: 'cm-frontmatter-line' });
  const frontmatterMark = Decoration.mark({ class: 'cm-frontmatter-mark' });
  const frontmatterPunctuation = Decoration.mark({ class: 'cm-frontmatter-punctuation' });
  const frontmatterKey = Decoration.mark({ class: 'cm-frontmatter-key' });
  const frontmatterComment = Decoration.mark({ class: 'cm-frontmatter-comment' });

  const firstLine = doc.line(1);
  builder.add(firstLine.from, firstLine.from, frontmatterLine);
  builder.add(firstLine.from, firstLine.to, frontmatterMark);

  let closingLineNumber: number | null = null;
  for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber += 1) {
    if (doc.line(lineNumber).text.trim() === '---') {
      closingLineNumber = lineNumber;
      break;
    }
  }

  const contentEndLine = closingLineNumber ?? (doc.lines + 1);

  for (let lineNumber = 2; lineNumber < contentEndLine; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const text = line.text;
    builder.add(line.from, line.from, frontmatterLine);

    if (!text.trim()) continue;

    const commentMatch = text.match(/^(\s*)(#.*)$/);
    if (commentMatch) {
      const [, indent, comment] = commentMatch;
      const commentFrom = line.from + indent.length;
      builder.add(commentFrom, commentFrom + comment.length, frontmatterComment);
      continue;
    }

    const listMatch = text.match(/^(\s*)(-)(\s+)(.*)$/);
    if (listMatch) {
      const [, indent, marker] = listMatch;
      const markerFrom = line.from + indent.length;
      builder.add(markerFrom, markerFrom + marker.length, frontmatterPunctuation);
      continue;
    }

    const keyValueMatch = text.match(/^(\s*)([^:#\n][^:\n]*?)(\s*):/);
    if (!keyValueMatch) continue;

    const [, indent, key, beforeColon] = keyValueMatch;
    const keyFrom = line.from + indent.length;
    const keyTo = keyFrom + key.length;
    const colonFrom = keyTo + beforeColon.length;

    builder.add(keyFrom, keyTo, frontmatterKey);
    builder.add(colonFrom, colonFrom + 1, frontmatterPunctuation);
  }

  if (closingLineNumber !== null) {
    const closingLine = doc.line(closingLineNumber);
    builder.add(closingLine.from, closingLine.from, frontmatterLine);
    builder.add(closingLine.from, closingLine.to, frontmatterMark);
  }

  return builder.finish();
}

export const frontmatterDecorations = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildFrontmatterDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.decorations = buildFrontmatterDecorations(update.view);
    }
  }
}, {
  decorations: (plugin) => plugin.decorations,
});

// ==================== 代码块装饰器 ====================

function buildFencedCodeDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const tree = ensureSyntaxTree(view.state, doc.length, 75) ?? syntaxTree(view.state);

  tree.iterate({
    enter: ({ name, from, to }) => {
      if (name !== 'FencedCode') return;

      const firstLineNumber = doc.lineAt(from).number;
      const lastLineNumber = doc.lineAt(Math.max(from, to - 1)).number;

      for (let lineNumber = firstLineNumber; lineNumber <= lastLineNumber; lineNumber += 1) {
        const line = doc.line(lineNumber);
        const classNames = ['cm-fenced-code-line'];

        if (lineNumber === firstLineNumber) {
          classNames.push('cm-fenced-code-line-start', 'cm-fenced-code-line-fence');
        } else if (lineNumber === lastLineNumber) {
          classNames.push('cm-fenced-code-line-end', 'cm-fenced-code-line-fence');
        } else {
          classNames.push('cm-fenced-code-line-body');
        }

        builder.add(line.from, line.from, Decoration.line({ class: classNames.join(' ') }));
      }
    },
  });

  return builder.finish();
}

export const fencedCodeDecorations = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildFencedCodeDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
      this.decorations = buildFencedCodeDecorations(update.view);
    }
  }
}, {
  decorations: (plugin) => plugin.decorations,
});

// ==================== 列表装饰器 ====================

function buildMarkdownListDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    const unorderedMatch = line.text.match(UNORDERED_LIST_REGEX);
    const orderedMatch = line.text.match(ORDERED_LIST_REGEX);
    const match = unorderedMatch ?? orderedMatch;

    if (!match) {
      continue;
    }

    const markerText = orderedMatch ? `${orderedMatch[2]}${orderedMatch[3]}` : unorderedMatch![2];
    const markerFrom = line.from + match[1].length;
    builder.add(
      markerFrom,
      markerFrom + markerText.length,
      Decoration.mark({ class: 'cm-markdown-list-marker' }),
    );
  }

  return builder.finish();
}

export const markdownListDecorations = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildMarkdownListDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.decorations = buildMarkdownListDecorations(update.view);
    }
  }
}, {
  decorations: (plugin) => plugin.decorations,
});
