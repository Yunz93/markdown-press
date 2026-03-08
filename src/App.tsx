import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from './store/appStore';
import { useFileSystem } from './hooks/useFileSystem';
import { useViewMode } from './hooks/useViewMode';
import { useSettings } from './hooks/useSettings';
import { useGlobalKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAutoSave } from './hooks/useAutoSave';
import { useOutline } from './hooks/useOutline';
import { useUndoRedo } from './hooks/useUndoRedo';
import { Sidebar } from './components/sidebar/Sidebar';
import { Toolbar } from './components/toolbar/Toolbar';
import { SettingsModal } from './components/settings/SettingsModal';
import { SplitView } from './components/editor/SplitView';
import { OutlinePanel } from './components/outline/OutlinePanel';
import { ContentSearch } from './components/search/ContentSearch';
import { TabBar } from './components/tabs/TabBar';
import { ExportMenu } from './components/export/ExportMenu';
import { analyzeContent } from './services/geminiService';
import { getFileSystem } from './types/filesystem';
import { withErrorHandling } from './utils/errorHandler';
import { parseFrontmatter } from './utils/frontmatter';
import { exportToHtml } from './utils/export';
import * as yaml from 'js-yaml';
import { basename } from '@tauri-apps/api/path';
import { ViewMode, type FileNode, type Frontmatter } from './types';

