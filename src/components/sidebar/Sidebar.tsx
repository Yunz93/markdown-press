import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FileTreeItem } from './FileTree';
import { TrashView } from './TrashView';
import type { FileNode } from '../../types';

interface SidebarProps {
  files: FileNode[];
  activeFileId: string | null;
  onFileSelect: (file: FileNode) => void;
  onOpenFolder: () => void;
  onCreateFile: (parentFolder?: FileNode) => void;
  onCreateFolder: (parentFolder?: FileNode) => void;
  onOpenSettings: () => void;
  onRename: (file: FileNode, newName: string) => void;
  onDelete: (file: FileNode) => void;
  onReveal: (path: string) => void;
  onOpenInBrowser?: (file: FileNode) => void;
  onMoveToTrash: (file: FileNode) => void;
  onRestoreFromTrash: (file: FileNode) => void;
  onDeleteForever: (file: FileNode) => void;
  onMoveNode: (sourceId: string, targetId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}

interface DialogState {
  type: 'rename' | 'delete' | 'newFolder' | null;
  file?: FileNode;
  defaultValue?: string;
}

// Custom Context Menu component with Portal
const ContextMenu: React.FC<{
  x: number;
  y: number;
  node: FileNode;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  onReveal: () => void;
  onOpenInBrowser?: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onMoveToTrash: () => void;
  onRestoreFromTrash: () => void;
  onDeleteForever: () => void;
}> = ({ x, y, node, onClose, onRename, onDelete, onReveal, onOpenInBrowser, onCreateFile, onCreateFolder, onMoveToTrash, onRestoreFromTrash, onDeleteForever }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // Adjust position if menu would overflow viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const newX = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 10 : x;
      const newY = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 10 : y;
      setPosition({ x: Math.max(10, newX), y: Math.max(10, newY) });
    }
  }, [x, y]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const menu = (
    <div
      ref={menuRef}
      className="fixed bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-200/50 dark:border-white/10 shadow-2xl rounded-xl z-[100] p-1 min-w-[180px] animate-scale-in origin-top-left flex flex-col gap-0.5"
      style={{ top: position.y, left: position.x }}
    >
      <div className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wider font-bold border-b border-gray-100 dark:border-white/5 mb-1 mx-1">
        {node.isTrash
          ? 'Trash Actions'
          : node.type === 'folder'
            ? 'Folder Actions'
            : 'File Actions'}
      </div>

      {/* Trash item actions */}
      {node.isTrash && (
        <>
          <button
            onClick={() => { onRestoreFromTrash(); onClose(); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-300 rounded-lg flex items-center gap-2.5 transition-colors group"
          >
            <svg className="w-4 h-4 text-gray-400 group-hover:text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Restore
          </button>
          <button
            onClick={() => { onDeleteForever(); onClose(); }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg flex items-center gap-2.5 transition-colors group"
          >
            <svg className="w-4 h-4 text-red-400 group-hover:text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Delete Permanently
          </button>
        </>
      )}

      {/* Normal file/folder actions */}
      {!node.isTrash && (
        <>
          {node.type === 'folder' && (
            <>
              <button
                onClick={() => { onCreateFile(); onClose(); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2.5 transition-colors group"
              >
                <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                New File
              </button>
              <button
                onClick={() => { onCreateFolder(); onClose(); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2.5 transition-colors group"
              >
                <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
                </svg>
                New Folder
              </button>
              <div className="h-px bg-gray-100 dark:bg-white/5 my-1 mx-2" />
            </>
          )}

          <button
            onClick={() => { onRename(); onClose(); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2.5 transition-colors group"
          >
            <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Rename
          </button>

          <button
            onClick={() => { onReveal(); onClose(); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2.5 transition-colors group"
          >
            <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Reveal in Finder
          </button>

          <div className="h-px bg-gray-100 dark:bg-white/5 my-1 mx-2" />

          <button
            onClick={() => { onMoveToTrash(); onClose(); }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg flex items-center gap-2.5 transition-colors group"
          >
            <svg className="w-4 h-4 text-red-400 group-hover:text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete
          </button>
        </>
      )}
    </div>
  );

  return createPortal(menu, document.body);
};

// Prompt Dialog component
const PromptDialog: React.FC<{
  isOpen: boolean;
  title: string;
  label: string;
  defaultValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}> = ({ isOpen, title, label, defaultValue, onConfirm, onCancel }) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full border border-gray-200 dark:border-gray-700 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          </div>
          <div className="px-6 py-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div className="px-6 py-4 flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-black dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

// Confirm Dialog component
const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  variant: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ isOpen, title, message, confirmText, variant, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  const variantStyles = {
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    info: 'bg-black hover:bg-gray-800 text-white dark:bg-white dark:hover:bg-gray-100 dark:text-black'
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full border border-gray-200 dark:border-gray-700 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        </div>
        <div className="px-6 py-4">
          <p className="text-gray-600 dark:text-gray-400">{message}</p>
        </div>
        <div className="px-6 py-4 flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${variantStyles[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const getTrashItems = (nodes: FileNode[]): FileNode[] => {
  let trash: FileNode[] = [];
  nodes.forEach(node => {
    if (node.isTrash) trash.push(node);
    if (node.children) trash = trash.concat(getTrashItems(node.children));
  });
  return trash;
};

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFileId,
  onFileSelect,
  onOpenFolder,
  onCreateFile,
  onNewFolder,
  onOpenSettings,
  onRename,
  onDelete,
  onReveal,
  onOpenInBrowser,
  onMoveToTrash,
  onRestoreFromTrash,
  onDeleteForever,
  onMoveNode,
  isOpen,
  onClose
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({ type: null });

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const closeContextMenu = () => setContextMenu(null);

  const trashItems = getTrashItems(files);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed md:relative z-30 h-full w-72 flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]
        glass border-r border-gray-200/50 dark:border-white/5
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex justify-between items-center px-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-gray-800 to-black dark:from-white dark:to-gray-300 rounded-lg shadow-lg flex items-center justify-center text-white dark:text-black font-bold text-xs tracking-tighter">
                MP
              </div>
              <span className="font-semibold text-gray-800 dark:text-gray-100 tracking-tight">Markdown Press</span>
            </div>
            <button onClick={onClose} className="md:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={onOpenFolder}
              className="w-full flex items-center justify-center gap-2 px-3 bg-white dark:bg-white/10 text-gray-700 dark:text-gray-200 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/20 transition-all border border-gray-200 dark:border-white/5 shadow-sm active:scale-95"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-xs font-semibold">Open Folder</span>
            </button>

            <button
              onClick={() => onCreateFile()}
              className="flex items-center justify-center w-10 h-full bg-black dark:bg-white text-white dark:text-black rounded-lg hover:opacity-80 transition-all shadow-sm active:scale-95 group"
              title="New Note"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 scrollbar-hide">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-600 px-6 text-center">
              <svg className="w-8 h-8 mb-3 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-xs mb-3">No local files opened.</p>
              <button onClick={onOpenFolder} className="text-accent-DEFAULT hover:underline text-xs font-medium">
                Open Folder
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {files
                .filter(node => !node.isTrash)
                .map(node => (
                  <FileTreeItem
                    key={node.id}
                    node={node}
                    onSelect={(f) => {
                      onFileSelect(f);
                      if (window.innerWidth < 768) onClose();
                    }}
                    activeId={activeFileId}
                    level={0}
                    onContextMenu={handleContextMenu}
                    onMoveNode={onMoveNode}
                  />
                ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-200/50 dark:border-white/5 space-y-2">
          <div>
            <button
              onClick={() => setShowTrash(!showTrash)}
              className="flex items-center justify-between w-full px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors text-gray-500 dark:text-gray-400 text-xs font-medium"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Trash ({trashItems.length})</span>
              </div>
              {showTrash ? (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>

            {showTrash && (
              <TrashView
                trashItems={trashItems}
                onRestore={onRestoreFromTrash}
                onDeleteForever={onDeleteForever}
                onContextMenu={handleContextMenu}
              />
            )}
          </div>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 w-full px-3 py-2 text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Context Menu Portal */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={closeContextMenu}
          onRename={() => setDialogState({ type: 'rename', file: contextMenu.node, defaultValue: contextMenu.node.name.replace(/\.md$/, '') })}
          onDelete={() => setDialogState({ type: 'delete', file: contextMenu.node })}
          onReveal={() => onReveal(contextMenu.node.path)}
          onOpenInBrowser={onOpenInBrowser ? () => onOpenInBrowser(contextMenu.node) : undefined}
          onCreateFile={() => onCreateFile(contextMenu.node.type === 'folder' ? contextMenu.node : undefined)}
          onCreateFolder={() => setDialogState({ type: 'newFolder', file: contextMenu.node })}
          onMoveToTrash={() => onMoveToTrash(contextMenu.node)}
          onRestoreFromTrash={() => onRestoreFromTrash(contextMenu.node)}
          onDeleteForever={() => setDialogState({ type: 'delete', file: contextMenu.node })}
        />
      )}

      {/* Rename Dialog */}
      <PromptDialog
        isOpen={dialogState.type === 'rename'}
        title="Rename"
        label="New name:"
        defaultValue={dialogState.defaultValue || ''}
        onConfirm={(value) => {
          if (dialogState.file) {
            onRename(dialogState.file, value);
          }
          setDialogState({ type: null });
        }}
        onCancel={() => setDialogState({ type: null })}
      />

      {/* New Folder Dialog */}
      <PromptDialog
        isOpen={dialogState.type === 'newFolder'}
        title="New Folder"
        label="Folder name:"
        defaultValue=""
        onConfirm={(value) => {
          onNewFolder(dialogState.file?.type === 'folder' ? dialogState.file : undefined);
          setDialogState({ type: null });
        }}
        onCancel={() => setDialogState({ type: null })}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={dialogState.type === 'delete'}
        title="Delete Item"
        message={`Are you sure you want to delete "${dialogState.file?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={() => {
          if (dialogState.file) {
            onDelete(dialogState.file);
          }
          setDialogState({ type: null });
        }}
        onCancel={() => setDialogState({ type: null })}
      />
    </>
  );
};