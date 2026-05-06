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
  tooltips,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { indentUnit, syntaxHighlighting } from '@codemirror/language';
import { resolveEditorCodeLanguage } from '../../../utils/editorCodeLanguages';
import { extractMarkdownFenceLanguages } from '../../../utils/shikiLanguages';
import {
  createMarkdownKeyBindings,
  getStrictOrderedListNormalizationChanges,
  LIST_INDENT_UNIT,
} from '../behavior';
import { handleStructuredPaste } from '../behavior/input';
import { markdownFenceLanguageCompletion } from '../behavior/fenceLanguageCompletion';
import { markdownFencedCodeInputHandler } from '../behavior/fencedCodeInput';
import { markdownHighlightStyle } from '../decorations';
import {
  frontmatterDecorations,
  fencedCodeDecorations,
  markdownListDecorations,
} from '../decorations';
import type { OrderedListMode, ThemeMode } from '../../../types';
import { editorAutocompletePanelBaseTheme } from '../editorAutocompleteTheme';

export interface UseCodeMirrorOptions {
  content: string;
  documentKey?: string | null;
  placeholder?: string;
  wordWrap?: boolean;
  orderedListMode?: OrderedListMode;
  /** 与 html.dark / 应用主题一致，供补全浮层等 CodeMirror 主题作用域使用 */
  themeMode?: ThemeMode;
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

function getDocumentReplacementRange(currentContent: string, nextContent: string) {
  let prefixLength = 0;
  const maxPrefixLength = Math.min(currentContent.length, nextContent.length);
  while (
    prefixLength < maxPrefixLength
    && currentContent.charCodeAt(prefixLength) === nextContent.charCodeAt(prefixLength)
  ) {
    prefixLength += 1;
  }

  let currentSuffixLength = currentContent.length;
  let nextSuffixLength = nextContent.length;
  while (
    currentSuffixLength > prefixLength
    && nextSuffixLength > prefixLength
    && currentContent.charCodeAt(currentSuffixLength - 1) === nextContent.charCodeAt(nextSuffixLength - 1)
  ) {
    currentSuffixLength -= 1;
    nextSuffixLength -= 1;
  }

  return {
    from: prefixLength,
    to: currentSuffixLength,
    insert: nextContent.slice(prefixLength, nextSuffixLength),
  };
}

export function useCodeMirror(options: UseCodeMirrorOptions): UseCodeMirrorReturn {
  const {
    content,
    documentKey = null,
    placeholder = '在此输入...',
    wordWrap = true,
    orderedListMode = 'strict',
    themeMode = 'light',
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
  const [markdownLanguageRevision, setMarkdownLanguageRevision] = useState(0);
  const changeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplyingOrderedNormalizationRef = useRef(false);
  const normalizationTimeoutRef = useRef<number | null>(null);
  const restoreScrollFrameRef = useRef<number | null>(null);
  const completionSourceRef = useRef(completionSource);
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScroll);
  const onPasteImageRef = useRef(onPasteImage);
  const onWikiLinkStartRef = useRef(onWikiLinkStart);
  const onContextMenuRef = useRef(onContextMenu);
  const loadedMarkdownLanguageKeysRef = useRef<Set<string>>(new Set());

  // Compartments for dynamic reconfiguration
  const compartments = useMemo(() => ({
    wrap: new Compartment(),
    placeholder: new Compartment(),
    keymap: new Compartment(),
    darkTheme: new Compartment(),
    markdown: new Compartment(),
  }), []);

  // Track if we're currently syncing content to avoid loops
  const isSyncingContentRef = useRef(false);
  const previousDocumentKeyRef = useRef<string | null>(documentKey);
  
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

  useEffect(() => {
    onChangeRef.current = onChange;
    if (changeTimeoutRef.current) {
      clearTimeout(changeTimeoutRef.current);
      changeTimeoutRef.current = null;
    }
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

  useEffect(() => {
    const missingDescriptions = extractMarkdownFenceLanguages(content)
      .map((lang) => ({ key: lang, description: resolveEditorCodeLanguage(lang) }))
      .filter((entry): entry is { key: string; description: NonNullable<ReturnType<typeof resolveEditorCodeLanguage>> } => (
        Boolean(entry.description) && !loadedMarkdownLanguageKeysRef.current.has(entry.key)
      ));

    if (missingDescriptions.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      missingDescriptions.map(async ({ key, description }) => {
        await description.load();
        if (!cancelled) {
          loadedMarkdownLanguageKeysRef.current.add(key);
        }
      }),
    )
      .then(() => {
        if (!cancelled) {
          setMarkdownLanguageRevision((prev) => prev + 1);
        }
      })
      .catch((error) => {
        console.warn('Failed to preload markdown fenced code languages:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [content]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: compartments.darkTheme.reconfigure(EditorView.darkTheme.of(themeMode === 'dark')),
    });
  }, [themeMode, compartments.darkTheme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: compartments.markdown.reconfigure(markdown({ codeLanguages: resolveEditorCodeLanguage })),
    });
  }, [compartments.markdown, markdownLanguageRevision]);

  // Initialize editor as soon as the DOM node is ready.
  useLayoutEffect(() => {
    if (!editorElementReady || !editorRef.current || viewRef.current) return;

    try {
      const customCompletion: CompletionSource = (ctx: CompletionContext) => {
        const fence = markdownFenceLanguageCompletion(ctx);
        if (fence) return fence;
        return completionSourceRef.current?.(ctx) ?? null;
      };

      const view = new EditorView({
        state: EditorState.create({
          doc: initialContentRef.current,
          extensions: [
            history(),
            compartments.darkTheme.of(EditorView.darkTheme.of(themeMode === 'dark')),
            editorAutocompletePanelBaseTheme,
            EditorView.inputHandler.of(markdownFencedCodeInputHandler),
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
              tooltipClass: () => 'editor-autocomplete-panel',
            }),
            tooltips({
              parent: editorRef.current.ownerDocument.body,
            }),
            EditorState.tabSize.of(LIST_INDENT_UNIT.length),
            indentUnit.of(LIST_INDENT_UNIT),
            compartments.markdown.of(markdown({ codeLanguages: resolveEditorCodeLanguage })),
            drawSelection(),
            frontmatterDecorations,
            fencedCodeDecorations,
            markdownListDecorations,
            compartments.wrap.of(wordWrap ? EditorView.lineWrapping : []),
            syntaxHighlighting(markdownHighlightStyle),
            compartments.placeholder.of(cmPlaceholder(placeholder)),
            EditorView.domEventHandlers({
              scroll: (() => {
                // 每帧合并多次 scroll，避免时间节流丢掉末次位置导致分屏联动偶发不同步
                let rafScheduled = false;
                return () => {
                  if (rafScheduled) return false;
                  rafScheduled = true;
                  requestAnimationFrame(() => {
                    rafScheduled = false;
                    const scrollHandler = onScrollRef.current;
                    if (scrollHandler) {
                      scrollHandler();
                    }
                  });
                  return false;
                };
              })(),
              paste: (event, view) => {
                if (handleStructuredPaste(view, event)) {
                  return true;
                }

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
                if (changeTimeoutRef.current) {
                  clearTimeout(changeTimeoutRef.current);
                }

                const nextContent = update.state.doc.toString();
                changeTimeoutRef.current = setTimeout(() => {
                  onChangeRef.current(nextContent);
                  changeTimeoutRef.current = null;
                }, 16);
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
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
        changeTimeoutRef.current = null;
      }
      if (normalizationTimeoutRef.current) {
        clearTimeout(normalizationTimeoutRef.current);
      }
      if (restoreScrollFrameRef.current !== null) {
        cancelAnimationFrame(restoreScrollFrameRef.current);
        restoreScrollFrameRef.current = null;
      }
      viewRef.current?.destroy();
      viewRef.current = null;
      setViewReady(false);
    };
  }, [editorElementReady, placeholder, wordWrap, orderedListMode, compartments.wrap, compartments.placeholder, compartments.keymap, compartments.markdown]);

  // Sync external content changes (only when not typing)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const safeContent = content || '';
    const currentContent = view.state.doc.toString();
    const isDocumentSwitch = previousDocumentKeyRef.current !== documentKey;
    if (currentContent === safeContent && !isDocumentSwitch) return;

    if (restoreScrollFrameRef.current !== null) {
      cancelAnimationFrame(restoreScrollFrameRef.current);
      restoreScrollFrameRef.current = null;
    }

    const scrollDom = view.scrollDOM;
    const previousScrollTop = scrollDom.scrollTop;
    const previousScrollLeft = scrollDom.scrollLeft;
    const shouldRestoreFocus = view.hasFocus;

    isSyncingContentRef.current = true;
    if (currentContent !== safeContent) {
      const replacement = getDocumentReplacementRange(currentContent, safeContent);
      view.dispatch({
        changes: replacement,
      });
    }

    const restoreScrollPosition = () => {
      if (isDocumentSwitch) {
        scrollDom.scrollTo({ top: 0, left: 0 });
        return;
      }
      const maxScrollTop = Math.max(0, scrollDom.scrollHeight - scrollDom.clientHeight);
      const maxScrollLeft = Math.max(0, scrollDom.scrollWidth - scrollDom.clientWidth);
      scrollDom.scrollTo({
        top: Math.min(previousScrollTop, maxScrollTop),
        left: Math.min(previousScrollLeft, maxScrollLeft),
      });
    };

    restoreScrollPosition();
    restoreScrollFrameRef.current = requestAnimationFrame(() => {
      restoreScrollFrameRef.current = null;
      restoreScrollPosition();
      if (shouldRestoreFocus && !view.hasFocus) {
        view.focus();
      }
    });

    isSyncingContentRef.current = false;
    previousDocumentKeyRef.current = documentKey;
  }, [content, documentKey]);

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