// Helper function to recursively find a file in the tree
function findFileInTree(nodes: FileNode[], id: string): FileNode | undefined {
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
    activeTabId,
    content,
    fileContents,
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
    setAnalyzing,
    setActiveHeadingId,
    showNotification,
    toggleFileTrash,
    updateSettings,
    addTab,
    closeTab,
    updateTabContent,
  } = useAppStore();

  const {
    openDirectory,
    readFile,
    createFile,
    createFolder,
    renameFile,
    deleteFile,
    moveFile,
    revealInExplorer,
    watchFile
  } = useFileSystem();
  const { setViewMode } = useViewMode();
  const { toggleTheme } = useSettings();
  useOutline();

  // Initialize undo/redo keyboard shortcuts
  useUndoRedo();

  const [highlighter, setHighlighter] = useState<ShikiHighlighter | null>(null);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isSearchBarOpen, setIsSearchBarOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Load Shiki for syntax highlighting
  useEffect(() => {
    const loadShiki = async () => {
      try {
        const shiki = await import('shiki');
        const createHighlighter = shiki.createHighlighter;
        if (typeof createHighlighter !== 'function') return;

        const h = await createHighlighter({
          themes: ['github-light', 'github-dark'],
          langs: ['javascript', 'typescript', 'tsx', 'jsx', 'json', 'markdown', 'html', 'css', 'bash', 'yaml', 'python', 'sql', 'java', 'go', 'rust']
        });
        setHighlighter(h);
      } catch (e) {
        console.error('Failed to load shiki', e);
      }
    };
    loadShiki();
  }, []);

  // Auto-save hook
  const { forceSave } = useAutoSave({ debounceMs: 500, enabled: true });

  // Apply theme
  useEffect(() => {
    const isDark = settings.themeMode === 'dark' || settings.themeMode === 'solarized-dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const styleId = 'theme-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = settings.themeMode === 'custom' ? settings.customCss : '';
  }, [settings.themeMode, settings.customCss]);

  // AI Analyze handler with smart frontmatter merge
  const handleAIAnalyze = useCallback(async () => {
    if (!content) return;

    const apiKey = settings.geminiApiKey;
    if (!apiKey) {
      showNotification('Please configure Gemini API Key in settings.', 'error');
      setSettingsOpen(true);
      return;
    }

    setAnalyzing(true);
    try {
      const result = await analyzeContent(content, apiKey);
      const today = new Date().toISOString().split('T')[0];

      // Parse existing frontmatter if present
      const { frontmatter: existingFrontmatter, body } = parseFrontmatter(content);

      // Create AI-generated fields
      const aiFields: Partial<Frontmatter> = {
        title: result.seoTitle,
        date: today,
        description: result.summary,
        tags: result.suggestedTags,
      };

      // Merge with existing frontmatter, preserving user custom fields
      const mergedFrontmatter: Frontmatter = {
        ...existingFrontmatter, // Keep all existing fields first
        ...aiFields,            // Override with AI-generated fields
        // But preserve user custom fields that aren't in AI fields
        ...(existingFrontmatter?.category !== undefined && { category: existingFrontmatter.category }),
        ...(existingFrontmatter?.status !== undefined && { status: existingFrontmatter.status }),
        ...(existingFrontmatter?.is_publish !== undefined && { is_publish: existingFrontmatter.is_publish }),
        ...(existingFrontmatter?.layout !== undefined && { layout: existingFrontmatter.layout }),
      };

      // Generate YAML frontmatter
      const frontmatterYaml = yaml.dump(mergedFrontmatter, { skipInvalid: true });
      const frontmatterBlock = `---\n${frontmatterYaml}---\n\n`;

      // Combine frontmatter with body
      const newContent = frontmatterBlock + body;

      setContent(newContent);
      if (activeTabId) {
        updateTabContent(activeTabId, newContent);
      }
      showNotification('Content enhanced with AI!', 'success');
    } catch (error) {
      console.error('AI analysis failed:', error);
      showNotification('Failed to analyze content. Please check your API key and try again.', 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [content, settings.geminiApiKey, setAnalyzing, setContent, showNotification, setSettingsOpen, activeTabId, updateTabContent]);

  // Global keyboard shortcuts
  useGlobalKeyboardShortcuts(
    async () => {
      if (currentFilePath) {
        await forceSave();
        showNotification('Saved!', 'success');
      }
    },
    handleAIAnalyze
  );

  // Watch active file for external changes and auto-reload when safe.
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
          useAppStore.getState().setContent(latestContent);
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

  // Additional keyboard shortcuts for search and outline
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      // Ctrl+F - Open search
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchBarOpen(true);
      }

      // Ctrl+O - Toggle outline
      if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setIsOutlineOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle file select - open in tab
  const handleFileSelect = useCallback(async (file: FileNode) => {
    if (file.type === 'folder') {
      return; // Don't try to open folders as files
    }

    try {
      // Check if we have cached content
      const cachedContent = fileContents[file.id];

      // Add tab (will activate it)
      addTab(file.id);
      setCurrentFilePath(file.path);

      if (cachedContent !== undefined) {
        // Use cached content
        setContent(cachedContent);
      } else {
        // Read from file
        const text = await readFile(file);
        setContent(text);
        // Cache content in tab store
        updateTabContent(file.id, text);
      }
    } catch (e) {
      console.error('Failed to read file:', file.path, e);
      showNotification(`Failed to read file: ${file.name}`, 'error');
    }
  }, [readFile, addTab, setCurrentFilePath, setContent, updateTabContent, showNotification, fileContents]);

  // Handle create file
  const handleCreateFile = useCallback(async (parentFolder?: FileNode) => {
    const timestamp = Date.now();
    const fileName = `note-${timestamp}.md`;

    // Generate initial content with frontmatter
    const now = new Date().toISOString().split('T')[0];
    const meta: Record<string, unknown> = {};

    // Parse default value with special handling for placeholders
    const parseDefaultValue = (val: string): unknown => {
      if (val === '{now}') return now;
      if (val === '[]') return [];
      if (val === '{}') return {};
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
      const num = Number(val);
      if (!isNaN(num) && val.trim() !== '') return num;
      return val;
    };

    settings.metadataFields.forEach(f => {
      meta[f.key] = parseDefaultValue(f.defaultValue);
    });

    let initialContent = '';
    try {
      initialContent = `---\n${yaml.dump(meta)}---\n\n# Untitled\n\n`;
    } catch (e) {
      initialContent = `# Untitled\n\n`;
    }

    const newFile = await createFile(fileName, initialContent, parentFolder?.path);
    if (newFile) {
      addTab(newFile.id, initialContent);
      setCurrentFilePath(newFile.path);
      setContent(initialContent);
    }
  }, [settings.metadataFields, createFile, addTab, setCurrentFilePath, setContent]);

  // Handle rename
  const handleRename = useCallback(async (file: FileNode, newName: string) => {
    try {
      const newPath = await renameFile(file, newName);
      if (newPath && activeTabId === file.id) {
        setCurrentFilePath(newPath);
      }
    } catch (e) {
      showNotification('Rename failed', 'error');
    }
  }, [renameFile, activeTabId, setCurrentFilePath, showNotification]);

  // Handle move to trash
  const handleMoveToTrash = useCallback((file: FileNode) => {
    toggleFileTrash(file.id);
    if (activeTabId === file.id) {
      closeTab(file.id);
    }
  }, [toggleFileTrash, activeTabId, closeTab]);

  // Handle restore from trash
  const handleRestoreFromTrash = useCallback((file: FileNode) => {
    toggleFileTrash(file.id);
  }, [toggleFileTrash]);

  // Handle delete forever
  const handleDeleteForever = useCallback(async (file: FileNode) => {
    try {
      await deleteFile(file);
      showNotification('Permanently deleted.', 'success');
    } catch (e) {
      showNotification('Failed to delete file.', 'error');
    }
  }, [deleteFile, showNotification]);

  // Handle move node (drag and drop)
  const handleMoveNode = useCallback(async (sourceId: string, targetId: string) => {
    const sourceFile = findFileInTree(files, sourceId);
    const targetFolder = findFileInTree(files, targetId);

    if (!sourceFile || !targetFolder || targetFolder.type !== 'folder') {
      showNotification('Can only move files to folders', 'error');
      return;
    }

    if (sourceFile.type !== 'file') {
      showNotification('Only files can be moved for now', 'error');
      return;
    }

    if (sourceId === targetId) return;

    try {
      const fileName = await basename(sourceFile.path);
      const newPath = await moveFile(sourceFile, targetFolder.path);

      if (newPath) {
        // Update store with new path
        useAppStore.getState().updateFileName(sourceId, fileName, newPath);
        showNotification('File moved', 'success');
      }
    } catch (e) {
      console.error('Failed to move file:', e);
      showNotification('Failed to move file', 'error');
    }
  }, [files, moveFile, showNotification]);

  // Handle create folder
  const handleNewFolder = useCallback(async (parentFolder?: FileNode, name?: string) => {
    if (!name || !name.trim()) return;

    const newNode = await createFolder(name, parentFolder?.path);
    if (newNode) {
      showNotification('Folder created', 'success');
    }
  }, [createFolder, showNotification]);

  // Handle reveal in explorer
  const handleRevealInExplorer = useCallback(async (path: string) => {
    try {
      await revealInExplorer(path);
    } catch (e) {
      console.error('Failed to reveal in explorer:', e);
      showNotification('Failed to reveal in explorer', 'error');
    }
  }, [revealInExplorer, showNotification]);

  // Handle open in file explorer (replaces open in browser)
  const handleOpenInFileExplorer = useCallback(async (file: FileNode) => {
    try {
      await revealInExplorer(file.path);
      showNotification('Opened file location in explorer', 'success');
    } catch (error) {
      console.error('Failed to open in file explorer:', error);
      showNotification('Failed to open in file explorer', 'error');
    }
  }, [revealInExplorer, showNotification]);

  // Handle export to PDF
  const handleExportToPdf = useCallback(async () => {
    if (!activeTabId || !content) {
      showNotification('No file to export', 'error');
      return;
    }

    const activeFile = findFileInTree(files, activeTabId);
    if (!activeFile) {
      showNotification('No file to export', 'error');
      return;
    }

    try {
      // Create HTML rendered markdown
      const htmlContent = await exportToHtml(content, {
        title: activeFile.name.replace('.md', ''),
        theme: settings.themeMode === 'dark' ? 'dark' : 'light',
        includeTOC: false
      });

      // Open print dialog for PDF export
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showNotification('Please allow popups to export PDF', 'error');
        return;
      }

      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // Wait for content to load, then print
      printWindow.onload = () => {
        printWindow.print();
      };

      showNotification('PDF export dialog opened', 'success');
    } catch (error) {
      console.error('Failed to export PDF:', error);
      showNotification('Failed to export PDF', 'error');
    }
  }, [activeTabId, content, files, settings.themeMode, showNotification]);

  const activeFile = activeTabId ? findFileInTree(files, activeTabId) : undefined;
  const notification = useAppStore(state => state.notification);

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

  // Update content when active tab changes
  useEffect(() => {
    if (activeTabId) {
      const cachedContent = fileContents[activeTabId];
      if (cachedContent !== undefined) {
        setContent(cachedContent);
      }
    } else {
      setContent('');
    }
  }, [activeTabId, fileContents, setContent]);

  // Handle content changes - update tab cache
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    if (activeTabId) {
      updateTabContent(activeTabId, newContent);
    }
  }, [setContent, activeTabId, updateTabContent]);

  return (
    <div className="flex h-screen overflow-hidden text-sm">
      <Sidebar
        files={files}
        activeFileId={activeTabId}
        onFileSelect={handleFileSelect}
        onOpenFolder={openDirectory}
        onCreateFile={(folder) => handleCreateFile(folder)}
        onNewFolder={(folder, name) => handleNewFolder(folder, name)}
        onOpenSettings={() => setSettingsOpen(true)}
        onRename={handleRename}
        onDelete={async (file) => {
          await deleteFile(file);
          if (activeTabId === file.id) {
            closeTab(file.id);
          }
          showNotification('Deleted', 'success');
        }}
        onReveal={handleRevealInExplorer}
        onOpenInBrowser={handleOpenInFileExplorer}
        onMoveToTrash={handleMoveToTrash}
        onRestoreFromTrash={handleRestoreFromTrash}
        onDeleteForever={handleDeleteForever}
        onMoveNode={handleMoveNode}
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
          onToggleOutline={() => setIsOutlineOpen(!isOutlineOpen)}
          isOutlineOpen={isOutlineOpen}
          onToggleSearch={() => setIsSearchBarOpen(!isSearchBarOpen)}
          onToggleExport={() => setIsExportMenuOpen(!isExportMenuOpen)}
          onExportPdf={handleExportToPdf}
        />

        <TabBar onToggleSidebar={() => setSidebarOpen(true)} />

        <div className="flex-1 flex overflow-hidden relative">
          <SplitView
            highlighter={highlighter}
            onContentChange={handleContentChange}
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
          {isExportMenuOpen && (
            <div className="absolute top-14 right-4 z-50">
              <ExportMenu onClose={() => setIsExportMenuOpen(false)} />
            </div>
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

// Type for Shiki highlighter
interface ShikiHighlighter {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  getLoadedLanguages?: () => string[];
}

export default App;
