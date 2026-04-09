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
import { PromptDialog } from './components/ui/Dialog';
import { useExportActions } from './hooks/useExportActions';
import { ViewMode } from './types';
import { isTauriEnvironment } from './types/filesystem';
import { focusEditorRangeByOffset } from './utils/editorSelectionBridge';
import { requestPreviewHeadingScroll } from './utils/previewNavigationBridge';
import { ensureDynamicFontFaces } from './utils/fontSettings';
import { LAYOUT, clamp, getStoredPanelWidth, getMinimumWorkspaceWidth, getMinimumWorkspaceWidthWithOutline } from './config/layout';
import { throttle } from './utils/throttle';
import { logEnvironment } from './utils/environment';
import { migrateLegacySensitiveSettings } from './services/secureSettingsService';
import type { PaneDensity } from './components/editor/paneLayout';
import { useI18n } from './hooks/useI18n';

// Layout constants moved to src/config/layout.ts
// Using centralized configuration for better maintainability

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

// Log environment info on app initialization for debugging
if (typeof window !== 'undefined') {
  logEnvironment();
}

const App: React.FC = () => {
  const { t } = useI18n();
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
    isPublishing,
    settings,
    outlineHeadings,
    activeHeadingId,
    closeTab,
    setContent,
    setContentForFile,
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
  const { highlighter } = useShikiHighlighter(content);
  const { handleAIAnalyze, handleGenerateWikiFromSelection } = useAIAnalyze();
  const fileOps = useFileOperations();

  useOutline();
  useUndoRedo();

  useThemeSync(settings.themeMode);

  useEffect(() => {
    ensureDynamicFontFaces(settings).then(() => {
      // After fonts are loaded, notify editor to refresh
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--font-loaded-timestamp', Date.now().toString());
      }
    });
  }, [settings.englishFontFamily, settings.chineseFontFamily]);

  const { forceSave } = useAutoSave({ debounceMs: 500, enabled: true });
  const { handleExportToHtml, handlePublishBlog } = useExportActions(forceSave, highlighter);
  const [sidebarSearchRequestKey, setSidebarSearchRequestKey] = useState(0);

  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isSearchBarOpen, setIsSearchBarOpen] = useState(false);
  const [isNewNoteDialogOpen, setIsNewNoteDialogOpen] = useState(false);
  const [mainContentWidth, setMainContentWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : 0
  ));
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : 1440
  ));
  const [sidebarWidth, setSidebarWidth] = useState(() => (
    getStoredPanelWidth(
      LAYOUT.STORAGE_KEYS.SIDEBAR_WIDTH,
      LAYOUT.SIDEBAR.DEFAULT_WIDTH,
      LAYOUT.SIDEBAR.MIN_WIDTH,
      LAYOUT.SIDEBAR.MAX_WIDTH
    )
  ));
  const [outlineWidth, setOutlineWidth] = useState(() => (
    getStoredPanelWidth(
      LAYOUT.STORAGE_KEYS.OUTLINE_WIDTH,
      LAYOUT.OUTLINE.DEFAULT_WIDTH,
      LAYOUT.OUTLINE.MIN_WIDTH,
      LAYOUT.OUTLINE.MAX_WIDTH
    )
  ));
  const autoOpenAttemptedRef = React.useRef(false);
  const secureSettingsReadyRef = React.useRef(false);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const [isRestoringKnowledgeBase, setIsRestoringKnowledgeBase] = useState(false);

  useEffect(() => {
    if (!settingsHydrated || secureSettingsReadyRef.current) return;
    secureSettingsReadyRef.current = true;

    let cancelled = false;

    void migrateLegacySensitiveSettings(settings)
      .then((secureSettings) => {
        if (cancelled) return;
        updateSettings(secureSettings);
      })
      .catch((error) => {
        console.error('Failed to load secure settings:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [settingsHydrated, settings, updateSettings]);

  // Auto-open last knowledge base after hydration
  useEffect(() => {
    if (!settingsHydrated || autoOpenAttemptedRef.current) return;
    autoOpenAttemptedRef.current = true;

    const lastKnowledgeBase = settings.lastKnowledgeBasePath;
    if (!lastKnowledgeBase || rootFolderPath || isTauriEnvironment()) {
      setIsRestoringKnowledgeBase(false);
      return;
    }

    setIsRestoringKnowledgeBase(true);
    void openKnowledgeBase(lastKnowledgeBase, { silentSuccess: true })
      .finally(() => {
        setIsRestoringKnowledgeBase(false);
      });
  }, [settingsHydrated, settings.lastKnowledgeBasePath, rootFolderPath, openKnowledgeBase]);

  useEffect(() => {
    if (!settingsHydrated || typeof document === 'undefined') return;

    const frame = window.requestAnimationFrame(() => {
      document.documentElement.removeAttribute('data-app-booting');
    });

    return () => window.cancelAnimationFrame(frame);
  }, [settingsHydrated]);

  // Remember the last opened file so startup can restore it after hydration.
  useEffect(() => {
    if (!settingsHydrated || !currentFilePath) return;
    if (settings.lastOpenedFilePath === currentFilePath) return;

    updateSettings({ lastOpenedFilePath: currentFilePath });
  }, [settingsHydrated, currentFilePath, settings.lastOpenedFilePath, updateSettings]);

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
      // Cleanup previous watcher before setting up new one to prevent race conditions
      if (unwatch) {
        unwatch();
        unwatch = null;
      }
      
      unwatch = await watchFile(currentFilePath, async (event) => {
        if (disposed) return;
        if (event?.type === 'deleted') {
          showNotification(t('notifications_fileDeletedOnDisk'), 'error');
          return;
        }
        if (event?.type === 'error') {
          showNotification(t('notifications_watchFileFailed'), 'error');
          return;
        }
        if (event?.type !== 'modified') return;

        const state = useAppStore.getState();
        if (state.hasUnsavedChanges(activeTabId)) {
          showNotification(t('notifications_fileChangedOnDisk'), 'error');
          return;
        }

        const node = findFileInTree(state.files, activeTabId);
        if (!node || node.type !== 'file') return;

        try {
          const latestContent = await readFile(node);
          const currentCached = useAppStore.getState().fileContents[activeTabId];
          if (currentCached === latestContent) return;

          useAppStore.getState().updateTabContent(activeTabId, latestContent);
          showNotification(t('notifications_fileReloaded'), 'success');
        } catch (error) {
          console.error('Failed to reload file from disk:', error);
          showNotification(t('notifications_reloadFileFailed'), 'error');
        }
      });
    };

    setupWatcher();

    return () => {
      disposed = true;
      if (unwatch) {
        unwatch();
        unwatch = null;
      }
    };
  }, [activeTabId, currentFilePath, readFile, showNotification, watchFile]);

  useEffect(() => {
    const mainEl = mainContentRef.current;
    if (!mainEl) return;

    // Throttle resize updates to 16ms (60fps) for better performance
    const throttledSetMainContentWidth = throttle(setMainContentWidth, 16);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      throttledSetMainContentWidth(entry.contentRect.width);
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
    window.localStorage.setItem(LAYOUT.STORAGE_KEYS.SIDEBAR_WIDTH, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LAYOUT.STORAGE_KEYS.OUTLINE_WIDTH, String(outlineWidth));
  }, [outlineWidth]);

  // Global keyboard shortcuts
  useGlobalKeyboardShortcuts(
    async () => {
      if (currentFilePath) {
        await forceSave(undefined, {
          formatBeforeSave: settings.formatMarkdownOnManualSave,
          trigger: 'manual',
        });
        showNotification(t('app_saved'), 'success');
      }
    },
    handleAIAnalyze,
    {
      onSearch: () => setIsSearchBarOpen(true),
      onSidebarSearch: () => {
        setSidebarOpen(true);
        setSidebarSearchRequestKey((prev) => prev + 1);
      },
      onOpenSettings: () => setSettingsOpen(true),
      onToggleOutline: () => setIsOutlineOpen((prev) => !prev),
      onToggleSidebar: () => setSidebarOpen(!isSidebarOpen),
      onToggleTheme: toggleTheme,
      onNewNote: () => setIsNewNoteDialogOpen(true),
      onNewFolder: () => { void fileOps.handleNewFolder(undefined, t('app_untitledFolder')); },
      onCloseTab: () => {
        if (activeTabId) {
          closeTab(activeTabId);
        }
      },
      onOpenKnowledgeBase: () => { void handleSwitchKnowledgeBase(); },
      onExportHtml: () => { void handleExportToHtml(); },
    }
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
      const scrollOptions = { alignMode: 'center' as const, behavior: 'smooth' as const };
      requestPreviewHeadingScroll(activeTabId, id, scrollOptions);
    }
  }, [activeTabId, content, setActiveHeadingId, viewMode]);

  const handleContentChange = useCallback((newContent: string) => {
    if (!activeTabId) {
      setContent(newContent);
      return;
    }

    setContentForFile(activeTabId, newContent);
  }, [activeTabId, setContent, setContentForFile]);

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    setSidebarWidth(clamp(nextWidth, LAYOUT.SIDEBAR.MIN_WIDTH, LAYOUT.SIDEBAR.MAX_WIDTH));
  }, []);

  const handleSubmitNewNote = useCallback((value: string) => {
    const fileName = value.trim();
    if (!fileName) return;

    void fileOps.handleCreateFile(undefined, fileName);
    setIsNewNoteDialogOpen(false);
  }, [fileOps]);

  const handleOutlineWidthChange = useCallback((nextWidth: number) => {
    setOutlineWidth(clamp(nextWidth, LAYOUT.OUTLINE.MIN_WIDTH, LAYOUT.OUTLINE.MAX_WIDTH));
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
    (!hasKnowledgeBaseHistory || isTauriEnvironment());
  const shouldShowStartupLoading = isRestoringKnowledgeBase;
  const minimumWorkspaceWidth = getMinimumWorkspaceWidth(viewMode);
  const responsiveOutlineWidth = Math.min(
    outlineWidth,
    Math.max(LAYOUT.OUTLINE.MIN_WIDTH, Math.floor(mainContentWidth * 0.22))
  );
  const outlineReservationWidth = isOutlineOpen ? responsiveOutlineWidth + LAYOUT.GAP.OUTLINE_PANEL : 0;
  const maxSidebarWidthForViewport = Math.max(
    LAYOUT.SIDEBAR.RESPONSIVE_MIN_WIDTH,
    viewportWidth - minimumWorkspaceWidth - outlineReservationWidth - LAYOUT.GAP.SHELL_EDGE
  );
  const responsiveSidebarWidth = isSidebarOpen
    ? Math.min(sidebarWidth, maxSidebarWidthForViewport)
    : sidebarWidth;
  const workspaceWidthWithOutline = mainContentWidth - responsiveOutlineWidth - LAYOUT.GAP.OUTLINE_PANEL;
  const minimumWorkspaceWidthWithOutline = getMinimumWorkspaceWidthWithOutline(viewMode);
  const canShowOutlinePanel = Boolean(activeTabId) && workspaceWidthWithOutline >= minimumWorkspaceWidthWithOutline;
  const isOutlineVisible = Boolean(activeTabId) && isOutlineOpen;
  const canShowOutlineToggle = Boolean(activeTabId);
  const contentDensity: PaneDensity = (
    viewMode === ViewMode.SPLIT ||
    mainContentWidth < 1360 ||
    (isSidebarOpen && mainContentWidth < 1500) ||
    isOutlineVisible
  ) ? 'compact' : 'comfortable';

  if (shouldShowStartupLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/90 dark:bg-gray-900/80 backdrop-blur-md shadow-xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold tracking-tight">
              M
            </div>
            <div>
              <h1 className="text-xl font-semibold">{t('app_restoringWorkspace')}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('app_restoringWorkspaceDesc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-gray-200/70 dark:border-white/10 bg-gray-50/90 dark:bg-black/20 px-4 py-3">
            <svg className="h-5 w-5 animate-spin text-gray-500 dark:text-gray-300" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V1a11 11 0 00-7.78 18.78l2.12-2.12A8 8 0 014 12z" />
            </svg>
            <span className="text-sm text-gray-600 dark:text-gray-300">{t('app_openingKnowledgeBase')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (shouldShowKnowledgeBaseOnboarding) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/90 dark:bg-gray-900/80 backdrop-blur-md shadow-xl p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold tracking-tight">
              M
            </div>
            <div>
              <h1 className="text-xl font-semibold">{t('app_chooseKnowledgeBase')}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('app_chooseKnowledgeBaseDesc')}</p>
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
            {t('app_openKnowledgeBase')}
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
        searchFocusRequestKey={sidebarSearchRequestKey}
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
          isPublishing={isPublishing}
          isSidebarOpen={isSidebarOpen}
          onMenuClick={() => setSidebarOpen(!isSidebarOpen)}
          onToggleTheme={toggleTheme}
          themeMode={settings.themeMode}
          onPublishBlog={handlePublishBlog}
          onExportHtml={handleExportToHtml}
        />

        <TabBar onToggleSidebar={() => setSidebarOpen(true)} />

        <div className="flex-1 min-w-0 flex overflow-hidden relative">
          <SplitView
            highlighter={highlighter}
            onContentChange={handleContentChange}
            onGenerateWikiFromSelection={handleGenerateWikiFromSelection}
            isOutlineOpen={isOutlineOpen}
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

      <PromptDialog
        isOpen={isNewNoteDialogOpen}
        onClose={() => setIsNewNoteDialogOpen(false)}
        onSubmit={handleSubmitNewNote}
        title={t('app_newFile')}
        label={t('app_fileName')}
        defaultValue={t('app_untitled')}
        submitText={t('common_create')}
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
