import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useAppStore, selectContent, defaultSettings } from "./store/appStore";
import { useFileSystem } from "./hooks/useFileSystem";
import { useViewMode } from "./hooks/useViewMode";
import { useSettings } from "./hooks/useSettings";
import { useGlobalKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useUiFontSizeKeyboardShortcuts } from "./hooks/useUiFontSizeKeyboardShortcuts";
import { useAutoSave } from "./hooks/useAutoSave";
import { useOutline } from "./hooks/useOutline";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { useStoreHydration } from "./hooks/useStoreHydration";
import { useShikiHighlighter } from "./hooks/useShikiHighlighter";
import { useThemeSync } from "./hooks/useThemeSync";
import { useSystemThemeFollow } from "./hooks/useSystemThemeFollow";
import { useAIAnalyze } from "./hooks/useAIAnalyze";
import { useFileOperations } from "./hooks/useFileOperations";
import { Sidebar } from "./components/sidebar/Sidebar";
import { Toolbar } from "./components/toolbar/Toolbar";
import { SplitView } from "./components/editor/SplitView";
import type { CodeMirrorContentChangeMeta } from "./components/editor/hooks/useCodeMirror";
import { OutlinePanel } from "./components/outline/OutlinePanel";
import { ContentSearch } from "./components/search/ContentSearch";
import { TabBar } from "./components/tabs/TabBar";
import { useExportActions } from "./hooks/useExportActions";
import { usePublishActions } from "./hooks/usePublishActions";
import { ViewMode } from "./types";
import { focusEditorRangeByOffset } from "./utils/editorSelectionBridge";
import { requestPreviewHeadingScroll } from "./utils/previewNavigationBridge";
import { getResolvedUiFontFamily } from "./utils/fontSettings";
import { logEnvironment, assertDevReleaseParity } from "./utils/environment";
import { useI18n } from "./hooks/useI18n";
import { getPathBasename, findFileInTree } from "./app/appShellUtils";
import { isPreviewOnlyFile } from "./utils/fileTypes";
import { getResolvedEditorFontFamily } from "./utils/fontSettings";
import { useAppBootstrap } from "./app/useAppBootstrap";
import { useActiveFileWatch } from "./app/useActiveFileWatch";
import { useKnowledgeBaseWatch } from "./app/useKnowledgeBaseWatch";
import { useAppUpdater } from "./app/useAppUpdater";
import { useWorkspaceLayout } from "./app/useWorkspaceLayout";
import { useAttachmentCleanup } from "./app/useAttachmentCleanup";
import { useExternalFileOpen } from "./app/useExternalFileOpen";
import { getStartupKnowledgeBaseGate } from "./app/startupKnowledgeBaseGate";
import {
  extractWechatDraftDefaults,
  type WechatDraftPublishInput,
} from "./utils/wechatPublish";
import { isTauriEnvironment } from "./types/filesystem";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { KnowledgeBaseOnboarding } from "./components/KnowledgeBaseOnboarding";
import { KnowledgeBaseLoadingScreen } from "./components/KnowledgeBaseLoadingScreen";
import { AppDialogs } from "./components/AppDialogs";

// Layout constants moved to src/config/layout.ts
// Using centralized configuration for better maintainability

