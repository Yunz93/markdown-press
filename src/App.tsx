import React, { useEffect, useState, useCallback, useMemo } from 'react';
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

  useThemeSync(settings.themeMode, settings.customCss);

  const { forceSave } = useAutoSave({ debounceMs: 500, enabled: true });
  const { handleExportToPdf, handlePublishBlog } = useExportActions(forceSave);

  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isSearchBarOpen, setIsSearchBarOpen] = useState(false);
  const autoOpenAttemptedRef = React.useRef(false);

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
    const textarea = document.querySelector('textarea.editor-pane') as HTMLTextAreaElement | null;
    if (!textarea) return;

    const lineIndex = Math.max(0, line - 1);
    const lines = content.split('\n');
    const cursorPos = lines.slice(0, lineIndex).reduce((sum, l) => sum + l.length + 1, 0);

    textarea.focus();
    textarea.setSelectionRange(cursorPos, cursorPos);

    const computedLineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 24;
    textarea.scrollTop = Math.max(0, lineIndex * computedLineHeight - textarea.clientHeight * 0.3);
  }, [content, setActiveHeadingId]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
  }, [setContent]);

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
        onCreateFile={(folder) => fileOps.handleCreateFile(folder)}
        onNewFolder={(folder, name) => fileOps.handleNewFolder(folder, name)}
        onRename={fileOps.handleRename}
        onDelete={fileOps.handleDelete}
        onReveal={fileOps.handleRevealInExplorer}
        onOpenInBrowser={fileOps.handleOpenInFileExplorer}
        onMoveToTrash={fileOps.handleMoveToTrash}
        onRestoreFromTrash={fileOps.handleRestoreFromTrash}
        onDeleteForever={fileOps.handleDeleteForever}
        onMoveNode={fileOps.handleMoveNode}
        currentKnowledgeBaseName={currentKnowledgeBaseName}
        currentKnowledgeBasePath={rootFolderPath}
        onSwitchKnowledgeBase={handleSwitchKnowledgeBase}
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col h-full min-w-0 bg-gray-50 dark:bg-black transition-colors duration-300">
        <Toolbar
          fileName={activeFile?.name || ''}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onAIAnalyze={handleAIAnalyze}
          isAnalyzing={isAnalyzing}
          isSaving={isSaving}
          onMenuClick={() => setSidebarOpen(true)}
          onToggleTheme={toggleTheme}
          themeMode={settings.themeMode}
          onPublishBlog={handlePublishBlog}
          onExportPdf={handleExportToPdf}
        />

        <TabBar onToggleSidebar={() => setSidebarOpen(true)} />

        <div className="flex-1 flex overflow-hidden relative">
          <SplitView
            highlighter={highlighter}
            onContentChange={handleContentChange}
            isOutlineOpen={isOutlineOpen}
            onToggleOutline={() => setIsOutlineOpen(!isOutlineOpen)}
          />
          {isOutlineOpen && (
            <OutlinePanel
              headings={outlineHeadings}
              activeHeadingId={activeHeadingId}
              onHeadingClick={handleHeadingClick}
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
