import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FileTreeItem } from './FileTree';
import { TrashView } from './TrashView';
import { useFileSystem } from '../../hooks/useFileSystem';
import { useAppStore } from '../../store/appStore';

import { focusEditorRangeByOffset } from '../../utils/editorSelectionBridge';

import type { FileNode } from '../../types';

import {
  useSidebarResize,
  useSidebarSearch,
  useSidebarDialogs,
  useSidebarDragAndDrop,
  useSidebarContextMenu,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
} from './hooks';

import {
  PromptDialog,
  ConfirmDialog,
  ContextMenu,
} from './components';

import {
  getTrashItems,
  filterNodesByFileName,
  highlightSearchText,
} from './utils';
import { useI18n } from '../../hooks/useI18n';

export interface SidebarProps {
  files: FileNode[];
  activeFileId: string | null;
  onFileSelect: (file: FileNode) => void | Promise<void>;
  onCreateFile: (parentFolder?: FileNode, fileName?: string) => void;
  onNewFolder: (parentFolder?: FileNode, name?: string) => void;
  onRename: (file: FileNode, newName: string) => void;
  onDelete: (file: FileNode) => void;
  onReveal: (path: string) => void;
  onMoveToTrash: (file: FileNode) => void;
  onRestoreFromTrash: (file: FileNode) => void;
  onDeleteForever: (file: FileNode) => void;
  onEmptyTrash: (files: FileNode[]) => void;
  onMoveNode: (sourceId: string, targetId: string) => void;
  onMoveToRoot: (sourceId: string) => void;
  currentKnowledgeBaseName?: string;
  currentKnowledgeBasePath?: string;
  onSwitchKnowledgeBase: () => void;
  isOpen: boolean;
  searchFocusRequestKey?: number;
  locateCurrentFileRequestKey?: number;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}