// Log environment info on app initialization for debugging
if (typeof window !== "undefined" && import.meta.env.DEV) {
  logEnvironment();
  assertDevReleaseParity();
}

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

  const {
    openDirectory,
    openKnowledgeBase,
    openFilePath,
    readFile,
    moveToTrash,
    refreshFileTree,
    watchFile,
    watchDirectory,
  } = useFileSystem();
  const { setViewMode } = useViewMode();
  const { toggleTheme } = useSettings();
  const settingsHydrated = useStoreHydration();
  const { highlighter } = useShikiHighlighter(content);
  const { handleAIAnalyze, handleGenerateWikiFromSelection } = useAIAnalyze();
  const fileOps = useFileOperations();

  const { headings: outlineHeadings } = useOutline();
  useUndoRedo();

  useSystemThemeFollow();
  useThemeSync(settings.themeMode);
  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${settings.fontSize}px`,
    );
    document.documentElement.style.setProperty(
      "--editor-font-family",
      getResolvedEditorFontFamily(settings),
    );
  }, [settings.fontSize, settings.editorFontFamily]);
  useAppBootstrap({
    settings,
    settingsHydrated,
    currentFilePath,
    updateSettings,
  });
  useAppUpdater({
    language: settings.language,
    settingsHydrated,
    autoCheckForUpdates: settings.autoCheckForUpdates,
    skippedUpdateVersion: settings.skippedUpdateVersion,
    updateSettings,
    showNotification,
    t,
  });

  const { forceSave, saveOpenTabIfDirty } = useAutoSave({ enabled: true });
  const { handleExportToPdf, buildLongImageSharePayload } =
    useExportActions(highlighter);
  const { handlePublishSimpleBlog, handlePublishWechatDraft } =
    usePublishActions(forceSave);
  const [sidebarSearchRequestKey, setSidebarSearchRequestKey] = useState(0);
  const [sidebarLocateRequestKey, setSidebarLocateRequestKey] = useState(0);

  const [isSearchBarOpen, setIsSearchBarOpen] = useState(false);
  const [isNewNoteDialogOpen, setIsNewNoteDialogOpen] = useState(false);
  const [isPublishTargetDialogOpen, setIsPublishTargetDialogOpen] =
    useState(false);
  const [isWechatDraftDialogOpen, setIsWechatDraftDialogOpen] = useState(false);
  const [isShareLongImageDialogOpen, setIsShareLongImageDialogOpen] =
    useState(false);
  const [isRestoringStartupKnowledgeBase, setIsRestoringStartupKnowledgeBase] =
    useState(false);
  const [hasResolvedStartupKnowledgeBase, setHasResolvedStartupKnowledgeBase] =
    useState(false);

  const openFilePathForExternalOpen = useCallback(
    async (
      path: string,
      options?: { silentSuccess?: boolean; suppressErrors?: boolean },
    ) => {
      // If a knowledge base is already open, open external files in a new window
      // (matches macOS "double click file" expectations for library-style apps).
      if (isTauriEnvironment() && rootFolderPath) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_file_in_new_window", { path });
        return path;
      }
      return openFilePath(path, options);
    },
    [openFilePath, rootFolderPath],
  );

  const externalFileOpen = useExternalFileOpen({
    settingsHydrated,
    openFilePath: openFilePathForExternalOpen,
  });
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
    closeTab,
    refreshFileTree,
    watchFile,
    t,
  });
  useKnowledgeBaseWatch({
    rootFolderPath,
    watchDirectory,
    showNotification,
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

  const handleBeforeCloseTab = useCallback(
    async (tabId: string): Promise<boolean> => {
      const state = useAppStore.getState();
      if (tabId === state.activeTabId) {
        if (state.hasUnsavedChanges(tabId)) {
          return forceSave(undefined, { trigger: "system" });
        }
        return true;
      }
      return saveOpenTabIfDirty(tabId);
    },
    [forceSave, saveOpenTabIfDirty],
  );

  const handleBeforeCloseOtherTabs = useCallback(
    async (keepFileId: string): Promise<boolean> => {
      const tabs = useAppStore.getState().openTabs;
      let allSaved = true;
      for (const tabId of tabs) {
        if (tabId === keepFileId) continue;
        const saved = await handleBeforeCloseTab(tabId);
        if (!saved) allSaved = false;
      }
      return allSaved;
    },
    [handleBeforeCloseTab],
  );

  const activeFile = activeTabId
    ? findFileInTree(files, activeTabId)
    : undefined;
  const isPreviewOnlyActiveFile = activeFile
    ? isPreviewOnlyFile(activeFile.name)
    : false;

  // Global keyboard shortcuts
  useUiFontSizeKeyboardShortcuts();
  useGlobalKeyboardShortcuts(
    async () => {
      if (currentFilePath) {
        const saved = await forceSave(undefined, {
          formatBeforeSave: settings.formatMarkdownOnManualSave,
          trigger: "manual",
        });
        if (saved) {
          showNotification(t("app_saved"), "success");
        }
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
      onNewFolder: () => {
        void fileOps.handleNewFolder(undefined, t("app_untitledFolder"));
      },
      onCloseTab: () => {
        if (!activeTabId) return;

        const tabToClose = activeTabId;
        void (async () => {
          const state = useAppStore.getState();
          if (state.hasUnsavedChanges(tabToClose)) {
            const saved = await forceSave(undefined, { trigger: "system" });
            if (!saved) {
              showNotification(t("tab_closeBlockedUnsaved"), "error");
              return;
            }
          }

          const latestState = useAppStore.getState();
          if (latestState.openTabs.includes(tabToClose)) {
            closeTab(tabToClose);
          }
        })();
      },
      onOpenKnowledgeBase: () => {
        void handleSwitchKnowledgeBase();
      },
      onExportPdf: () => {
        void handleExportToPdf();
      },
      onToggleView: isPreviewOnlyActiveFile ? () => {} : undefined,
    },
  );

  useEffect(() => {
    if (isPreviewOnlyActiveFile && viewMode !== ViewMode.PREVIEW) {
      setViewMode(ViewMode.PREVIEW, "direct");
    }
  }, [isPreviewOnlyActiveFile, viewMode, setViewMode]);

  const handleHeadingClick = useCallback(
    (id: string, line: number) => {
      setActiveHeadingId(id);

      const lineIndex = Math.max(0, line - 1);
      const lines = content.split("\n");
      const cursorPos = lines
        .slice(0, lineIndex)
        .reduce((sum, l) => sum + l.length + 1, 0);

      if (viewMode !== ViewMode.PREVIEW) {
        focusEditorRangeByOffset(cursorPos, cursorPos, { alignTopRatio: 0.3 });
      }

      if (viewMode !== ViewMode.EDITOR) {
        const scrollOptions = {
          alignMode: "center" as const,
          behavior: "smooth" as const,
        };
        requestPreviewHeadingScroll(activeTabId, id, scrollOptions);
      }
    },
    [activeTabId, content, setActiveHeadingId, viewMode],
  );

  const handleContentChange = useCallback(
    (newContent: string, meta?: CodeMirrorContentChangeMeta) => {
      if (!activeTabId) {
        setContent(newContent, meta?.skipHistory);
        return;
      }

      setContentForFile(activeTabId, newContent, meta?.skipHistory);
    },
    [activeTabId, setContent, setContentForFile],
  );

  const handleToolbarViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode, "direct");
    },
    [setViewMode],
  );

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    setSidebarWidth(nextWidth);
  }, []);

  const handleSubmitNewNote = useCallback(
    (value: string) => {
      const fileName = value.trim();
      if (!fileName) return;

      void fileOps.handleCreateFile(undefined, fileName);
      setIsNewNoteDialogOpen(false);
    },
    [fileOps],
  );

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

  const handleSubmitWechatDraft = useCallback(
    async (input: WechatDraftPublishInput) => {
      const published = await handlePublishWechatDraft(input);
      if (published) {
        setIsWechatDraftDialogOpen(false);
      }
    },
    [handlePublishWechatDraft],
  );

  const wechatDraftDefaults = useMemo(() => {
    if (!activeFile || !content) {
      return null;
    }

    return extractWechatDraftDefaults(content, activeFile.path);
  }, [activeFile, content]);
  const notification = useAppStore((state) => state.notification);
  const currentKnowledgeBaseName = useMemo(
    () => getPathBasename(rootFolderPath),
    [rootFolderPath],
  );
  const uiFontFamily = useMemo(
    () => getResolvedUiFontFamily(settings),
    [settings.uiFontFamily],
  );
  const uiScaleStyle = useMemo(
    () =>
      ({
        "--ui-font-size": `${settings.uiFontSize}px`,
        "--ui-font-scale": `${settings.uiFontSize / defaultSettings.uiFontSize}`,
      }) as React.CSSProperties,
    [settings.uiFontSize],
  );

  useEffect(() => {
    if (!settingsHydrated) return;
    if (!externalFileOpen.hasCheckedExternalFiles) return;
    if (externalFileOpen.hasHandledExternalFile) {
      setHasResolvedStartupKnowledgeBase(true);
      return;
    }
    if (rootFolderPath) {
      setHasResolvedStartupKnowledgeBase(true);
      return;
    }
    if (!isTauriEnvironment()) {
      setHasResolvedStartupKnowledgeBase(true);
      return;
    }

    const lastKnowledgeBasePath = settings.lastKnowledgeBasePath?.trim();
    if (!lastKnowledgeBasePath) {
      setHasResolvedStartupKnowledgeBase(true);
      return;
    }

    let cancelled = false;
    setIsRestoringStartupKnowledgeBase(true);

    void (async () => {
      const restoredPath = await openKnowledgeBase(lastKnowledgeBasePath, {
        silentSuccess: true,
        skipSampleNotes: true,
        suppressErrors: true,
      });

      if (cancelled) return;

      if (!restoredPath) {
        updateSettings({
          lastKnowledgeBasePath: "",
          lastOpenedFilePath: "",
        });
      }

      setIsRestoringStartupKnowledgeBase(false);
      setHasResolvedStartupKnowledgeBase(true);
    })();

    return () => {
      cancelled = true;
      setIsRestoringStartupKnowledgeBase(false);
    };
  }, [
    externalFileOpen.hasCheckedExternalFiles,
    externalFileOpen.hasHandledExternalFile,
    openKnowledgeBase,
    rootFolderPath,
    settings.lastKnowledgeBasePath,
    settingsHydrated,
    updateSettings,
  ]);

  const { shouldShowKnowledgeBaseLoading, shouldShowKnowledgeBaseOnboarding } =
    getStartupKnowledgeBaseGate({
      settingsHydrated,
      rootFolderPath,
      filesLen: files.length,
      isTauri: isTauriEnvironment(),
      lastKnowledgeBasePath: settings.lastKnowledgeBasePath ?? "",
      externalChecked: externalFileOpen.hasCheckedExternalFiles,
      externalHandled: externalFileOpen.hasHandledExternalFile,
      isRestoringStartupKnowledgeBase,
      hasResolvedStartupKnowledgeBase,
    });

  if (shouldShowKnowledgeBaseLoading) {
    return (
      <KnowledgeBaseLoadingScreen
        uiScaleStyle={uiScaleStyle}
        uiFontFamily={uiFontFamily}
      />
    );
  }

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
    <ErrorBoundary>
      <div
        className="flex h-screen flex-col overflow-hidden text-sm"
        style={{ ...uiScaleStyle, fontFamily: uiFontFamily }}
      >
        {(() => {
          const isMac =
            typeof navigator !== "undefined" &&
            /Mac/.test(navigator.platform ?? "");
          const shouldInsetForMacOverlayTitlebar =
            isMac && isTauriEnvironment();
          if (!shouldInsetForMacOverlayTitlebar) return null;
          return (
            <div
              className="h-[28px] w-full shrink-0 bg-gray-50 dark:bg-black"
              data-tauri-drag-region
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                void getCurrentWindow().startDragging();
              }}
            />
          );
        })()}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar
            files={files}
            activeFileId={activeTabId}
            onFileSelect={fileOps.handleFileSelect}
            onCreateFile={(folder, fileName) =>
              fileOps.handleCreateFile(folder, fileName)
            }
            onNewFolder={(folder, name) =>
              fileOps.handleNewFolder(folder, name)
            }
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
            className="flex-1 flex flex-col h-full min-w-0 bg-gray-50 dark:bg-black"
          >
            <Toolbar
              fileName={activeFile?.name || ""}
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
              onShareLongImage={() => {
                setIsShareLongImageDialogOpen(true);
              }}
              isPreviewOnlyFile={isPreviewOnlyActiveFile}
            />

            <TabBar
              onToggleSidebar={() => setSidebarOpen(true)}
              onBeforeCloseTab={handleBeforeCloseTab}
              onBeforeCloseOtherTabs={handleBeforeCloseOtherTabs}
            />

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
        </div>

        <AppDialogs
          isSettingsOpen={isSettingsOpen}
          isNewNoteDialogOpen={isNewNoteDialogOpen}
          isPublishTargetDialogOpen={isPublishTargetDialogOpen}
          isWechatDraftDialogOpen={isWechatDraftDialogOpen}
          isShareLongImageDialogOpen={isShareLongImageDialogOpen}
          isPublishing={isPublishing}
          settings={settings}
          wechatDraftDefaults={wechatDraftDefaults}
          notification={notification}
          attachmentContext={{ files, rootFolderPath }}
          t={t as unknown as (key: string) => string}
          uiScaleStyle={uiScaleStyle}
          buildPayload={buildLongImageSharePayload}
          onCloseSettings={() => setSettingsOpen(false)}
          onUpdateSettings={updateSettings}
          onCloseNewNote={() => setIsNewNoteDialogOpen(false)}
          onSubmitNewNote={handleSubmitNewNote}
          onClosePublishTarget={() => setIsPublishTargetDialogOpen(false)}
          onSelectSimpleBlog={handleSelectSimpleBlogPublish}
          onSelectWechatDraft={handleSelectWechatDraftPublish}
          onCloseWechatDraft={() => setIsWechatDraftDialogOpen(false)}
          onSubmitWechatDraft={(input) => {
            void handleSubmitWechatDraft(input);
          }}
          onCloseShareLongImage={() => setIsShareLongImageDialogOpen(false)}
        />
      </div>
    </ErrorBoundary>
  );
};

export default App;
