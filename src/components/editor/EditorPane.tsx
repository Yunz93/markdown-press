import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { getPaneLayoutMetrics, type PaneDensity } from './paneLayout';
import { clearActiveEditorView, registerActiveEditorView } from '../../utils/editorSelectionBridge';
import { Compartment, EditorSelection, EditorState, RangeSetBuilder, type StateCommand } from '@codemirror/state';
import { autocompletion, completionKeymap, startCompletion, type Completion, type CompletionContext, type CompletionSource } from '@codemirror/autocomplete';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, drawSelection, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, indentUnit, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { getCompositeFontFamily } from '../../utils/fontSettings';
import { useFileSystem } from '../../hooks/useFileSystem';
import { getFileSystem } from '../../types/filesystem';
import { resolveEditorCodeLanguage } from '../../utils/editorCodeLanguages';
import type { AttachmentPasteFormat } from '../../types';
import { throttle } from '../../utils/throttle';
import { renderMarkdown } from '../../utils/markdown';
import { extractWikiNoteFragment, parseWikiLinkReference, resolveWikiLinkFile } from '../../utils/wikiLinks';
import { findHeadingByReference, findOpenWikiLinkAt, findWikiLinkAt, flattenMarkdownFiles, getWikiHeadingCandidates, getWikiLinkDisplayPath, getWikiLinkInsertPath } from '../../utils/wikiLinkEditor';

interface EditorPaneProps {
  placeholder?: string;
  onContentChange?: (content: string) => void;
  onScroll?: (percentage: number) => void;
  highlighter?: any;
  density?: PaneDensity;
}

export interface EditorPaneHandle {
  cancelScrollSync: () => void;
  syncScrollTo: (percentage: number) => void;
}

const SCROLL_THRESHOLD = 5;
const SCROLL_EMIT_THRESHOLD = 0.001;
const EDITOR_LINE_HEIGHT = 1.95;

function getPathSeparator(path: string): '/' | '\\' {
  return path.includes('\\') ? '\\' : '/';
}

function joinFsPath(basePath: string, ...segments: string[]): string {
  return segments.filter(Boolean).reduce((currentPath, segment) => {
    const separator = getPathSeparator(currentPath);
    return currentPath.endsWith(separator)
      ? `${currentPath}${segment}`
      : `${currentPath}${separator}${segment}`;
  }, basePath);
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

function sanitizeResourceFolder(folder: string): string {
  return folder
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^\.\//, '');
}

function getImageExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    case 'image/bmp':
      return 'bmp';
    case 'image/avif':
      return 'avif';
    default:
      return 'png';
  }
}

function buildPastedImageMarkdown(path: string, format: AttachmentPasteFormat): string {
  if (format === 'markdown') {
    const fileName = path.split('/').filter(Boolean).pop() || 'image';
    const altText = fileName.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '\\$&');
    return `![${altText}](<${path}>)`;
  }

  return `![[${path}]]`;
}

const markdownHighlightStyle = HighlightStyle.define([
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

const frontmatterDecorations = ViewPlugin.fromClass(class {
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

function buildFencedCodeDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;

  syntaxTree(view.state).iterate({
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

const fencedCodeDecorations = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildFencedCodeDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.decorations = buildFencedCodeDecorations(update.view);
    }
  }
}, {
  decorations: (plugin) => plugin.decorations,
});

// ==================== Markdown Editor Behavior ====================
// Standard Markdown editing behavior specification

// List item regex patterns
const UNORDERED_LIST_REGEX = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_LIST_REGEX = /^(\s*)(\d+)\.\s+(.*)$/;
const EMPTY_LIST_ITEM_REGEX = /^(\s*)([-*+]|\d+\.)\s*$/;

interface ListItemInfo {
  indent: string;
  marker: string;
  content: string;
  isOrdered: boolean;
  number?: number;
}

function parseListItem(lineText: string): ListItemInfo | null {
  const unorderedMatch = lineText.match(UNORDERED_LIST_REGEX);
  if (unorderedMatch) {
    return {
      indent: unorderedMatch[1],
      marker: unorderedMatch[2],
      content: unorderedMatch[3],
      isOrdered: false,
    };
  }
  
  const orderedMatch = lineText.match(ORDERED_LIST_REGEX);
  if (orderedMatch) {
    return {
      indent: orderedMatch[1],
      marker: orderedMatch[2] + '.',
      content: orderedMatch[3],
      isOrdered: true,
      number: parseInt(orderedMatch[2], 10),
    };
  }
  
  return null;
}

function isEmptyListItem(lineText: string): boolean {
  return EMPTY_LIST_ITEM_REGEX.test(lineText);
}

// Smart Enter key handler for Markdown lists
const handleMarkdownEnter: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const lineText = line.text;
  
  // Check if current line is a list item
  const listItem = parseListItem(lineText);
  
  if (!listItem) {
    // Not in a list, use default newline behavior
    return false;
  }
  
  // Check if this is an empty list item
  if (isEmptyListItem(lineText)) {
    // Exit the list: remove the list marker and clear the line
    const match = lineText.match(EMPTY_LIST_ITEM_REGEX);
    if (match) {
      const [, indent] = match;
      const changes = {
        changes: { from: line.from, to: line.to, insert: indent.trimEnd() },
        range: EditorSelection.cursor(line.from + indent.trimEnd().length),
      };
      dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
      return true;
    }
  }
  
  // Continue the list with proper marker
  const newMarker = listItem.isOrdered 
    ? `${(listItem.number || 1) + 1}. `
    : `${listItem.marker} `;
  
  const insertText = `\n${listItem.indent}${newMarker}`;
  
  const changes = {
    changes: { from: range.from, to: range.to, insert: insertText },
    range: EditorSelection.cursor(range.from + insertText.length),
  };
  
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

// Smart Tab handler: increase list indent or insert spaces
const indentSelectionOrInsertSpaces: StateCommand = ({ state, dispatch }) => {
  const hasExpandedSelection = state.selection.ranges.some((range) => !range.empty);
  
  if (hasExpandedSelection) {
    return indentMore({ state, dispatch });
  }
  
  const line = state.doc.lineAt(state.selection.main.from);
  const lineText = line.text;
  const cursorPos = state.selection.main.from - line.from;
  
  // Check if we're in a list item
  const listItem = parseListItem(lineText);
  if (listItem && cursorPos <= lineText.indexOf(listItem.marker) + listItem.marker.length + 1) {
    // In list context before/at content: add indent to the whole line
    const newLine = '  ' + lineText;
    const changes = {
      changes: { from: line.from, to: line.to, insert: newLine },
      range: EditorSelection.cursor(state.selection.main.from + 2),
    };
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  }
  
  // Default: insert 2 spaces at cursor
  const changes = state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: '  ' },
    range: EditorSelection.cursor(range.from + 2),
  }));
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

