import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAppStore, selectContent } from './store/appStore';
import { useFileSystem } from './hooks/useFileSystem';
import { useViewMode } from './hooks/useViewMode';
import { useSettings } from './hooks/useSettings';
import { useGlobalKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAutoSave } from './hooks/useAutoSave';
import { useOutline } from './hooks/useOutline';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useStoreHydration } from './hooks/useStoreHydration';
import { useShikiHighlighter } from './hooks/useShikiHighlighter';
import { useThemeSync } from './hooks/useThemeSync';
import { useAIAnalyze } from './hooks/useAIAnalyze';
import { useFileOperations } from './hooks/useFileOperations';
import { Sidebar } from './components/sidebar/Sidebar';
import { Toolbar } from './components/toolbar/Toolbar';
import { SettingsModal } from './components/settings/SettingsModal';
import { SplitView } from './components/editor/SplitView';
import { OutlinePanel } from './components/outline/OutlinePanel';
import { ContentSearch } from './components/search/ContentSearch';
import { TabBar } from './components/tabs/TabBar';
import { useExportActions } from './hooks/useExportActions';
import { ViewMode } from './types';
import { focusEditorRangeByOffset } from './utils/editorSelectionBridge';
import { requestPreviewHeadingScroll } from './utils/previewNavigationBridge';
import { ensureDynamicFontFaces } from './utils/fontSettings';

const SIDEBAR_WIDTH_STORAGE_KEY = 'markdown-press.sidebar-width';
const OUTLINE_WIDTH_STORAGE_KEY = 'markdown-press.outline-width';
const DEFAULT_SIDEBAR_WIDTH = 288;
const DEFAULT_OUTLINE_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 420;
const MIN_OUTLINE_WIDTH = 180;
const MAX_OUTLINE_WIDTH = 360;
const MIN_RESPONSIVE_SIDEBAR_WIDTH = 160;
const MIN_SINGLE_VIEW_WORKSPACE_WIDTH = 760;
const MIN_EDITOR_WORKSPACE_WIDTH_WITH_OUTLINE = 620;
const MIN_SPLIT_WORKSPACE_WIDTH = 920;
const MIN_PREVIEW_WORKSPACE_WIDTH_WITH_OUTLINE = 620;
const MIN_SPLIT_WORKSPACE_WIDTH_WITH_OUTLINE = 720;
const OUTLINE_PANEL_GAP = 32;
const SHELL_EDGE_GAP = 24;

function getMinimumWorkspaceWidth(viewMode: ViewMode): number {
  return viewMode === ViewMode.SPLIT ? MIN_SPLIT_WORKSPACE_WIDTH : MIN_SINGLE_VIEW_WORKSPACE_WIDTH;
}

function getMinimumWorkspaceWidthWithOutline(viewMode: ViewMode): number {
  if (viewMode === ViewMode.SPLIT) {
    return MIN_SPLIT_WORKSPACE_WIDTH_WITH_OUTLINE;
  }

  if (viewMode === ViewMode.PREVIEW) {
    return MIN_PREVIEW_WORKSPACE_WIDTH_WITH_OUTLINE;
  }

  return MIN_EDITOR_WORKSPACE_WIDTH_WITH_OUTLINE;
}

