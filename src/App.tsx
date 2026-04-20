import React, { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAppStore, selectContent, defaultSettings } from './store/appStore';
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
import { PublishTargetDialog } from './components/publish/PublishTargetDialog';
import { WechatDraftDialog } from './components/publish/WechatDraftDialog';
import { useExportActions } from './hooks/useExportActions';
import { ViewMode } from './types';
import { focusEditorRangeByOffset } from './utils/editorSelectionBridge';
import { requestPreviewHeadingScroll } from './utils/previewNavigationBridge';
import { getResolvedUiFontFamily } from './utils/fontSettings';
import { logEnvironment } from './utils/environment';
import { useI18n } from './hooks/useI18n';
import { getPathBasename, findFileInTree } from './app/appShellUtils';
import { getResolvedEditorFontFamily } from './utils/fontSettings';
import { useAppBootstrap } from './app/useAppBootstrap';
import { useActiveFileWatch } from './app/useActiveFileWatch';
import { useWorkspaceLayout } from './app/useWorkspaceLayout';
import { useAttachmentCleanup } from './app/useAttachmentCleanup';
import { extractWechatDraftDefaults, type WechatDraftPublishInput } from './utils/wechatPublish';

// Layout constants moved to src/config/layout.ts
// Using centralized configuration for better maintainability

// Log environment info on app initialization for debugging
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  logEnvironment();
}