// Smart Shift-Tab handler: decrease list indent
const dedentListOrSelection: StateCommand = ({ state, dispatch }) => {
  const line = state.doc.lineAt(state.selection.main.from);
  const lineText = line.text;
  
  // Check if line starts with indentation
  const leadingSpaces = lineText.match(/^(\s*)/)?.[1] || '';
  
  // Check if we're in a list item
  const listItem = parseListItem(lineText);
  if (listItem && leadingSpaces.length >= 2) {
    // Remove 2 spaces of indent
    const newLine = lineText.slice(2);
    const changes = {
      changes: { from: line.from, to: line.to, insert: newLine },
      range: EditorSelection.cursor(Math.max(line.from, state.selection.main.from - 2)),
    };
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  }
  
  // Not a list or no indent to remove, use default indentLess
  return indentLess({ state, dispatch });
};

// Markdown editing helper functions
const wrapSelection = (state: EditorState, dispatch: (transaction: any) => void, before: string, after: string) => {
  const changes = state.changeByRange((range) => ({
    changes: [
      { from: range.from, insert: before },
      { from: range.to, insert: after },
    ],
    range: EditorSelection.range(range.from + before.length, range.to + before.length),
  }));
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

const toggleBold: StateCommand = ({ state, dispatch }) => {
  const hasSelection = state.selection.ranges.some((range) => !range.empty);
  if (!hasSelection) {
    // Insert empty bold markers and place cursor in between
    const changes = state.changeByRange((range) => ({
      changes: { from: range.from, insert: '****' },
      range: EditorSelection.cursor(range.from + 2),
    }));
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  }
  return wrapSelection(state, dispatch, '**', '**');
};

const toggleItalic: StateCommand = ({ state, dispatch }) => {
  const hasSelection = state.selection.ranges.some((range) => !range.empty);
  if (!hasSelection) {
    // Insert empty italic markers and place cursor in between
    const changes = state.changeByRange((range) => ({
      changes: { from: range.from, insert: '**' },
      range: EditorSelection.cursor(range.from + 1),
    }));
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  }
  return wrapSelection(state, dispatch, '*', '*');
};

const insertLink: StateCommand = ({ state, dispatch }) => {
  const hasSelection = state.selection.ranges.some((range) => !range.empty);
  if (hasSelection) {
    // Wrap selection: [selection](url)
    return wrapSelection(state, dispatch, '[', '](url)');
  }
  // Insert empty link template
  const changes = state.changeByRange((range) => ({
    changes: { from: range.from, insert: '[](url)' },
    range: EditorSelection.cursor(range.from + 1),
  }));
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

const insertCodeBlock: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => ({
    changes: { from: range.from, insert: '\n```\n\n```\n' },
    range: EditorSelection.cursor(range.from + 5),
  }));
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

const insertInlineCode: StateCommand = ({ state, dispatch }) => {
  const hasSelection = state.selection.ranges.some((range) => !range.empty);
  if (!hasSelection) {
    // Insert empty code markers and place cursor in between
    const changes = state.changeByRange((range) => ({
      changes: { from: range.from, insert: '``' },
      range: EditorSelection.cursor(range.from + 1),
    }));
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  }
  return wrapSelection(state, dispatch, '`', '`');
};

const insertUnorderedList: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const lineStart = line.from;
    const hasDash = state.doc.sliceString(lineStart, lineStart + 2) === '- ';
    
    if (hasDash) {
      // Remove existing dash
      return {
        changes: { from: lineStart, to: lineStart + 2, insert: '' },
        range: EditorSelection.cursor(range.from - 2),
      };
    }
    
    // Add dash at line start
    return {
      changes: { from: lineStart, insert: '- ' },
      range: EditorSelection.cursor(range.from + 2),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

const insertOrderedList: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const lineStart = line.from;
    const match = state.doc.sliceString(lineStart, lineStart + 3).match(/^(\d+)\. /);
    
    if (match) {
      // Remove existing number
      return {
        changes: { from: lineStart, to: lineStart + match[0].length, insert: '' },
        range: EditorSelection.cursor(range.from - match[0].length),
      };
    }
    
    // Add "1. " at line start
    return {
      changes: { from: lineStart, insert: '1. ' },
      range: EditorSelection.cursor(range.from + 3),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

const insertBlockquote: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const lineStart = line.from;
    const hasQuote = state.doc.sliceString(lineStart, lineStart + 2) === '> ';
    
    if (hasQuote) {
      // Remove existing quote marker
      return {
        changes: { from: lineStart, to: lineStart + 2, insert: '' },
        range: EditorSelection.cursor(range.from - 2),
      };
    }
    
    // Add "> " at line start
    return {
      changes: { from: lineStart, insert: '> ' },
      range: EditorSelection.cursor(range.from + 2),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

const insertHeading: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const lineStart = line.from;
    const lineText = state.doc.sliceString(lineStart, line.to);
    const match = lineText.match(/^(#{1,6})\s*/);
    
    if (match) {
      const currentLevel = match[1].length;
      if (currentLevel >= 6) {
        // Remove heading
        return {
          changes: { from: lineStart, to: lineStart + match[0].length, insert: '' },
          range: EditorSelection.cursor(range.from - match[0].length),
        };
      }
      // Increase heading level
      return {
        changes: { from: lineStart, to: lineStart + match[0].length, insert: '#'.repeat(currentLevel + 1) + ' ' },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    
    // Add H1
    return {
      changes: { from: lineStart, insert: '# ' },
      range: EditorSelection.cursor(range.from + 2),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

interface WikiLinkPreviewData {
  title: string;
  subtitle?: string;
  html: string;
}

interface HoverPreviewState {
  preview: WikiLinkPreviewData;
  x: number;
  y: number;
  target: string;
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.(md|markdown)$/i, '');
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

function isPreviewModifierPressed(event: Pick<KeyboardEvent | MouseEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return isMacPlatform() ? event.metaKey : event.ctrlKey;
}

function buildWikiPreviewMarkup(preview: WikiLinkPreviewData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'wiki-link-hover-preview';

  const header = document.createElement('div');
  header.className = 'wiki-link-hover-preview-header';

  const title = document.createElement('div');
  title.className = 'wiki-link-hover-preview-title';
  title.textContent = preview.title;
  header.appendChild(title);

  if (preview.subtitle) {
    const subtitle = document.createElement('div');
    subtitle.className = 'wiki-link-hover-preview-subtitle';
    subtitle.textContent = preview.subtitle;
    header.appendChild(subtitle);
  }

  const body = document.createElement('article');
  body.className = 'markdown-body wiki-link-hover-preview-body';
  body.innerHTML = preview.html;

  container.append(header, body);
  return container;
}

function findWikiLinkNearPosition(text: string, pos: number) {
  const offsets = [0, -1, 1, -2, 2];

  for (const offset of offsets) {
    const match = findWikiLinkAt(text, pos + offset);
    if (match) {
      return match;
    }
  }

  return null;
}

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(({
  placeholder = 'Type here...',
  onContentChange,
  onScroll,
  highlighter,
  density = 'comfortable' as PaneDensity
}, ref) => {
  void highlighter;

  const content = useAppStore(selectContent);
  const {
    setContent,
    settings,
    isSaving,
    activeTabId,
    viewMode,
    currentFilePath,
    rootFolderPath,
    showNotification,
    files,
    fileContents,
  } = useAppStore();
  const fontFamily = useMemo(() => getCompositeFontFamily(settings), [settings.englishFontFamily, settings.chineseFontFamily]);
  const { writeBinaryFile, refreshFileTree, readFile } = useFileSystem();

  const editorRootRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const previewModifierPressedRef = useRef(false);
  const keyboardModifierPressedRef = useRef(false);
  const hoveredLinkCacheRef = useRef(new Map<string, Promise<string>>());
  const completionStartFrameRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const hoverPreviewRequestRef = useRef(0);
  const hoverPreviewTargetRef = useRef<string | null>(null);
  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);
  const onScrollRef = useRef(onScroll);
  const emitAnimationFrameRef = useRef<number | null>(null);
  const pendingEmittedPercentageRef = useRef<number | null>(null);
  const syncAnimationFrameRef = useRef<number | null>(null);
  const syncTargetScrollTopRef = useRef<number | null>(null);

  const wrapCompartment = useRef(new Compartment()).current;
  const placeholderCompartment = useRef(new Compartment()).current;
  const completionSourceRef = useRef<CompletionSource>(() => null);
  const previewResolverRef = useRef<(rawTarget: string) => Promise<WikiLinkPreviewData | null>>(async () => null);

  const updateContent = useCallback((nextContent: string) => {
    if (onContentChange) {
      onContentChange(nextContent);
      return;
    }
    setContent(nextContent);
  }, [onContentChange, setContent]);
  const updateContentRef = useRef(updateContent);
  const markdownFiles = useMemo(() => flattenMarkdownFiles(files), [files]);
  const currentHeadings = useMemo(() => getWikiHeadingCandidates(content), [content]);
  const fileCompletionOptions = useMemo<Completion[]>(() => markdownFiles.map((file) => {
    const insertPath = getWikiLinkInsertPath(file, rootFolderPath);
    const displayPath = getWikiLinkDisplayPath(file, rootFolderPath);
    const fileLabel = stripMarkdownExtension(file.name);

    return {
      label: fileLabel,
      displayLabel: fileLabel,
      type: 'file',
      detail: displayPath === fileLabel ? 'Knowledge base note' : displayPath,
      apply: insertPath,
      boost: insertPath.includes('/') ? 0 : 1,
    };
  }), [markdownFiles, rootFolderPath]);

  const handlePastedImage = useCallback(async (file: File, view: EditorView) => {
    if (!rootFolderPath) {
      showNotification('Open a knowledge base before pasting images.', 'error');
      return;
    }

    try {
      const resourceFolder = sanitizeResourceFolder(settings.resourceFolder || 'resources') || 'resources';
      const targetDir = joinFsPath(rootFolderPath, resourceFolder);
      const extension = getImageExtension(file.type);
      const noteBaseName = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.(md|markdown)$/i, '') || 'image';
      const imageName = `${noteBaseName}-${Date.now()}.${extension}`;
      const imagePath = joinFsPath(targetDir, imageName);
      const imageMarkdownPath = normalizeSlashes(joinFsPath(resourceFolder, imageName));
      const arrayBuffer = await file.arrayBuffer();

      const fileSystem = await getFileSystem();
      await fileSystem.createDirectory(targetDir);
      await writeBinaryFile(imagePath, new Uint8Array(arrayBuffer));
      await refreshFileTree();

      const insertText = buildPastedImageMarkdown(
        imageMarkdownPath,
        settings.attachmentPasteFormat || 'obsidian'
      );
      const selection = view.state.selection.main;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: insertText },
        selection: { anchor: selection.from + insertText.length },
        scrollIntoView: true,
      });
      showNotification(`Image pasted to ${resourceFolder}`, 'success');
    } catch (error) {
      console.error('Failed to paste image attachment:', error);
      showNotification('Failed to paste image attachment.', 'error');
    }
  }, [
    currentFilePath,
    refreshFileTree,
    rootFolderPath,
    settings.attachmentPasteFormat,
    settings.resourceFolder,
    showNotification,
    writeBinaryFile,
  ]);

  const readWikiTargetContent = useCallback(async (fileId: string, filePath: string, fileName: string): Promise<string> => {
    if ((activeTabId && fileId === activeTabId) || (currentFilePath && filePath === currentFilePath)) {
      return content;
    }

    const cachedContent = fileContents[fileId];
    if (cachedContent !== undefined) {
      return cachedContent;
    }

    const cachedPromise = hoveredLinkCacheRef.current.get(filePath);
    if (cachedPromise) {
      return cachedPromise;
    }

    const pending = readFile({
      id: fileId,
      name: fileName,
      type: 'file',
      path: filePath,
    }).catch((error) => {
      hoveredLinkCacheRef.current.delete(filePath);
      throw error;
    });

    hoveredLinkCacheRef.current.set(filePath, pending);
    return pending;
  }, [activeTabId, content, currentFilePath, fileContents, readFile]);

  const buildWikiLinkPreview = useCallback(async (rawTarget: string): Promise<WikiLinkPreviewData | null> => {
    const parsedReference = parseWikiLinkReference(rawTarget);

    if (!parsedReference.subpathType && parsedReference.path.trim()) {
      const matchedHeading = findHeadingByReference(currentHeadings, rawTarget);
      if (matchedHeading) {
        const fragment = extractWikiNoteFragment(content, `#${matchedHeading.text}`);
        if (!fragment.markdown) return null;

        return {
          title: matchedHeading.text,
          subtitle: 'Current note',
          html: renderMarkdown(fragment.markdown, {
            highlighter,
            themeMode: settings.themeMode,
          }),
        };
      }
    }

    if (!parsedReference.path.trim()) {
      const fragment = extractWikiNoteFragment(content, rawTarget);
      if (!fragment.markdown) return null;

      return {
        title: fragment.title,
        subtitle: 'Current note',
        html: renderMarkdown(fragment.markdown, {
          highlighter,
          themeMode: settings.themeMode,
        }),
      };
    }

    const matchedFile = resolveWikiLinkFile(files, rawTarget, rootFolderPath, currentFilePath);
    if (!matchedFile) return null;

    const sourceContent = await readWikiTargetContent(matchedFile.id, matchedFile.path, matchedFile.name);
    const fragment = extractWikiNoteFragment(sourceContent, rawTarget);
    if (!fragment.markdown) return null;

    return {
      title: fragment.title,
      subtitle: getWikiLinkDisplayPath(matchedFile, rootFolderPath),
      html: renderMarkdown(fragment.markdown, {
        highlighter,
        themeMode: settings.themeMode,
      }),
    };
  }, [
    content,
    currentFilePath,
    currentHeadings,
    files,
    highlighter,
    readWikiTargetContent,
    rootFolderPath,
    settings.themeMode,
  ]);

  const wikiLinkCompletionSource = useCallback<CompletionSource>(async (context: CompletionContext) => {
    const match = findOpenWikiLinkAt(context.state.doc.toString(), context.pos);
    if (!match) return null;

    if (!match.hasHash) {
      return {
        from: match.from,
        to: match.to,
        options: fileCompletionOptions,
        validFor: /^[^#|\]\n]*$/,
      };
    }

    const noteTarget = match.pathQuery.trim();
    const targetFile = noteTarget
      ? resolveWikiLinkFile(files, noteTarget, rootFolderPath, currentFilePath)
      : null;

    let headingSourceContent = content;
    if (targetFile) {
      headingSourceContent = await readWikiTargetContent(targetFile.id, targetFile.path, targetFile.name);
    } else if (noteTarget) {
      return null;
    }

    const headingOptions: Completion[] = getWikiHeadingCandidates(headingSourceContent).map((heading) => ({
      label: heading.text,
      displayLabel: heading.text,
      type: 'property',
      detail: targetFile
        ? `${stripMarkdownExtension(targetFile.name)} · H${heading.level}`
        : `Current note · H${heading.level}`,
      apply: heading.text,
    }));

    return {
      from: match.from,
      to: match.to,
      options: headingOptions,
      validFor: /^[^|\]\n]*$/,
    };
  }, [content, currentFilePath, fileCompletionOptions, files, readWikiTargetContent, rootFolderPath]);

  const emitScrollPercentage = useCallback((scrollContainer: HTMLElement) => {
    if (isSyncingScroll.current) return;

    const onScrollCallback = onScrollRef.current;
    if (!onScrollCallback) return;

    const scrollHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    if (scrollHeight <= 0) return;

    const percentage = scrollContainer.scrollTop / scrollHeight;
    if (Math.abs(percentage - lastScrollPercentage.current) <= SCROLL_EMIT_THRESHOLD) return;

    lastScrollPercentage.current = percentage;
    pendingEmittedPercentageRef.current = percentage;

    if (emitAnimationFrameRef.current !== null) return;

    emitAnimationFrameRef.current = requestAnimationFrame(() => {
      emitAnimationFrameRef.current = null;
      const pendingPercentage = pendingEmittedPercentageRef.current;
      pendingEmittedPercentageRef.current = null;
      if (pendingPercentage === null) return;
      onScrollCallback(pendingPercentage);
    });
  }, [activeTabId]);

  const cancelSyncedScroll = useCallback(() => {
    if (syncAnimationFrameRef.current !== null) {
      cancelAnimationFrame(syncAnimationFrameRef.current);
      syncAnimationFrameRef.current = null;
    }
    syncTargetScrollTopRef.current = null;
    isSyncingScroll.current = false;
  }, [activeTabId]);

  const animateSyncedScroll = useCallback((scrollDom: HTMLElement, targetScrollTop: number) => {
    const maxScrollTop = Math.max(0, scrollDom.scrollHeight - scrollDom.clientHeight);
    const clampedTarget = Math.min(Math.max(targetScrollTop, 0), maxScrollTop);
    syncTargetScrollTopRef.current = clampedTarget;

    if (syncAnimationFrameRef.current !== null) return;

    isSyncingScroll.current = true;

    syncAnimationFrameRef.current = requestAnimationFrame(() => {
      syncAnimationFrameRef.current = null;
      const currentView = editorViewRef.current;
      const target = syncTargetScrollTopRef.current;

      if (!currentView || currentView.scrollDOM !== scrollDom || target === null) {
        syncTargetScrollTopRef.current = null;
        isSyncingScroll.current = false;
        return;
      }

      scrollDom.scrollTop = target;
      syncTargetScrollTopRef.current = null;
      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    });
  }, []);

  const [paneWidth, setPaneWidth] = useState(0);
  const layoutMetrics = useMemo(() => getPaneLayoutMetrics(paneWidth, density), [paneWidth, density]);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const layoutStyle = useMemo(() => ({
    '--pane-backdrop-px': `${layoutMetrics.backdropPaddingX}px`,
    '--pane-backdrop-py': `${layoutMetrics.backdropPaddingY}px`,
    '--pane-frame-max-width': `${layoutMetrics.frameMaxWidth}px`,
    '--pane-sheet-max-width': `${layoutMetrics.sheetMaxWidth}px`,
    '--pane-sheet-radius': `${layoutMetrics.sheetRadius}px`,
    '--pane-content-px': `${layoutMetrics.contentPaddingX}px`,
    '--pane-content-top': `${layoutMetrics.contentPaddingTop}px`,
    '--pane-content-bottom': `${layoutMetrics.contentPaddingBottom}px`,
    '--editor-font-family': fontFamily,
    '--editor-font-size': `${settings.fontSize}px`,
    '--editor-line-height': String(EDITOR_LINE_HEIGHT),
  }) as React.CSSProperties, [layoutMetrics, fontFamily, settings.fontSize]);

  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);

  useEffect(() => {
    return () => {
      if (completionStartFrameRef.current !== null) {
        cancelAnimationFrame(completionStartFrameRef.current);
        completionStartFrameRef.current = null;
      }
      if (emitAnimationFrameRef.current !== null) {
        cancelAnimationFrame(emitAnimationFrameRef.current);
        emitAnimationFrameRef.current = null;
      }
      pendingEmittedPercentageRef.current = null;
      cancelSyncedScroll();
    };
  }, [cancelSyncedScroll]);

  useEffect(() => {
    updateContentRef.current = updateContent;
  }, [updateContent]);

  useEffect(() => {
    completionSourceRef.current = wikiLinkCompletionSource;
  }, [wikiLinkCompletionSource]);

  useEffect(() => {
    previewResolverRef.current = buildWikiLinkPreview;
  }, [buildWikiLinkPreview]);

  useEffect(() => {
    hoveredLinkCacheRef.current.clear();
  }, [files, rootFolderPath]);

  const hideHoverPreview = useCallback(() => {
    hoverPreviewRequestRef.current += 1;
    hoverPreviewTargetRef.current = null;
    setHoverPreview(null);
  }, []);

  const updateHoverPreviewAtPointer = useCallback(async (clientX: number, clientY: number) => {
    const view = editorViewRef.current;
    if (!view || !previewModifierPressedRef.current) {
      hideHoverPreview();
      return;
    }

    const pos = view.posAtCoords({ x: clientX, y: clientY });
    if (pos == null) {
      hideHoverPreview();
      return;
    }

    const match = findWikiLinkNearPosition(view.state.doc.toString(), pos);
    if (!match) {
      hideHoverPreview();
      return;
    }

    const activeTarget = match.raw;
    hoverPreviewTargetRef.current = activeTarget;

    if (hoverPreview?.target === activeTarget) {
      setHoverPreview((current) => current ? { ...current, x: clientX, y: clientY } : current);
      return;
    }

    const requestId = hoverPreviewRequestRef.current + 1;
    hoverPreviewRequestRef.current = requestId;
    const preview = await previewResolverRef.current(activeTarget);

    if (
      hoverPreviewRequestRef.current !== requestId
      || hoverPreviewTargetRef.current !== activeTarget
      || !previewModifierPressedRef.current
    ) {
      return;
    }

    if (!preview) {
      hideHoverPreview();
      return;
    }

    setHoverPreview({
      preview,
      x: clientX,
      y: clientY,
      target: activeTarget,
    });
  }, [hideHoverPreview, hoverPreview?.target]);

  useEffect(() => {
    const syncModifierState = (active: boolean) => {
      keyboardModifierPressedRef.current = active;
      previewModifierPressedRef.current = active;

      if (!active) {
        hideHoverPreview();
        return;
      }

      if (lastPointerRef.current) {
        void updateHoverPreviewAtPointer(lastPointerRef.current.clientX, lastPointerRef.current.clientY);
      }
    };

    const updateModifierFromKeyboard = (event: KeyboardEvent) => {
      syncModifierState(isPreviewModifierPressed(event));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Meta' || event.key === 'Control') {
        updateModifierFromKeyboard(event);
        return;
      }

      if (previewModifierPressedRef.current) {
        updateModifierFromKeyboard(event);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Meta' || event.key === 'Control' || previewModifierPressedRef.current) {
        updateModifierFromKeyboard(event);
      }
    };

    const handleMouseUp = () => {
      if (!previewModifierPressedRef.current) return;
      syncModifierState(false);
    };

    const handleBlur = () => {
      syncModifierState(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [hideHoverPreview, updateHoverPreviewAtPointer]);

  const wikiLinkAutocompleteExtension = useMemo(() => autocompletion({
    activateOnTyping: true,
    override: [(context) => completionSourceRef.current(context)],
    maxRenderedOptions: 40,
  }), []);

  useImperativeHandle(ref, () => ({
    cancelScrollSync: cancelSyncedScroll,
    syncScrollTo: (percentage: number) => {
      const view = editorViewRef.current;
      if (!view) return;

      const scrollDom = view.scrollDOM;
      const maxScrollTop = scrollDom.scrollHeight - scrollDom.clientHeight;
      if (maxScrollTop <= 0) return;

      const targetScrollTop = maxScrollTop * percentage;
      if (Math.abs(scrollDom.scrollTop - targetScrollTop) <= SCROLL_THRESHOLD) return;
      animateSyncedScroll(scrollDom, targetScrollTop);
    },
  }), [animateSyncedScroll, cancelSyncedScroll]);

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;

    // Throttle pane width updates to 16ms (60fps) for better performance
    const throttledSetPaneWidth = throttle(setPaneWidth, 16);

    const updatePaneWidth = () => {
      const nextWidth = layout.getBoundingClientRect().width;
      if (nextWidth > 0) {
        throttledSetPaneWidth(nextWidth);
      }
    };

    updatePaneWidth();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      throttledSetPaneWidth(entry.contentRect.width);
    });

    resizeObserver.observe(layout);
    return () => resizeObserver.disconnect();
  }, [activeTabId]);

  useEffect(() => {
    if (!activeTabId) {
      const existingView = editorViewRef.current;
      if (existingView) {
        clearActiveEditorView(existingView);
        existingView.destroy();
        editorViewRef.current = null;
      }
      return;
    }

    const root = editorRootRef.current;
    if (!root || editorViewRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          history(),
          keymap.of([
            ...completionKeymap,
            // Markdown-specific Enter handling (before default)
            { key: 'Enter', run: handleMarkdownEnter },
            { key: 'Shift-Tab', run: dedentListOrSelection },
            { key: 'Tab', run: indentSelectionOrInsertSpaces },
            // Default keymaps
            ...defaultKeymap,
            ...historyKeymap,
            // Markdown formatting shortcuts
            { key: 'Mod-b', run: toggleBold },
            { key: 'Mod-i', run: toggleItalic },
            { key: 'Mod-k', run: insertLink },
            { key: 'Mod-Shift-k', run: insertCodeBlock },
            { key: 'Mod-`', run: insertInlineCode },
            { key: 'Mod-Shift-l', run: insertUnorderedList },
            { key: 'Mod-Shift-o', run: insertOrderedList },
            { key: 'Mod-Shift-.', run: insertBlockquote },
            { key: 'Mod-Shift-h', run: insertHeading },
          ]),
          wikiLinkAutocompleteExtension,
          indentUnit.of('  '),
          markdown({ codeLanguages: resolveEditorCodeLanguage }),
          drawSelection(),
          frontmatterDecorations,
          fencedCodeDecorations,
          wrapCompartment.of(settings.wordWrap ? EditorView.lineWrapping : []),
          syntaxHighlighting(markdownHighlightStyle),
          placeholderCompartment.of(cmPlaceholder(placeholder)),
          EditorView.domEventHandlers({
            mousemove: (event) => {
              lastPointerRef.current = {
                clientX: event.clientX,
                clientY: event.clientY,
              };
              previewModifierPressedRef.current = keyboardModifierPressedRef.current || isPreviewModifierPressed(event);
              if (!previewModifierPressedRef.current) {
                hideHoverPreview();
                return false;
              }
              void updateHoverPreviewAtPointer(event.clientX, event.clientY);
              return false;
            },
            mouseleave: () => {
              lastPointerRef.current = null;
              previewModifierPressedRef.current = false;
              hideHoverPreview();
              return false;
            },
            scroll: () => {
              hideHoverPreview();
              return false;
            },
            paste: (event, view) => {
              const clipboardItems = Array.from(event.clipboardData?.items ?? []);
              const imageItem = clipboardItems.find((item) => item.type.startsWith('image/'));
              const imageFile = imageItem?.getAsFile();

              if (!imageFile) {
                return false;
              }

              event.preventDefault();
              void handlePastedImage(imageFile, view);
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              updateContentRef.current(update.state.doc.toString());

              const selection = update.state.selection.main;
              if (selection.empty) {
                const cursor = selection.from;
                const prevTwoChars = update.state.doc.sliceString(Math.max(0, cursor - 2), cursor);
                const prevOneChar = update.state.doc.sliceString(Math.max(0, cursor - 1), cursor);
                if (prevTwoChars === '[[' || prevOneChar === '#') {
                  const openMatch = findOpenWikiLinkAt(update.state.doc.toString(), cursor);
                  if (openMatch) {
                    if (completionStartFrameRef.current !== null) {
                      cancelAnimationFrame(completionStartFrameRef.current);
                    }
                    completionStartFrameRef.current = requestAnimationFrame(() => {
                      completionStartFrameRef.current = null;
                      const currentView = editorViewRef.current;
                      if (currentView) {
                        startCompletion(currentView);
                      }
                    });
                  }
                }
              }
            }
          }),
        ],
      }),
      parent: root,
    });

    const handleDomScroll = () => {
      hideHoverPreview();
      emitScrollPercentage(view.scrollDOM);
    };
    const handleUserScrollIntent = () => {
      cancelSyncedScroll();
    };

    view.scrollDOM.addEventListener('scroll', handleDomScroll, { passive: true });
    view.scrollDOM.addEventListener('wheel', handleUserScrollIntent, { passive: true });
    view.scrollDOM.addEventListener('touchstart', handleUserScrollIntent, { passive: true });
    view.scrollDOM.addEventListener('pointerdown', handleUserScrollIntent, { passive: true });

    editorViewRef.current = view;
    registerActiveEditorView(view);
    const initialMeasureFrame = requestAnimationFrame(() => {
      view.requestMeasure();
    });

    return () => {
      cancelSyncedScroll();
      cancelAnimationFrame(initialMeasureFrame);
      view.scrollDOM.removeEventListener('scroll', handleDomScroll);
      view.scrollDOM.removeEventListener('wheel', handleUserScrollIntent);
      view.scrollDOM.removeEventListener('touchstart', handleUserScrollIntent);
      view.scrollDOM.removeEventListener('pointerdown', handleUserScrollIntent);
      clearActiveEditorView(view);
      view.destroy();
      if (editorViewRef.current === view) {
        editorViewRef.current = null;
      }
    };
  }, [
    activeTabId,
    placeholder,
    settings.wordWrap,
    placeholderCompartment,
    wrapCompartment,
    emitScrollPercentage,
    cancelSyncedScroll,
    handlePastedImage,
    hideHoverPreview,
    wikiLinkAutocompleteExtension,
    updateHoverPreviewAtPointer,
  ]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    view.dispatch({
      effects: wrapCompartment.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
    });
  }, [settings.wordWrap, wrapCompartment]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    view.dispatch({
      effects: placeholderCompartment.reconfigure(cmPlaceholder(placeholder)),
    });
  }, [placeholder, placeholderCompartment]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (currentContent === content) return;

    const anchor = Math.min(view.state.selection.main.anchor, content.length);
    const head = Math.min(view.state.selection.main.head, content.length);

    view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: content },
      selection: { anchor, head },
    });
  }, [content]);

  // Refresh editor when fonts are loaded
  useEffect(() => {
    const handleFontsLoaded = () => {
      const view = editorViewRef.current;
      if (!view) return;
      // Force CodeMirror to re-measure and redraw
      view.requestMeasure();
    };

    // Listen for font load events
    document.fonts?.addEventListener?.('loadingdone', handleFontsLoaded);
    
    // Also check if fonts are already loaded
    if (document.fonts?.status === 'loaded') {
      handleFontsLoaded();
    }

    return () => {
      document.fonts?.removeEventListener?.('loadingdone', handleFontsLoaded);
    };
  }, []);

  useLayoutEffect(() => {
    const view = editorViewRef.current;
    const layout = layoutRef.current;
    if (!view || !layout) return;

    const syncEditorLayout = () => {
      const nextWidth = layout.getBoundingClientRect().width;
      if (nextWidth > 0) {
        setPaneWidth((prev) => (Math.abs(prev - nextWidth) > 0.5 ? nextWidth : prev));
      }
      view.requestMeasure();
    };

    syncEditorLayout();
    const rafId = requestAnimationFrame(syncEditorLayout);

    return () => cancelAnimationFrame(rafId);
  }, [activeTabId, viewMode, paneWidth]);

  if (!activeTabId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50/30 dark:bg-black/20 select-none">
        <svg className="w-16 h-16 mb-4 opacity-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <p className="text-sm font-medium">Select a file to start editing</p>
      </div>
    );
  }

  return (
    <div
      ref={layoutRef}
      className="editor-pane-layout h-full min-w-0 flex flex-col relative"
      style={layoutStyle}
    >
      {isSaving && (
        <div className="absolute top-2 right-4 z-10 flex items-center gap-1 text-xs text-gray-400 animate-pulse">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Saving...
        </div>
      )}

      <div className="editor-pane-backdrop flex-1 min-h-0 overflow-hidden">
        <div className="editor-pane-scroll h-full overflow-hidden">
          <div className="editor-pane-frame h-full w-full">
            <div className="editor-pane-sheet h-full w-full">
              <div ref={editorRootRef} className="editor-pane-codemirror h-full w-full" />
            </div>
          </div>
        </div>
      </div>

      {hoverPreview && (
        <div
          className={`wiki-link-hover-overlay ${hoverPreview.y > ((typeof window !== 'undefined' ? window.innerHeight : 900) * 0.58) ? 'is-above' : ''}`}
          style={{
            left: Math.max(16, Math.min(
              hoverPreview.x + 18,
              (typeof window !== 'undefined' ? window.innerWidth : hoverPreview.x + 18) - 440
            )),
            top: hoverPreview.y + 18,
          }}
        >
          {(() => {
            const markup = buildWikiPreviewMarkup(hoverPreview.preview);
            return (
              <div
                dangerouslySetInnerHTML={{ __html: markup.innerHTML }}
                className={markup.className}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
});

EditorPane.displayName = 'EditorPane';