function clampPanelWidth(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getStoredPanelWidth(storageKey: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback;

  const rawValue = window.localStorage.getItem(storageKey);
  const parsedValue = rawValue ? Number(rawValue) : Number.NaN;

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return clampPanelWidth(parsedValue, min, max);
}

function getPathBasename(path: string | null | undefined): string {
  if (!path) return '';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function findFileInTree(nodes: import('./types').FileNode[], id: string): import('./types').FileNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFileInTree(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

const App: React.FC = () => {
  const {
    files,
    rootFolderPath,
    activeTabId,
    currentFilePath,
    viewMode,
    isSidebarOpen,
    isSettingsOpen,
    isSaving,
    isAnalyzing,
    settings,
    outlineHeadings,
    activeHeadingId,
    setContent,
    setCurrentFilePath,
    setSidebarOpen,
    setSettingsOpen,
    setActiveHeadingId,
    showNotification,
    updateSettings,
  } = useAppStore();

  const content = useAppStore(selectContent);

  const { openDirectory, openKnowledgeBase, readFile, watchFile } = useFileSystem();
  const { setViewMode } = useViewMode();
  const { toggleTheme } = useSettings();
  const settingsHydrated = useStoreHydration();
  const { highlighter } = useShikiHighlighter();
  const { handleAIAnalyze } = useAIAnalyze();
  const fileOps = useFileOperations();

  useOutline();
  useUndoRedo();

  useThemeSync(settings.themeMode);

  useEffect(() => {
    ensureDynamicFontFaces(settings);
  }, [settings.englishFontFamily, settings.chineseFontFamily]);

  const { forceSave } = useAutoSave({ debounceMs: 500, enabled: true });
  const { handleExportToPdf, handlePublishBlog } = useExportActions(forceSave);

  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isSearchBarOpen, setIsSearchBarOpen] = useState(false);
  const [mainContentWidth, setMainContentWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : 0
  ));
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : 1440
  ));
  const [sidebarWidth, setSidebarWidth] = useState(() => (
    getStoredPanelWidth(
      SIDEBAR_WIDTH_STORAGE_KEY,
      DEFAULT_SIDEBAR_WIDTH,
      MIN_SIDEBAR_WIDTH,
      MAX_SIDEBAR_WIDTH
    )
  ));
  const [outlineWidth, setOutlineWidth] = useState(() => (
    getStoredPanelWidth(
      OUTLINE_WIDTH_STORAGE_KEY,
      DEFAULT_OUTLINE_WIDTH,
      MIN_OUTLINE_WIDTH,
      MAX_OUTLINE_WIDTH
    )
  ));
  const autoOpenAttemptedRef = React.useRef(false);
  const mainContentRef = useRef<HTMLElement | null>(null);

  // Auto-open last knowledge base after hydration
  useEffect(() => {
    if (!settingsHydrated || autoOpenAttemptedRef.current) return;
    autoOpenAttemptedRef.current = true;

    const lastKnowledgeBase = settings.lastKnowledgeBasePath;
    if (!lastKnowledgeBase || rootFolderPath) return;

    void openKnowledgeBase(lastKnowledgeBase, { silentSuccess: true });
  }, [settingsHydrated, settings.lastKnowledgeBasePath, rootFolderPath, openKnowledgeBase]);

  // Keep the watched/saved path derived from the active tab and current file tree.
  useEffect(() => {
    const nextPath = activeTabId ? findFileInTree(files, activeTabId)?.path ?? null : null;
    if (currentFilePath !== nextPath) {
      setCurrentFilePath(nextPath);
    }
  }, [activeTabId, files, currentFilePath, setCurrentFilePath]);

  // Watch active file for external changes and auto-reload when safe
  useEffect(() => {
    if (!activeTabId || !currentFilePath) return;

    let disposed = false;
    let unwatch: (() => void) | null = null;

    const setupWatcher = async () => {
      unwatch = await watchFile(currentFilePath, async (event) => {
        if (disposed) return;
        if (event?.type === 'deleted') {
          showNotification('File was deleted on disk.', 'error');
          return;
        }
        if (event?.type === 'error') {
          showNotification('Failed to watch file changes on disk.', 'error');
          return;
        }
        if (event?.type !== 'modified') return;

        const state = useAppStore.getState();
        if (state.hasUnsavedChanges(activeTabId)) {
          showNotification('File changed on disk. Save or discard local edits before reloading.', 'error');
          return;
        }

        const node = findFileInTree(state.files, activeTabId);
        if (!node || node.type !== 'file') return;

        try {
          const latestContent = await readFile(node);
          const currentCached = useAppStore.getState().fileContents[activeTabId];
          if (currentCached === latestContent) return;

          useAppStore.getState().updateTabContent(activeTabId, latestContent);
          showNotification('File reloaded from disk.', 'success');
        } catch {
          showNotification('Failed to reload file changed on disk.', 'error');
        }
      });
    };

    setupWatcher();

    return () => {
      disposed = true;
      if (unwatch) unwatch();
    };
  }, [activeTabId, currentFilePath, readFile, showNotification, watchFile]);

  // Outline toggle shortcut (Ctrl+O)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setIsOutlineOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const mainEl = mainContentRef.current;
    if (!mainEl) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setMainContentWidth(entry.contentRect.width);
    });

    resizeObserver.observe(mainEl);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(OUTLINE_WIDTH_STORAGE_KEY, String(outlineWidth));
  }, [outlineWidth]);

  // Global keyboard shortcuts
  useGlobalKeyboardShortcuts(
    async () => {
      if (currentFilePath) {
        await forceSave();
        showNotification('Saved!', 'success');
      }
    },
    handleAIAnalyze,
    () => setIsSearchBarOpen(true),
    () => setSettingsOpen(true)
  );

  const handleHeadingClick = useCallback((id: string, line: number) => {
    setActiveHeadingId(id);

    const lineIndex = Math.max(0, line - 1);
    const lines = content.split('\n');
    const cursorPos = lines.slice(0, lineIndex).reduce((sum, l) => sum + l.length + 1, 0);

    if (viewMode !== ViewMode.PREVIEW) {
      focusEditorRangeByOffset(cursorPos, cursorPos, { alignTopRatio: 0.3 });
    }

    if (viewMode !== ViewMode.EDITOR) {
      const scrollOptions = { alignTopRatio: 0.18, behavior: 'smooth' as const };
      requestPreviewHeadingScroll(activeTabId, id, scrollOptions);
    }
  }, [activeTabId, content, setActiveHeadingId, viewMode]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
  }, [setContent]);

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    setSidebarWidth(clampPanelWidth(nextWidth, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH));
  }, []);

  const handleOutlineWidthChange = useCallback((nextWidth: number) => {
    setOutlineWidth(clampPanelWidth(nextWidth, MIN_OUTLINE_WIDTH, MAX_OUTLINE_WIDTH));
  }, []);

  const handleSwitchKnowledgeBase = useCallback(async () => {
    await openDirectory();
  }, [openDirectory]);

  const activeFile = activeTabId ? findFileInTree(files, activeTabId) : undefined;
  const notification = useAppStore(state => state.notification);
  const currentKnowledgeBaseName = useMemo(() => getPathBasename(rootFolderPath), [rootFolderPath]);
  const hasKnowledgeBaseHistory = (settings.knowledgeBases?.length || 0) > 0;
  const shouldShowKnowledgeBaseOnboarding =
    settingsHydrated &&
    !rootFolderPath &&
    files.length === 0 &&
    !hasKnowledgeBaseHistory;
  const minimumWorkspaceWidth = getMinimumWorkspaceWidth(viewMode);
  const responsiveOutlineWidth = Math.min(
    outlineWidth,
    Math.max(MIN_OUTLINE_WIDTH, Math.floor(mainContentWidth * 0.22))
  );
  const outlineReservationWidth = isOutlineOpen ? responsiveOutlineWidth + OUTLINE_PANEL_GAP : 0;
  const maxSidebarWidthForViewport = Math.max(
    MIN_RESPONSIVE_SIDEBAR_WIDTH,
    viewportWidth - minimumWorkspaceWidth - outlineReservationWidth - SHELL_EDGE_GAP
  );
  const responsiveSidebarWidth = isSidebarOpen
    ? Math.min(sidebarWidth, maxSidebarWidthForViewport)
    : sidebarWidth;
  const workspaceWidthWithOutline = mainContentWidth - responsiveOutlineWidth - OUTLINE_PANEL_GAP;
  const minimumWorkspaceWidthWithOutline = getMinimumWorkspaceWidthWithOutline(viewMode);
  const canShowOutlinePanel = Boolean(activeTabId) && workspaceWidthWithOutline >= minimumWorkspaceWidthWithOutline;
  const isOutlineVisible = isOutlineOpen && canShowOutlinePanel;
  const canShowOutlineToggle = Boolean(activeTabId);
  const contentDensity = (
    viewMode === ViewMode.SPLIT ||
    mainContentWidth < 1360 ||
    (isSidebarOpen && mainContentWidth < 1500) ||
    isOutlineVisible
  ) ? 'compact' : 'comfortable';

  if (!settingsHydrated) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-black text-gray-500 dark:text-gray-400 flex items-center justify-center">
        <div className="text-sm font-medium tracking-wide">Loading workspace...</div>
      </div>
    );
  }

  if (shouldShowKnowledgeBaseOnboarding) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/90 dark:bg-gray-900/80 backdrop-blur-md shadow-xl p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold tracking-tight">
              KB
            </div>
            <div>
              <h1 className="text-xl font-semibold">Choose Your Knowledge Base</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Open a folder as your vault to start writing.</p>
            </div>
          </div>
          <button
            onClick={handleSwitchKnowledgeBase}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black font-medium hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              <line x1="12" y1="15" x2="12" y2="10" />
              <polyline points="9 13 12 10 15 13" />
            </svg>
            Open Knowledge Base
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden text-sm">
      <Sidebar
        files={files}
        activeFileId={activeTabId}
        onFileSelect={fileOps.handleFileSelect}
        onCreateFile={(folder, fileName) => fileOps.handleCreateFile(folder, fileName)}
        onNewFolder={(folder, name) => fileOps.handleNewFolder(folder, name)}
        onRename={fileOps.handleRename}
        onDelete={fileOps.handleDelete}
        onReveal={fileOps.handleRevealInExplorer}
        onOpenInBrowser={fileOps.handleOpenInFileExplorer}
        onMoveToTrash={fileOps.handleMoveToTrash}
        onRestoreFromTrash={fileOps.handleRestoreFromTrash}
        onDeleteForever={fileOps.handleDeleteForever}
        onEmptyTrash={fileOps.handleEmptyTrash}
        onMoveNode={fileOps.handleMoveNode}
        onMoveToRoot={fileOps.handleMoveToRoot}
        currentKnowledgeBaseName={currentKnowledgeBaseName}
        currentKnowledgeBasePath={rootFolderPath}
        onSwitchKnowledgeBase={handleSwitchKnowledgeBase}
        isOpen={isSidebarOpen}
        width={responsiveSidebarWidth}
        onWidthChange={handleSidebarWidthChange}
        onClose={() => setSidebarOpen(false)}
      />

      <main
        ref={mainContentRef}
        className="flex-1 flex flex-col h-full min-w-0 bg-gray-50 dark:bg-black transition-colors duration-300"
      >
        <Toolbar
          fileName={activeFile?.name || ''}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onAIAnalyze={handleAIAnalyze}
          isAnalyzing={isAnalyzing}
          isSaving={isSaving}
          isSidebarOpen={isSidebarOpen}
          onMenuClick={() => setSidebarOpen(!isSidebarOpen)}
          onToggleTheme={toggleTheme}
          themeMode={settings.themeMode}
          onPublishBlog={handlePublishBlog}
          onExportPdf={handleExportToPdf}
        />

        <TabBar onToggleSidebar={() => setSidebarOpen(true)} />

        <div className="flex-1 min-w-0 flex overflow-hidden relative">
          <SplitView
            highlighter={highlighter}
            onContentChange={handleContentChange}
            isOutlineOpen={isOutlineVisible}
            canShowOutline={canShowOutlinePanel}
            canShowOutlineToggle={canShowOutlineToggle}
            contentDensity={contentDensity}
            onToggleOutline={() => setIsOutlineOpen(!isOutlineOpen)}
          />
          {isOutlineVisible && (
            <OutlinePanel
              headings={outlineHeadings}
              activeHeadingId={activeHeadingId}
              onHeadingClick={handleHeadingClick}
              width={responsiveOutlineWidth}
              onWidthChange={handleOutlineWidthChange}
            />
          )}
          {isSearchBarOpen && (
            <ContentSearch onClose={() => setIsSearchBarOpen(false)} />
          )}
        </div>
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
      />

      {notification && (
        <div className={`fixed top-6 right-6 px-4 py-3 rounded-xl shadow-xl z-50 animate-fade-in border glass ${
          notification.type === 'success'
            ? 'text-green-600 border-green-100 dark:border-green-900'
            : 'text-red-500 border-red-100 dark:border-red-900'
        }`}>
          {notification.msg}
        </div>
      )}
    </div>
  );
};

export default App;
