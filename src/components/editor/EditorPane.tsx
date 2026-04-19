/**
 * EditorPane - 简化重构版
 * 
 * 使用新提取的 hooks：
 * - useCodeMirror: 编辑器核心
 * - useWikiLinks: WikiLink 自动补全和预览
 * - useImagePaste: 图片粘贴
 * - useScrollSync: 滚动同步
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore, selectContent } from '../../store/appStore';
import { getPaneLayoutMetrics, type PaneDensity } from './paneLayout';
import { clearActiveEditorView, registerActiveEditorView } from '../../utils/editorSelectionBridge';
import { startCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { getResolvedCodeFontFamily, getResolvedEditorFontFamily } from '../../utils/fontSettings';
import { useFileSystem } from '../../hooks/useFileSystem';
import { useCodeMirror, useWikiLinks, useImagePaste, useScrollSync } from './hooks';
import type { WikiLinkPreviewData } from './hooks';
import { throttle } from '../../utils/throttle';
import { findOpenWikiLinkAt } from '../../utils/wikiLinkEditor';
import { useI18n } from '../../hooks/useI18n';
import type { ShikiHighlighter } from '../../hooks/useShikiHighlighter';
import { uploadImageToHosting, isImageHostingEnabled } from '../../services/imageHostingService';
import { readFile as tauriReadFile } from '@tauri-apps/plugin-fs';
import { createAttachmentResolverContext, resolveAttachmentTarget } from '../../utils/attachmentResolver';

interface EditorPaneProps {
  placeholder?: string;
  onContentChange?: (content: string) => void;
  onScroll?: (percentage: number) => void;
  onGenerateWikiFromSelection?: (selection: { text: string; from: number; to: number }) => Promise<string | null>;
  highlighter?: ShikiHighlighter | null;
  density?: PaneDensity;
}

export interface EditorPaneHandle {
  cancelScrollSync: () => void;
  syncScrollTo: (percentage: number, options?: { immediate?: boolean }) => void;
  scrollToTop: () => void;
}

const EDITOR_LINE_HEIGHT = 1.95;

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

function isPreviewModifierPressed(event: Pick<KeyboardEvent | MouseEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return isMacPlatform() ? event.metaKey : event.ctrlKey;
}

function isPreviewModifierKey(key: string): boolean {
  return key === 'Meta' || key === 'Control';
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
    // Use dynamic import to avoid circular dependency
    const match = findOpenWikiLinkAt(text, pos + offset);
    if (match) return match;
  }
  return null;
}

interface LocalImageMatch {
  src: string;
  alt: string;
  from: number;
  to: number;
}

const STANDARD_IMAGE_RE = /!\[([^\]]*)\]\(<?([^)\s>]+)>?\)/g;
const OBSIDIAN_IMAGE_RE = /!\[\[([^\]|]+?)(?:\|([^\]]*?))?\]\]/g;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function isRemoteUrl(src: string): boolean {
  return /^(https?:|data:|blob:)/i.test(src) || src.startsWith('//');
}

function findLocalImageAtPos(docText: string, lineFrom: number, lineText: string, pos: number): LocalImageMatch | null {
  let match: RegExpExecArray | null;

  STANDARD_IMAGE_RE.lastIndex = 0;
  while ((match = STANDARD_IMAGE_RE.exec(lineText)) !== null) {
    const mFrom = lineFrom + match.index;
    const mTo = mFrom + match[0].length;
    if (pos >= mFrom && pos <= mTo) {
      const src = match[2].trim();
      if (!isRemoteUrl(src) && IMAGE_EXT_RE.test(src)) {
        return { src, alt: match[1] || src.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image', from: mFrom, to: mTo };
      }
    }
  }

  OBSIDIAN_IMAGE_RE.lastIndex = 0;
  while ((match = OBSIDIAN_IMAGE_RE.exec(lineText)) !== null) {
    const mFrom = lineFrom + match.index;
    const mTo = mFrom + match[0].length;
    if (pos >= mFrom && pos <= mTo) {
      const src = match[1].trim();
      if (!isRemoteUrl(src) && IMAGE_EXT_RE.test(src)) {
        return { src, alt: match[2] || src.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image', from: mFrom, to: mTo };
      }
    }
  }

  return null;
}

interface HoverPreviewState {
  preview: WikiLinkPreviewData;
  x: number;
  y: number;
  target: string;
}

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(({
  placeholder,
  onContentChange,
  onScroll,
  onGenerateWikiFromSelection,
  highlighter,
  density = 'comfortable' as PaneDensity
}, ref) => {
  const { t } = useI18n();
  const content = useAppStore(selectContent);
  const {
    setContent,
    setContentForFile,
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
  const resolvedPlaceholder = placeholder ?? t('editor_emptyState');

  const editorFontFamily = useMemo(() => getResolvedEditorFontFamily(settings), [settings.editorFontFamily]);
  const codeFontFamily = useMemo(() => getResolvedCodeFontFamily(settings), [settings.codeFontFamily]);
  const { writeBinaryFile, refreshFileTree, readFile } = useFileSystem();

  const editorRootRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const lastResetTabIdRef = useRef<string | null>(null);
  const tabResetFrameRef = useRef<number | null>(null);
  
  // Pane layout state
  const [paneWidth, setPaneWidth] = useState(0);
  const layoutMetrics = useMemo(() => getPaneLayoutMetrics(paneWidth, density), [paneWidth, density]);
  const [selectionMenu, setSelectionMenu] = useState<{
    x: number;
    y: number;
    from: number;
    to: number;
    text: string;
  } | null>(null);
  const [isGeneratingWiki, setIsGeneratingWiki] = useState(false);
  const [imageMenu, setImageMenu] = useState<{
    x: number;
    y: number;
    match: LocalImageMatch;
  } | null>(null);
  const [isUploadingSingle, setIsUploadingSingle] = useState(false);

  // Completion trigger ref
  const completionStartFrameRef = useRef<number | null>(null);
  const closeSelectionMenu = useCallback(() => {
    setSelectionMenu(null);
  }, []);

  // Content change handler
  const updateContent = useCallback((nextContent: string) => {
    if (onContentChange) {
      onContentChange(nextContent);
      return;
    }

    if (!activeTabId) {
      setContent(nextContent);
      return;
    }

    setContentForFile(activeTabId, nextContent);
  }, [activeTabId, onContentChange, setContent, setContentForFile]);

  // WikiLinks hook
  const wikiLinks = useWikiLinks({
    content,
    currentFilePath,
    rootFolderPath,
    files,
    fileContents,
    highlighter,
    themeMode: settings.themeMode as 'light' | 'dark',
    readFile,
  });

  // Image paste hook
  const { handlePastedImage } = useImagePaste({
    rootFolderPath,
    currentFilePath,
    resourceFolder: settings.resourceFolder,
    attachmentPasteFormat: settings.attachmentPasteFormat,
    writeBinaryFile,
    refreshFileTree,
    showNotification,
  });

  // Scroll sync hook
  const scrollSync = useScrollSync({ onScroll });

  const closeImageMenu = useCallback(() => setImageMenu(null), []);

  const handleSelectionContextMenu = useCallback((event: MouseEvent, view: EditorView) => {
    const clickPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const selection = view.state.selection.main;

    if (clickPos != null) {
      const line = view.state.doc.lineAt(clickPos);
      const imgMatch = findLocalImageAtPos(view.state.doc.toString(), line.from, line.text, clickPos);
      if (imgMatch) {
        event.preventDefault();
        closeSelectionMenu();
        setImageMenu({ x: event.clientX, y: event.clientY, match: imgMatch });
        return true;
      }
    }

    setImageMenu(null);

    if (!selection.empty && onGenerateWikiFromSelection) {
      if (clickPos != null && clickPos >= selection.from && clickPos <= selection.to) {
        const selectedText = view.state.sliceDoc(selection.from, selection.to).trim();
        if (selectedText) {
          event.preventDefault();
          setSelectionMenu({
            x: event.clientX,
            y: event.clientY,
            from: selection.from,
            to: selection.to,
            text: selectedText,
          });
          return true;
        }
      }
    }

    closeSelectionMenu();
    return false;
  }, [closeSelectionMenu, onGenerateWikiFromSelection]);

  // CodeMirror hook
  const codeMirror = useCodeMirror({
    content,
    documentKey: activeTabId,
    placeholder: resolvedPlaceholder,
    wordWrap: settings.wordWrap,
    orderedListMode: settings.orderedListMode,
    themeMode: settings.themeMode as 'light' | 'dark',
    onChange: updateContent,
    onScroll: scrollSync.handleScroll,
    completionSource: wikiLinks.completionSource,
    onPasteImage: handlePastedImage,
    onWikiLinkStart: () => {
      if (completionStartFrameRef.current !== null) {
        cancelAnimationFrame(completionStartFrameRef.current);
      }
      completionStartFrameRef.current = requestAnimationFrame(() => {
        completionStartFrameRef.current = null;
        // Trigger completion
      });
    },
    onContextMenu: handleSelectionContextMenu,
  });

  const setEditorContainer = useCallback((element: HTMLDivElement | null) => {
    editorRootRef.current = element;
    codeMirror.editorRef(element);
  }, [codeMirror.editorRef]);

  const handleGenerateWikiClick = useCallback(async () => {
    const menuState = selectionMenu;
    const view = codeMirror.view;
    if (!menuState || !view || !onGenerateWikiFromSelection) {
      return;
    }

    setIsGeneratingWiki(true);
    try {
      const replacement = await onGenerateWikiFromSelection({
        text: menuState.text,
        from: menuState.from,
        to: menuState.to,
      });

      if (!replacement) {
        return;
      }

      view.dispatch({
        changes: {
          from: menuState.from,
          to: menuState.to,
          insert: replacement,
        },
        selection: {
          anchor: menuState.from + replacement.length,
        },
      });
      closeSelectionMenu();
    } finally {
      setIsGeneratingWiki(false);
    }
  }, [closeSelectionMenu, codeMirror.view, onGenerateWikiFromSelection, selectionMenu]);

  const handleUploadLocalImage = useCallback(async () => {
    const menu = imageMenu;
    const view = codeMirror.view;
    if (!menu || !view) return;

    const { match } = menu;
    closeImageMenu();

    const currentSettings = useAppStore.getState().settings;
    if (!currentSettings.imageHosting?.provider || currentSettings.imageHosting.provider === 'none') {
      showNotification(t('notifications_imageHostingNotConfigured'), 'error');
      return;
    }

    setIsUploadingSingle(true);

    try {
      const attachmentContext = createAttachmentResolverContext(files, rootFolderPath, currentFilePath);
      const resolved = await resolveAttachmentTarget(attachmentContext, match.src.trim());

      if (!resolved) {
        let displayPath = match.src.trim();
        try {
          displayPath = decodeURIComponent(displayPath);
        } catch {
          /* keep raw */
        }
        showNotification(t('notifications_imageFileNotFound', { path: displayPath }), 'error');
        return;
      }

      const { path: resolvedPath, name: resolvedName } = resolved;
      const data = await tauriReadFile(resolvedPath);
      const filename = resolvedName || match.src.split(/[/\\]/).pop() || 'image.png';
      const result = await uploadImageToHosting(data.buffer as ArrayBuffer, filename, currentSettings);

      const replacement = `![${match.alt}](${result.url})`;
      view.dispatch({
        changes: { from: match.from, to: match.to, insert: replacement },
        selection: { anchor: match.from + replacement.length },
      });
      showNotification(t('notifications_imageUploaded'), 'success');
    } catch (err) {
      console.error('Single image upload failed:', err);
      const detail = err instanceof Error ? err.message : String(err);
      showNotification(t('notifications_imageUploadFailed', { error: detail }), 'error');
    } finally {
      setIsUploadingSingle(false);
    }
  }, [imageMenu, codeMirror.view, closeImageMenu, currentFilePath, rootFolderPath, files, showNotification, t]);

  // Register/clear editor view for selection bridge
  useEffect(() => {
    if (codeMirror.view) {
      registerActiveEditorView(codeMirror.view);
      scrollSync.registerView(codeMirror.view);
    }
    return () => {
      if (codeMirror.view) {
        clearActiveEditorView(codeMirror.view);
      }
      scrollSync.registerView(null);
    };
  }, [codeMirror.view, scrollSync]);

  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    cancelScrollSync: scrollSync.cancelScrollSync,
    syncScrollTo: scrollSync.syncScrollTo,
    scrollToTop: () => {
      const view = codeMirror.view;
      if (view) {
        view.scrollDOM.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
  }), [scrollSync, codeMirror.view]);

  // Pane width tracking
  useLayoutEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;

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

  // Layout style
  const layoutStyle = useMemo(() => ({
    '--pane-backdrop-px': `${layoutMetrics.backdropPaddingX}px`,
    '--pane-backdrop-py': `${layoutMetrics.backdropPaddingY}px`,
    '--pane-frame-max-width': `${layoutMetrics.frameMaxWidth}px`,
    '--pane-sheet-max-width': `${layoutMetrics.sheetMaxWidth}px`,
    '--pane-sheet-radius': `${layoutMetrics.sheetRadius}px`,
    '--pane-content-px': `${layoutMetrics.contentPaddingX}px`,
    '--pane-content-top': `${layoutMetrics.contentPaddingTop}px`,
    '--pane-content-bottom': `${layoutMetrics.contentPaddingBottom}px`,
    '--editor-content-bottom': `max(${layoutMetrics.contentPaddingBottom}px, 40vh)`,
    '--editor-font-family': editorFontFamily,
    '--editor-font-size': `${settings.fontSize}px`,
    '--editor-code-font-family': codeFontFamily,
    '--editor-code-font-size': `${Math.max(12, settings.fontSize - 2)}px`,
    '--editor-line-height': String(EDITOR_LINE_HEIGHT),
  }) as React.CSSProperties, [layoutMetrics, editorFontFamily, settings.fontSize, codeFontFamily]);

  // Hover preview state
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const previewModifierPressedRef = useRef(false);
  const keyboardModifierPressedRef = useRef(false);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const hoverPreviewRequestRef = useRef(0);
  const hoverPreviewTargetRef = useRef<string | null>(null);

  // Hover preview handlers
  const hideHoverPreview = useCallback(() => {
    hoverPreviewRequestRef.current += 1;
    hoverPreviewTargetRef.current = null;
    setHoverPreview(null);
  }, []);

  const updateHoverPreviewAtPointer = useCallback(async (clientX: number, clientY: number) => {
    const view = codeMirror.view;
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

    const activeTarget = match.rawQuery;
    hoverPreviewTargetRef.current = activeTarget;

    if (hoverPreview?.target === activeTarget) {
      setHoverPreview(current => current ? { ...current, x: clientX, y: clientY } : current);
      return;
    }

    const requestId = hoverPreviewRequestRef.current + 1;
    hoverPreviewRequestRef.current = requestId;
    const preview = await wikiLinks.buildPreview(activeTarget);

    if (
      hoverPreviewRequestRef.current !== requestId ||
      hoverPreviewTargetRef.current !== activeTarget ||
      !previewModifierPressedRef.current
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
  }, [codeMirror.view, hideHoverPreview, hoverPreview?.target, wikiLinks]);

  // Keyboard/mouse handlers for preview modifier
  useEffect(() => {
    const syncModifierState = (active: boolean) => {
      keyboardModifierPressedRef.current = active;
      previewModifierPressedRef.current = active;
      if (!active) hideHoverPreview();
    };

    const updatePointer = (clientX: number, clientY: number) => {
      lastPointerRef.current = { clientX, clientY };
      if (!previewModifierPressedRef.current) return;
      void updateHoverPreviewAtPointer(clientX, clientY);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isPreviewModifierKey(event.key)) {
        syncModifierState(true);
      } else if (isPreviewModifierPressed(event)) {
        syncModifierState(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isPreviewModifierKey(event.key)) {
        syncModifierState(false);
      } else if (!event.metaKey && !event.ctrlKey && previewModifierPressedRef.current) {
        syncModifierState(false);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      previewModifierPressedRef.current = keyboardModifierPressedRef.current || isPreviewModifierPressed(event);
      if (previewModifierPressedRef.current) {
        updatePointer(event.clientX, event.clientY);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('mousemove', handleMouseMove, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
    };
  }, [hideHoverPreview, updateHoverPreviewAtPointer]);

  useEffect(() => {
    if (!selectionMenu) return;

    const handleClick = () => {
      closeSelectionMenu();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSelectionMenu();
      }
    };
    const handleScroll = () => {
      closeSelectionMenu();
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [closeSelectionMenu, selectionMenu]);

  useEffect(() => {
    if (!imageMenu) return;
    const dismiss = () => closeImageMenu();
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('click', dismiss);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [closeImageMenu, imageMenu]);

  // Cancel scroll sync on view mode change
  useEffect(() => {
    scrollSync.cancelScrollSync();
  }, [viewMode, scrollSync]);

  useEffect(() => {
    const view = codeMirror.view;
    if (!activeTabId) {
      lastResetTabIdRef.current = null;
      return;
    }
    if (!view) return;
    if (lastResetTabIdRef.current === activeTabId) return;

    lastResetTabIdRef.current = activeTabId;
    tabResetFrameRef.current = window.requestAnimationFrame(() => {
      tabResetFrameRef.current = null;
      if (codeMirror.view !== view) return;

      const mainSelection = view.state.selection.main;
      const shouldResetSelection = !mainSelection.empty || mainSelection.from !== 0;

      if (shouldResetSelection) {
        view.dispatch({
          selection: { anchor: 0, head: 0 },
        });
      }

      view.scrollDOM.scrollTo({ top: 0, left: 0 });
      scrollSync.cancelScrollSync();
      closeSelectionMenu();
    });

    return () => {
      if (tabResetFrameRef.current !== null) {
        cancelAnimationFrame(tabResetFrameRef.current);
        tabResetFrameRef.current = null;
      }
    };
  }, [activeTabId, closeSelectionMenu, codeMirror.view, scrollSync]);

  if (!activeTabId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50/30 dark:bg-black/20 select-none">
        <svg className="w-16 h-16 mb-4 opacity-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <p className="text-sm font-medium">{t('editor_emptyState')}</p>
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
          {t('toolbar_saving')}
        </div>
      )}

      <div className="editor-pane-backdrop flex-1 min-h-0 overflow-hidden">
        <div className="editor-pane-scroll h-full overflow-hidden">
          <div className="editor-pane-frame h-full w-full">
            <div className="editor-pane-sheet h-full w-full">
              <div ref={setEditorContainer} className="editor-pane-codemirror h-full w-full" />
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

      {selectionMenu && createPortal(
        <div
          className="fixed z-[160] min-w-[220px] rounded-xl border border-gray-200/70 bg-white/95 py-1.5 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-gray-900/95"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              void handleGenerateWikiClick();
            }}
            disabled={isGeneratingWiki}
            className="mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2.8 6.2L21 9l-4.5 4 1.2 6.1L12 16l-5.7 3.1L7.5 13 3 9l6.2-.8L12 2z" />
            </svg>
            {isGeneratingWiki ? t('ai_generatingWiki') : t('ai_generateWiki')}
          </button>
        </div>,
        document.body
      )}

      {imageMenu && createPortal(
        <div
          className="fixed z-[160] min-w-[220px] rounded-xl border border-gray-200/70 bg-white/95 py-1.5 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-gray-900/95"
          style={{ left: imageMenu.x, top: imageMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-3 mb-1 mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">
            {imageMenu.match.src}
          </div>
          <button
            type="button"
            onClick={() => { void handleUploadLocalImage(); }}
            disabled={isUploadingSingle}
            className="mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {isUploadingSingle ? (
              <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
            {isUploadingSingle ? t('toolbar_uploadingImage') : t('editor_uploadToHosting')}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
});

EditorPane.displayName = 'EditorPane';