function findNodePath(nodes: FileNode[], targetId: string): FileNode[] | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return [node];
    }

    if (node.children?.length) {
      const childPath = findNodePath(node.children, targetId);
      if (childPath) {
        return [node, ...childPath];
      }
    }
  }

  return null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFileId,
  onFileSelect,
  onCreateFile,
  onNewFolder,
  onRename,
  onDelete,
  onReveal,
  onMoveToTrash,
  onRestoreFromTrash,
  onDeleteForever,
  onEmptyTrash,
  onMoveNode,
  onMoveToRoot,
  currentKnowledgeBaseName,
  currentKnowledgeBasePath,
  onSwitchKnowledgeBase,
  isOpen,
  searchFocusRequestKey = 0,
  locateCurrentFileRequestKey = 0,
  width,
  onWidthChange,
  onClose,
}) => {
  const { t } = useI18n();
  const { readFile } = useFileSystem();
  const fileContents = useAppStore((state) => state.fileContents);
  const themeMode = useAppStore((state) => state.settings.themeMode);

  const sidebarRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [locatedFileId, setLocatedFileId] = useState<string | null>(null);

  const trashItems = useMemo(() => getTrashItems(files), [files]);

  // Hooks
  const { handleResizeStart } = useSidebarResize({ onWidthChange });
  const { contextMenu, openContextMenu, closeContextMenu } = useSidebarContextMenu();
  const { isRootDragOver, setIsRootDragOver, handleRootDragOver, handleRootDragLeave, handleRootDrop } =
    useSidebarDragAndDrop();

  const searchDeps = useMemo(
    () => ({
      onFileSelect,
      onClose,
      focusEditorRangeByOffset,
    }),
    [onFileSelect, onClose]
  );

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    filteredFiles,
    hasSearchQuery,
    hasVisibleFiles,
    handleSearchResultSelect,
  } = useSidebarSearch(
    {
      files,
      fileContents,
      readFile,
    },
    searchDeps
  );

  const dialogOptions = useMemo(
    () => ({
      onCreateFile,
      onRename,
      onNewFolder,
      onDelete,
      onEmptyTrash,
    }),
    [onCreateFile, onRename, onNewFolder, onDelete, onEmptyTrash]
  );

  const {
    dialogState,
    openNewFileDialog,
    openRenameDialog,
    openNewFolderDialog,
    openDeleteDialog,
    openEmptyTrashDialog,
    closeDialog,
    handleNewFileConfirm,
    handleRenameConfirm,
    handleNewFolderConfirm,
    handleDeleteConfirm,
    handleEmptyTrashConfirm,
  } = useSidebarDialogs(dialogOptions);

  // Focus search input when requested
  useEffect(() => {
    if (searchFocusRequestKey > 0) {
      searchInputRef.current?.focus();
    }
  }, [searchFocusRequestKey]);

  useEffect(() => {
    if (locateCurrentFileRequestKey <= 0 || !activeFileId) return;

    setSearchQuery('');
    setShowTrash(false);
    setLocatedFileId(activeFileId);
  }, [activeFileId, locateCurrentFileRequestKey, setSearchQuery]);

  const locatedPathIds = useMemo(() => {
    if (!locatedFileId) return new Set<string>();

    const path = findNodePath(files, locatedFileId);
    if (!path) return new Set<string>();

    return new Set(
      path
        .filter((node) => node.type === 'folder')
        .map((node) => node.id)
    );
  }, [files, locatedFileId]);

  const sidebarSurfaceStyle = useMemo(
    () =>
      ({
        '--sidebar-width': `${width}px`,
        backgroundColor: themeMode === 'dark' ? '#000000' : '#f8fafc',
      }) as React.CSSProperties,
    [themeMode, width]
  );

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        ref={sidebarRef}
        style={sidebarSurfaceStyle}
        className={`
          sidebar-shell
          fixed md:relative z-30 h-full w-72 md:flex-shrink-0 flex flex-col overflow-hidden
          transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]
          ${
            isOpen
              ? 'translate-x-0 md:w-[var(--sidebar-width)] opacity-100'
              : '-translate-x-full md:translate-x-0 md:w-0 md:opacity-0 pointer-events-none'
          }
        `}
      >
        <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
          <div className="flex justify-end items-center px-2 md:hidden">
            <button
              onClick={onClose}
              className="md:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2 md:mt-1">
            <label className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-gray-500">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('sidebar_search')}
                className="w-full rounded-xl border border-gray-200/80 dark:border-white/10 bg-white/70 dark:bg-[#141a25] py-2 pl-9 pr-3 text-sm font-medium text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none transition-colors focus:border-gray-300 dark:focus:border-white/20 focus:bg-white/90 dark:focus:bg-[#181f2c]"
              />
            </label>
            <button
              onClick={() => openNewFileDialog(undefined, t('app_untitled'))}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200/80 dark:border-white/10 bg-white/72 dark:bg-[#141a25] text-gray-700 dark:text-gray-200 shadow-sm transition-colors hover:bg-white dark:hover:bg-[#181f2c] active:scale-95"
              title={t('sidebar_newNote')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        <div
          className={`flex-1 overflow-y-auto py-2 scrollbar-hide transition-colors ${
            isRootDragOver ? 'bg-accent-DEFAULT/10 dark:bg-accent-DEFAULT/10' : ''
          }`}
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={(e) => handleRootDrop(e, onMoveToRoot)}
          onDragEnd={() => setIsRootDragOver(false)}
        >
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-600 px-6 text-center">
              <svg
                className="w-8 h-8 mb-3 opacity-20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-xs mb-3">{t('sidebar_noLocalFilesOpened')}</p>
              <p className="text-xs text-gray-400">{t('sidebar_openKnowledgeBaseHint')}</p>
            </div>
          ) : hasSearchQuery ? (
            isSearching ? (
              <div className="flex h-40 items-center justify-center px-6 text-sm text-gray-500 dark:text-gray-400">
                {t('sidebar_searchingNotes')}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 px-6 text-center text-gray-400 dark:text-gray-600">
                <svg
                  className="mb-3 h-8 w-8 opacity-20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('sidebar_noMatchingFiles')}</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {t('sidebar_tryAnotherKeyword')}
                </p>
              </div>
            ) : (
              <div className="space-y-2 px-3">
                {searchResults.map(({ file, filenameMatched, snippets }) => (
                  <div
                    key={file.id}
                    className="rounded-2xl border border-gray-200/70 bg-white/72 p-3 shadow-sm transition-colors hover:border-gray-300 hover:bg-white/90 dark:border-white/10 dark:bg-[#121923] dark:hover:border-white/20 dark:hover:bg-[#18212e]"
                  >
                    <button
                      onClick={() => void handleSearchResultSelect(file)}
                      className="flex w-full items-start justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                          {highlightSearchText(file.name.replace(/\.md$/i, ''), searchQuery)}
                        </div>
                        <div className="truncate text-xs text-gray-500 dark:text-gray-400">{file.path}</div>
                      </div>
                      {filenameMatched && (
                        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                          {t('sidebar_filenameMatched')}
                        </span>
                      )}
                    </button>

                    {snippets.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {snippets.map((snippet, index) => (
                          <button
                            key={`${file.id}-${snippet.start}-${index}`}
                            onClick={() => void handleSearchResultSelect(file, snippet)}
                            className="w-full rounded-xl border border-gray-200/70 bg-white/55 px-3 py-2 text-left transition-colors hover:border-amber-300 hover:bg-amber-50/70 dark:border-white/10 dark:bg-[#0f151f] dark:hover:border-amber-400/40 dark:hover:bg-amber-400/10"
                          >
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                              {t('sidebar_paragraphAroundLine', { line: snippet.line })}
                            </div>
                            <div className="text-sm leading-6 text-gray-700 dark:text-gray-200">
                              {highlightSearchText(snippet.text, searchQuery)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : !hasVisibleFiles ? (
            <div className="flex flex-col items-center justify-center h-40 px-6 text-center text-gray-400 dark:text-gray-600">
              <svg
                className="mb-3 h-8 w-8 opacity-20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('sidebar_noMatchingFiles')}</p>
              {hasSearchQuery && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t('sidebar_tryAnotherFilenameKeyword')}</p>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredFiles.map((node) => (
                <FileTreeItem
                  key={node.id}
                  node={node}
                  onSelect={(f) => {
                    void onFileSelect(f);
                    if (window.innerWidth < 768) onClose();
                  }}
                  activeId={activeFileId}
                  level={0}
                  onContextMenu={openContextMenu}
                  onMoveNode={onMoveNode}
                  forceExpanded={hasSearchQuery}
                  expandedPathIds={locatedPathIds}
                  locateRequestKey={locateCurrentFileRequestKey}
                />
              ))}
            </div>
          )}
        </div>

        <div className="p-3 space-y-2">
          <div>
            <button
              onClick={() => setShowTrash(!showTrash)}
              className="flex items-center justify-between w-full px-3 py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] rounded-lg transition-colors text-gray-500 dark:text-gray-400 text-xs font-medium"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>{t('sidebar_trash', { count: trashItems.length })}</span>
              </div>
              {showTrash ? (
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>

            {showTrash && (
              <TrashView
                trashItems={trashItems}
                onRestore={onRestoreFromTrash}
                onDeleteForever={onDeleteForever}
                onEmptyTrash={() => openEmptyTrashDialog()}
                onContextMenu={openContextMenu}
              />
            )}
          </div>

          <button
            onClick={onSwitchKnowledgeBase}
            className="flex items-center justify-between gap-2 w-full px-3 py-2.5 text-gray-700 dark:text-gray-200 rounded-xl border border-gray-200/70 dark:border-white/10 bg-white/60 dark:bg-[#121923] hover:bg-white/90 dark:hover:bg-[#18212e] transition-colors"
            title={currentKnowledgeBasePath || t('app_openKnowledgeBase')}
          >
            <div className="flex items-center gap-2 min-w-0">
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              </svg>
              <p className="text-sm font-semibold truncate min-w-0">
                {currentKnowledgeBaseName || t('app_openKnowledgeBase')}
              </p>
            </div>
            <svg
              className="w-4 h-4 shrink-0 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              <polyline points="9 13 12 10 15 13" />
              <line x1="12" y1="10" x2="12" y2="16" />
            </svg>
          </button>
        </div>

        {isOpen && (
          <div
            className="absolute inset-y-0 right-0 hidden w-1 cursor-col-resize md:block opacity-0 hover:opacity-100 transition-opacity"
            onMouseDown={handleResizeStart}
            aria-hidden
          >
            <div className="absolute right-0 top-0 h-full w-px bg-gray-300/50 dark:bg-white/10" />
          </div>
        )}
      </aside>

      {/* Context Menu Portal */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={closeContextMenu}
          onRename={() =>
            openRenameDialog(
              contextMenu.node,
              contextMenu.node.name.replace(/\.md$/, '')
            )
          }
          onDelete={() => openDeleteDialog(contextMenu.node)}
                  onReveal={() => onReveal(contextMenu.node.path)}
          onCreateFile={() =>
            openNewFileDialog(
              contextMenu.node.type === 'folder' ? contextMenu.node : undefined,
              t('app_untitled')
            )
          }
          onCreateFolder={() => openNewFolderDialog(contextMenu.node)}
          onMoveToTrash={() => onMoveToTrash(contextMenu.node)}
          onRestoreFromTrash={() => onRestoreFromTrash(contextMenu.node)}
          onDeleteForever={() => openDeleteDialog(contextMenu.node)}
        />
      )}

      {/* New File Dialog */}
      <PromptDialog
        isOpen={dialogState.type === 'newFile'}
        title={t('sidebar_newFileTitle')}
        label={t('app_fileName')}
        defaultValue={dialogState.defaultValue || t('app_untitled')}
        onConfirm={(value) =>
          handleNewFileConfirm(
            dialogState.file?.type === 'folder' ? dialogState.file : undefined,
            value
          )
        }
        onCancel={closeDialog}
      />

      {/* Rename Dialog */}
      <PromptDialog
        isOpen={dialogState.type === 'rename'}
        title={t('sidebar_renameTitle')}
        label={t('sidebar_newName')}
        defaultValue={dialogState.defaultValue || ''}
        onConfirm={(value) => handleRenameConfirm(dialogState.file, value)}
        onCancel={closeDialog}
      />

      {/* New Folder Dialog */}
      <PromptDialog
        isOpen={dialogState.type === 'newFolder'}
        title={t('sidebar_newFolderTitle')}
        label={t('sidebar_folderName')}
        defaultValue=""
        onConfirm={(value) =>
          handleNewFolderConfirm(
            dialogState.file?.type === 'folder' ? dialogState.file : undefined,
            value
          )
        }
        onCancel={closeDialog}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={dialogState.type === 'delete'}
        title={t('sidebar_deleteItemTitle')}
        message={t('sidebar_deleteItemConfirm', { name: dialogState.file?.name || '' })}
        confirmText={t('common_delete')}
        variant="danger"
        onConfirm={() => handleDeleteConfirm(dialogState.file)}
        onCancel={closeDialog}
      />

      <ConfirmDialog
        isOpen={dialogState.type === 'emptyTrash'}
        title={t('sidebar_emptyTrashTitle')}
        message={t('sidebar_emptyTrashConfirm', { count: trashItems.length })}
        confirmText={t('context_emptyTrash')}
        variant="danger"
        onConfirm={() => handleEmptyTrashConfirm(trashItems)}
        onCancel={closeDialog}
      />
    </>
  );
};
