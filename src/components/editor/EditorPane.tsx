import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { getPaneLayoutMetrics } from './paneLayout';
import { clearActiveEditorView, registerActiveEditorView } from '../../utils/editorSelectionBridge';
import { Compartment, EditorSelection, EditorState, RangeSetBuilder, type StateCommand } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, drawSelection, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { getCompositeFontFamily } from '../../utils/fontSettings';
import { useFileSystem } from '../../hooks/useFileSystem';
import { getFileSystem } from '../../types/filesystem';
import { resolveEditorCodeLanguage } from '../../utils/editorCodeLanguages';

interface EditorPaneProps {
  placeholder?: string;
  onContentChange?: (content: string) => void;
  onScroll?: (percentage: number) => void;
  highlighter?: any;
  density?: 'comfortable' | 'compact';
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

const insertTwoSpaces: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: '  ' },
    range: EditorSelection.cursor(range.from + 2),
  }));

  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(({
  placeholder = 'Type here...',
  onContentChange,
  onScroll,
  highlighter,
  density = 'comfortable'
}, ref) => {
  void highlighter;

  const content = useAppStore(selectContent);
  const { setContent, settings, isSaving, activeTabId, viewMode, currentFilePath, rootFolderPath, showNotification } = useAppStore();
  const fontFamily = useMemo(() => getCompositeFontFamily(settings), [settings.englishFontFamily, settings.chineseFontFamily]);
  const { writeBinaryFile, refreshFileTree } = useFileSystem();

  const editorRootRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);
  const onScrollRef = useRef(onScroll);
  const emitAnimationFrameRef = useRef<number | null>(null);
  const pendingEmittedPercentageRef = useRef<number | null>(null);
  const syncAnimationFrameRef = useRef<number | null>(null);
  const syncTargetScrollTopRef = useRef<number | null>(null);

  const wrapCompartment = useRef(new Compartment()).current;
  const placeholderCompartment = useRef(new Compartment()).current;

  const updateContent = useCallback((nextContent: string) => {
    if (onContentChange) {
      onContentChange(nextContent);
      return;
    }
    setContent(nextContent);
  }, [onContentChange, setContent]);
  const updateContentRef = useRef(updateContent);

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

      const insertText = `![[${imageMarkdownPath}]]`;
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
  }, [currentFilePath, refreshFileTree, rootFolderPath, settings.resourceFolder, showNotification, writeBinaryFile]);

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

    const updatePaneWidth = () => {
      const nextWidth = layout.getBoundingClientRect().width;
      if (nextWidth > 0) {
        setPaneWidth(nextWidth);
      }
    };

    updatePaneWidth();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPaneWidth(entry.contentRect.width);
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
          keymap.of([...defaultKeymap, ...historyKeymap, { key: 'Tab', run: insertTwoSpaces }]),
          markdown({ codeLanguages: resolveEditorCodeLanguage }),
          drawSelection(),
          frontmatterDecorations,
          fencedCodeDecorations,
          wrapCompartment.of(settings.wordWrap ? EditorView.lineWrapping : []),
          syntaxHighlighting(markdownHighlightStyle),
          placeholderCompartment.of(cmPlaceholder(placeholder)),
          EditorView.domEventHandlers({
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
            }
          }),
        ],
      }),
      parent: root,
    });

    const handleDomScroll = () => {
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
    </div>
  );
});

EditorPane.displayName = 'EditorPane';
