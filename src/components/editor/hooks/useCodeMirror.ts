/**
 * CodeMirror 编辑器核心 Hook
 * 
 * 负责：
 * 1. 编辑器实例的创建和销毁
 * 2. 扩展配置管理
 * 3. 内容变更监听
 * 4. 基本事件处理
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Compartment, EditorState, Prec, Transaction } from '@codemirror/state';
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionSource,
} from '@codemirror/autocomplete';
import {
  drawSelection,
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { indentUnit, syntaxHighlighting } from '@codemirror/language';
import { debounce } from '../../../utils/throttle';
import { resolveEditorCodeLanguage } from '../../../utils/editorCodeLanguages';
import {
  createMarkdownKeyBindings,
  getStrictOrderedListNormalizationChanges,
  LIST_INDENT_UNIT,
} from '../behavior';
import { markdownHighlightStyle } from '../decorations';
import {
  frontmatterDecorations,
  fencedCodeDecorations,
  markdownListDecorations,
} from '../decorations';
import type { OrderedListMode } from '../../../types';

// Debounced update callback to prevent excessive re-renders
const createDebouncedUpdate = (callback: (content: string) => void, delay: number = 16) => {
  return debounce(callback, delay);
};

export interface UseCodeMirrorOptions {
  content: string;
  placeholder?: string;
  wordWrap?: boolean;
  orderedListMode?: OrderedListMode;
  onChange: (content: string) => void;
  onScroll?: () => void;
  completionSource?: CompletionSource;
  onPasteImage?: (file: File, view: EditorView) => boolean | Promise<boolean>;
  onWikiLinkStart?: () => void;
  onContextMenu?: (event: MouseEvent, view: EditorView) => boolean;
}

export interface UseCodeMirrorReturn {
  editorRef: (element: HTMLDivElement | null) => void;
  view: EditorView | null;
  focus: () => void;
  setWordWrap: (enabled: boolean) => void;
  setPlaceholder: (text: string) => void;
  setOrderedListMode: (mode: OrderedListMode) => void;
}

export function useCodeMirror(options: UseCodeMirrorOptions): UseCodeMirrorReturn {
  const {
    content,
    placeholder = 'Type here...',
    wordWrap = true,
    orderedListMode = 'strict',
    onChange,
    onScroll,
    completionSource,
    onPasteImage,
    onWikiLinkStart,
    onContextMenu,
  } = options;

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [viewReady, setViewReady] = useState(false);
  const [editorElementReady, setEditorElementReady] = useState(false);
  const isApplyingOrderedNormalizationRef = useRef(false);
  const normalizationTimeoutRef = useRef<number | null>(null);
  const completionSourceRef = useRef(completionSource);
  const onScrollRef = useRef(onScroll);
  const onPasteImageRef = useRef(onPasteImage);
  const onWikiLinkStartRef = useRef(onWikiLinkStart);
  const onContextMenuRef = useRef(onContextMenu);

  // Compartments for dynamic reconfiguration
  const compartments = useMemo(() => ({
    wrap: new Compartment(),
    placeholder: new Compartment(),
    keymap: new Compartment(),
  }), []);

  // Track if we're currently syncing content to avoid loops
  const isSyncingContentRef = useRef(false);
  
  // Track initial content for delayed initialization
  const initialContentRef = useRef(content || '');
  
  // Update initial content ref when content changes before initialization
  useEffect(() => {
    if (!viewRef.current) {
      initialContentRef.current = content || '';
    }
  }, [content]);

  // Callback ref to track when editor element is mounted
  const setEditorElement = useCallback((element: HTMLDivElement | null) => {
    editorRef.current = element;
    if (element && !viewRef.current) {
      setEditorElementReady(true);
    } else if (!element) {
      setEditorElementReady(false);
    }
  }, []);

  // Create debounced onChange
  const debouncedOnChangeRef = useRef(createDebouncedUpdate(onChange, 16));

  // Update debounced callback when onChange changes
  useEffect(() => {
    debouncedOnChangeRef.current = createDebouncedUpdate(onChange, 16);
  }, [onChange]);

  useEffect(() => {
    completionSourceRef.current = completionSource;
  }, [completionSource]);

  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);

  useEffect(() => {
    onPasteImageRef.current = onPasteImage;
  }, [onPasteImage]);

  useEffect(() => {
    onWikiLinkStartRef.current = onWikiLinkStart;
  }, [onWikiLinkStart]);

  useEffect(() => {
    onContextMenuRef.current = onContextMenu;
  }, [onContextMenu]);

  // Initialize editor as soon as the DOM node is ready.
  useLayoutEffect(() => {
    if (!editorElementReady || !editorRef.current || viewRef.current) return;

    try {
      const customCompletion: CompletionSource = completionSourceRef.current
        ? (ctx: CompletionContext) => completionSourceRef.current?.(ctx) ?? null
        : () => null;

      const view = new EditorView({
        state: EditorState.create({
          doc: initialContentRef.current,
          extensions: [
            history(),
            keymap.of([
              ...completionKeymap,
              ...defaultKeymap,
              ...historyKeymap,
            ]),
            compartments.keymap.of(
              Prec.high(keymap.of(createMarkdownKeyBindings(orderedListMode)))
            ),
            autocompletion({
              activateOnTyping: true,
              override: [customCompletion],
              maxRenderedOptions: 40,
            }),
            indentUnit.of(LIST_INDENT_UNIT),
            markdown({ codeLanguages: resolveEditorCodeLanguage }),
            drawSelection(),
            frontmatterDecorations,
            fencedCodeDecorations,
            markdownListDecorations,
            compartments.wrap.of(wordWrap ? EditorView.lineWrapping : []),
            syntaxHighlighting(markdownHighlightStyle),
            compartments.placeholder.of(cmPlaceholder(placeholder)),
            EditorView.domEventHandlers({
              scroll: (() => {
                // Throttle scroll events for better performance
                let lastScrollTime = 0;
                const SCROLL_THROTTLE = 16; // ~60fps
                return () => {
                  const now = performance.now();
                  if (now - lastScrollTime < SCROLL_THROTTLE) return false;
                  lastScrollTime = now;
                  
                  const scrollHandler = onScrollRef.current;
                  if (scrollHandler) {
                    scrollHandler();
                  }
                  return false;
                };
              })(),
              paste: (event, view) => {
                // Handle structured paste (lists, links)
                // Note: This is handled separately in useStructuredPaste

                // Handle image paste
                const pasteImage = onPasteImageRef.current;
                if (pasteImage) {
                  const clipboardItems = Array.from(event.clipboardData?.items ?? []);
                  const imageItem = clipboardItems.find((item) => item.type.startsWith('image/'));
                  const imageFile = imageItem?.getAsFile();

                  if (imageFile) {
                    event.preventDefault();
                    void pasteImage(imageFile, view);
                    return true;
                  }
                }
                return false;
              },
              contextmenu: (event, view) => {
                const handler = onContextMenuRef.current;
                return handler ? handler(event, view) : false;
              },
            }),
            EditorView.updateListener.of((update: ViewUpdate) => {
              if (!update.docChanged) return;

              // Handle strict ordered list normalization - debounced for performance
              if (orderedListMode === 'strict' && !isApplyingOrderedNormalizationRef.current) {
                // Only normalize on user input events, not on programmatic changes
                const isUserInput = update.transactions.some(t => t.isUserEvent('input') || t.isUserEvent('delete'));
                if (isUserInput) {
                  // Use debounced normalization to avoid blocking during typing
                  if (normalizationTimeoutRef.current) {
                    clearTimeout(normalizationTimeoutRef.current);
                  }
                  normalizationTimeoutRef.current = window.setTimeout(() => {
                    const view = viewRef.current;
                    if (!view || isApplyingOrderedNormalizationRef.current) return;
                    const normalizationChanges = getStrictOrderedListNormalizationChanges(view.state);
                    if (normalizationChanges) {
                      isApplyingOrderedNormalizationRef.current = true;
                      view.dispatch({
                        changes: normalizationChanges,
                        annotations: Transaction.addToHistory.of(false),
                        userEvent: 'input',
                      });
                      isApplyingOrderedNormalizationRef.current = false;
                    }
                    normalizationTimeoutRef.current = null;
                  }, 150); // 150ms debounce
                }
              }

              // Trigger content change
              if (!isSyncingContentRef.current) {
                debouncedOnChangeRef.current(update.state.doc.toString());
              }

              // Auto-trigger completion for wiki links
              const wikiLinkStart = onWikiLinkStartRef.current;
              if (wikiLinkStart) {
                const selection = update.state.selection.main;
                if (selection.empty) {
                  const cursor = selection.from;
                  const prevTwoChars = update.state.doc.sliceString(Math.max(0, cursor - 2), cursor);
                  const prevOneChar = update.state.doc.sliceString(Math.max(0, cursor - 1), cursor);
                  if (prevTwoChars === '[[' || prevOneChar === '#') {
                    wikiLinkStart();
                  }
                }
              }
            }),
          ],
        }),
        parent: editorRef.current,
      });

      viewRef.current = view;
      setViewReady(true);
    } catch (error) {
      console.error('CodeMirror initialization failed:', error);
    }

    return () => {
      if (normalizationTimeoutRef.current) {
        clearTimeout(normalizationTimeoutRef.current);
      }
      viewRef.current?.destroy();
      viewRef.current = null;
      setViewReady(false);
    };
  }, [editorElementReady, placeholder, wordWrap, orderedListMode, compartments.wrap, compartments.placeholder, compartments.keymap]);

  // Sync external content changes (only when not typing)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const safeContent = content || '';
    const currentContent = view.state.doc.toString();
    if (currentContent === safeContent) return;

    // Don't sync if the editor is focused (user is typing)
    // This prevents cursor jumping when content changes come from user input
    if (view.hasFocus) {
      return;
    }

    isSyncingContentRef.current = true;
    const anchor = Math.min(view.state.selection.main.anchor, safeContent.length);
    const head = Math.min(view.state.selection.main.head, safeContent.length);

    view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: safeContent },
      selection: { anchor, head },
    });
    isSyncingContentRef.current = false;
  }, [content]);

  // Update word wrap
  const setWordWrap = useCallback((enabled: boolean) => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: compartments.wrap.reconfigure(enabled ? EditorView.lineWrapping : []),
    });
  }, [compartments]);

  // Update placeholder
  const setPlaceholder = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: compartments.placeholder.reconfigure(cmPlaceholder(text)),
    });
  }, [compartments]);

  // Update ordered list mode
  const setOrderedListMode = useCallback((mode: OrderedListMode) => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: compartments.keymap.reconfigure(
        Prec.high(keymap.of(createMarkdownKeyBindings(mode)))
      ),
    });
  }, [compartments]);

  // Focus editor
  const focus = useCallback(() => {
    viewRef.current?.focus();
  }, []);

  // Use viewReady to trigger re-render when view is created
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  viewReady;

  return {
    editorRef: setEditorElement,
    view: viewRef.current,
    focus,
    setWordWrap,
    setPlaceholder,
    setOrderedListMode,
  };
}