const KnowledgeBaseOnboarding: React.FC<{
  uiScaleStyle: React.CSSProperties;
  uiFontFamily: string;
  onOpen: () => void;
}> = ({ uiScaleStyle, uiFontFamily, onOpen }) => {
  const { t } = useI18n();
  return (
    <div
      className="ui-scaled min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 flex items-center justify-center p-6"
      style={{ ...uiScaleStyle, fontFamily: uiFontFamily }}
    >
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
          onClick={onOpen}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black font-medium hover:opacity-90 transition-opacity"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          {t('app_openKnowledgeBase')}
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const { t } = useI18n();
  const {
    files,
    openTabs,
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
    fileContents,
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

  const { openDirectory, openKnowledgeBase, readFile, moveToTrash, refreshFileTree, watchFile } = useFileSystem();
  const { setViewMode } = useViewMode();
  const { toggleTheme } = useSettings();
  const settingsHydrated = useStoreHydration();
  const { highlighter } = useShikiHighlighter(content);
  const { handleAIAnalyze, handleGenerateWikiFromSelection } = useAIAnalyze();
  const fileOps = useFileOperations();

  useOutline();
  useUndoRedo();

  useThemeSync(settings.themeMode);
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--editor-font-size', `${settings.fontSize}px`);
    document.documentElement.style.setProperty('--editor-font-family', getResolvedEditorFontFamily(settings));
  }, [settings.fontSize, settings.editorFontFamily]);
  useAppBootstrap({
    settings,
    settingsHydrated,
    currentFilePath,
    updateSettings,
  });

  const { forceSave } = useAutoSave({ debounceMs: 500, enabled: true });
  const {
    handleExportToPdf,
    handlePublishSimpleBlog,
    handlePublishWechatDraft,
  } = useExportActions(forceSave, highlighter);
  const [sidebarSearchRequestKey, setSidebarSearchRequestKey] = useState(0);
  const [sidebarLocateRequestKey, setSidebarLocateRequestKey] = useState(0);

  const [isSearchBarOpen, setIsSearchBarOpen] = useState(false);
  const [isNewNoteDialogOpen, setIsNewNoteDialogOpen] = useState(false);
  const [isPublishTargetDialogOpen, setIsPublishTargetDialogOpen] = useState(false);
  const [isWechatDraftDialogOpen, setIsWechatDraftDialogOpen] = useState(false);
  const {
    contentDensity,
    canShowOutlinePanel,
    canShowOutlineToggle,
    isOutlineOpen,
    isOutlineVisible,
    mainContentRef,
    responsiveOutlineWidth,
    responsiveSidebarWidth,
    setIsOutlineOpen,
    setOutlineWidth,
    setSidebarWidth,
  } = useWorkspaceLayout({
    activeTabId,
    isSidebarOpen,
    viewMode,
  });
  useActiveFileWatch({
    activeTabId,
    currentFilePath,
    files,
    readFile,
    setCurrentFilePath,
    showNotification,
    watchFile,
    t,
  });
  const { handleCleanupUnusedAttachments } = useAttachmentCleanup({
    closeTab,
    fileContents,
    files,
    moveToTrash,
    openTabs,
    refreshFileTree,
    rootFolderPath,
    resourceFolder: settings.resourceFolder,
    showNotification,
    t,
  });

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
      onLocateCurrentFile: () => {
        if (!activeTabId) return;
        setSidebarOpen(true);
        setSidebarLocateRequestKey((prev) => prev + 1);
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
      onExportPdf: () => { void handleExportToPdf(); },
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

  const handleToolbarViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode, 'direct');
  }, [setViewMode]);

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    setSidebarWidth(nextWidth);
  }, []);

  const handleSubmitNewNote = useCallback((value: string) => {
    const fileName = value.trim();
    if (!fileName) return;

    void fileOps.handleCreateFile(undefined, fileName);
    setIsNewNoteDialogOpen(false);
  }, [fileOps]);

  const handleOutlineWidthChange = useCallback((nextWidth: number) => {
    setOutlineWidth(nextWidth);
  }, []);

  const handleSwitchKnowledgeBase = useCallback(async () => {
    await openDirectory();
  }, [openDirectory]);

  const handleOpenPublishDialog = useCallback(() => {
    setIsPublishTargetDialogOpen(true);
  }, []);

  const handleSelectSimpleBlogPublish = useCallback(() => {
    setIsPublishTargetDialogOpen(false);
    void handlePublishSimpleBlog();
  }, [handlePublishSimpleBlog]);

  const handleSelectWechatDraftPublish = useCallback(() => {
    setIsPublishTargetDialogOpen(false);
    setIsWechatDraftDialogOpen(true);
  }, []);

  const handleSubmitWechatDraft = useCallback(async (input: WechatDraftPublishInput) => {
    const published = await handlePublishWechatDraft(input);
    if (published) {
      setIsWechatDraftDialogOpen(false);
    }
  }, [handlePublishWechatDraft]);

  const activeFile = activeTabId ? findFileInTree(files, activeTabId) : undefined;
  const wechatDraftDefaults = useMemo(() => {
    if (!activeFile || !content) {
      return null;
    }

    return extractWechatDraftDefaults(content, activeFile.path);
  }, [activeFile, content]);
  const notification = useAppStore(state => state.notification);
  const currentKnowledgeBaseName = useMemo(() => getPathBasename(rootFolderPath), [rootFolderPath]);
  const uiFontFamily = useMemo(() => getResolvedUiFontFamily(settings), [settings.uiFontFamily]);
  const uiScaleStyle = useMemo(() => ({
    '--ui-font-size': `${settings.uiFontSize}px`,
    '--ui-font-scale': `${settings.uiFontSize / defaultSettings.uiFontSize}`,
  }) as React.CSSProperties, [settings.uiFontSize]);
  // Show onboarding when no knowledge base is open
  // Note: In browser mode, we always show onboarding if no KB is open,
  // because auto-restore is not supported (File System Access API permissions don't persist)
  const shouldShowKnowledgeBaseOnboarding =
    settingsHydrated &&
    !rootFolderPath &&
    files.length === 0;

  if (shouldShowKnowledgeBaseOnboarding) {
    return (
      <KnowledgeBaseOnboarding
        uiScaleStyle={uiScaleStyle}
        uiFontFamily={uiFontFamily}
        onOpen={handleSwitchKnowledgeBase}
      />
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden text-sm"
      style={{ ...uiScaleStyle, fontFamily: uiFontFamily }}
    >
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
        currentKnowledgeBasePath={rootFolderPath ?? undefined}
        onSwitchKnowledgeBase={handleSwitchKnowledgeBase}
        isOpen={isSidebarOpen}
        searchFocusRequestKey={sidebarSearchRequestKey}
        locateCurrentFileRequestKey={sidebarLocateRequestKey}
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
          onViewModeChange={handleToolbarViewModeChange}
          onAIAnalyze={handleAIAnalyze}
          isAnalyzing={isAnalyzing}
          isSaving={isSaving}
          isPublishing={isPublishing}
          isSidebarOpen={isSidebarOpen}
          onMenuClick={() => setSidebarOpen(!isSidebarOpen)}
          onToggleTheme={toggleTheme}
          themeMode={settings.themeMode}
          onPublish={handleOpenPublishDialog}
          onExportPdf={handleExportToPdf}
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

      <PublishTargetDialog
        isOpen={isPublishTargetDialogOpen}
        onClose={() => setIsPublishTargetDialogOpen(false)}
        onSelectSimpleBlog={handleSelectSimpleBlogPublish}
        onSelectWechatDraft={handleSelectWechatDraftPublish}
      />

      <WechatDraftDialog
        isOpen={isWechatDraftDialogOpen}
        isSubmitting={isPublishing}
        defaults={wechatDraftDefaults}
        onClose={() => setIsWechatDraftDialogOpen(false)}
        onSubmit={(input) => { void handleSubmitWechatDraft(input); }}
      />

      {notification && (
        <div
          className={`ui-scaled fixed top-6 right-6 px-4 py-3 rounded-xl shadow-xl z-50 animate-fade-in border glass ${
            notification.type === 'success'
              ? 'text-green-600 border-green-100 dark:border-green-900'
              : 'text-red-500 border-red-100 dark:border-red-900'
          }`}
          role="status"
          aria-live="polite"
        >
          {notification.msg}
        </div>
      )}
    </div>
  );
};

export default App;
