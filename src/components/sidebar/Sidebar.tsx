import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FileTreeItem } from './FileTree';
import { TrashView } from './TrashView';
import type { FileNode } from '../../types';

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 420;

interface SidebarProps {
  files: FileNode[];
  activeFileId: string | null;
  onFileSelect: (file: FileNode) => void;
  onCreateFile: (parentFolder?: FileNode, fileName?: string) => void;
  onNewFolder: (parentFolder?: FileNode, name?: string) => void;
  onRename: (file: FileNode, newName: string) => void;
  onDelete: (file: FileNode) => void;
  onReveal: (path: string) => void;
  onOpenInBrowser?: (file: FileNode) => void;
  onMoveToTrash: (file: FileNode) => void;
  onRestoreFromTrash: (file: FileNode) => void;
  onDeleteForever: (file: FileNode) => void;
  onMoveNode: (sourceId: string, targetId: string) => void;
  onMoveToRoot: (sourceId: string) => void;
  currentKnowledgeBaseName?: string;
  currentKnowledgeBasePath?: string | null;
  onSwitchKnowledgeBase: () => void;
  isOpen: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}

interface DialogState {
  type: 'rename' | 'delete' | 'newFolder' | 'newFile' | null;
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
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-black dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
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
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${variantStyles[variant]}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const getTrashItems = (nodes: FileNode[]): FileNode[] => {
  const getTrashDepth = (path: string): number => {
    const segments = path.split(/[\\/]+/).filter(Boolean);
    const trashIndex = Math.max(
      segments.lastIndexOf('.trash'),
      segments.lastIndexOf('_markdown_press_trash')
    );
    if (trashIndex < 0) return -1;
    return segments.length - trashIndex - 1;
  };

  const trash: FileNode[] = [];
  const collect = (items: FileNode[]) => {
    for (const node of items) {
      if (node.isTrash && getTrashDepth(node.path) === 2) {
        trash.push(node);
      }
      if (node.children) {
        collect(node.children);
      }
    }
  };

  collect(nodes);
  return trash;
};

const normalizeSearchTarget = (name: string): string => name.replace(/\.md$/i, '').toLowerCase();

const filterNodesByFileName = (nodes: FileNode[], query: string): FileNode[] => {
  if (!query.trim()) return nodes.filter((node) => !node.isTrash);

  const normalizedQuery = query.trim().toLowerCase();

  return nodes.reduce<FileNode[]>((acc, node) => {
    if (node.isTrash) return acc;

    if (node.type === 'folder') {
      const filteredChildren = filterNodesByFileName(node.children ?? [], normalizedQuery);
      if (filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: filteredChildren,
        });
      }
      return acc;
    }

    if (normalizeSearchTarget(node.name).includes(normalizedQuery) || node.name.toLowerCase().includes(normalizedQuery)) {
      acc.push(node);
    }

    return acc;
  }, []);
};

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFileId,
  onFileSelect,
  onCreateFile,
  onNewFolder,
  onRename,
  onDelete,
  onReveal,
  onOpenInBrowser,
  onMoveToTrash,
  onRestoreFromTrash,
  onDeleteForever,
  onMoveNode,
  onMoveToRoot,
  currentKnowledgeBaseName,
  currentKnowledgeBasePath,
  onSwitchKnowledgeBase,
  isOpen,
  width,
  onWidthChange,
  onClose
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({ type: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [isRootDragOver, setIsRootDragOver] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const extractDraggedNodeId = useCallback((event: React.DragEvent): string | null => {
    const rawPayload = event.dataTransfer.getData('application/json');
    if (!rawPayload) return null;

    try {
      const parsed = JSON.parse(rawPayload) as { id?: string };
      return parsed.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const closeContextMenu = () => setContextMenu(null);

  const trashItems = getTrashItems(files);
  const filteredFiles = useMemo(
    () => filterNodesByFileName(files, searchQuery),
    [files, searchQuery]
  );
  const hasSearchQuery = searchQuery.trim().length > 0;
  const hasVisibleFiles = filteredFiles.length > 0;

  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768) return;

    event.preventDefault();

    const handlePointerMove = (moveEvent: MouseEvent) => {
      const sidebarRect = sidebarRef.current?.getBoundingClientRect();
      const nextWidth = moveEvent.clientX - (sidebarRect?.left ?? 0);
      onWidthChange(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, nextWidth)));
    };

    const handlePointerUp = () => {
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('mouseup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
  }, [onWidthChange]);

  const handleRootDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const sourceId = extractDraggedNodeId(event);
    if (!sourceId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setIsRootDragOver(true);
  }, [extractDraggedNodeId]);

  const handleRootDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setIsRootDragOver(false);
  }, []);

  const handleRootDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourceId = extractDraggedNodeId(event);
    setIsRootDragOver(false);
    if (!sourceId) return;
    onMoveToRoot(sourceId);
  }, [extractDraggedNodeId, onMoveToRoot]);

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
        style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}
        className={`
        fixed md:relative z-30 h-full w-72 md:flex-shrink-0 flex flex-col overflow-hidden
        transition-[transform,width,opacity,border-color] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]
        glass border-r border-gray-200/50 dark:border-white/5
        ${isOpen
          ? 'translate-x-0 md:w-[var(--sidebar-width)] opacity-100'
          : '-translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:border-r-transparent pointer-events-none'
        }
      `}
      >
        <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
          <div className="flex justify-end items-center px-2 md:hidden">
            <button onClick={onClose} className="md:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files"
                className="w-full rounded-xl border border-gray-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] py-2 pl-9 pr-3 text-sm font-medium text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none transition-colors focus:border-gray-300 dark:focus:border-white/20 focus:bg-white dark:focus:bg-white/[0.06]"
              />
            </label>
            <button
              onClick={() => setDialogState({ type: 'newFile', defaultValue: 'Untitled' })}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200/80 dark:border-white/10 bg-white/85 dark:bg-white/[0.04] text-gray-700 dark:text-gray-200 shadow-sm transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.08] active:scale-95"
              title="New Note"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        <div
          className={`flex-1 overflow-y-auto py-2 scrollbar-hide transition-colors ${isRootDragOver ? 'bg-accent-DEFAULT/10 dark:bg-accent-DEFAULT/10' : ''}`}
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
          onDragEnd={() => setIsRootDragOver(false)}
        >
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-600 px-6 text-center">
              <svg className="w-8 h-8 mb-3 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-xs mb-3">No local files opened.</p>
              <p className="text-xs text-gray-400">Use the knowledge base button below to open a vault.</p>
            </div>
          ) : !hasVisibleFiles ? (
            <div className="flex flex-col items-center justify-center h-40 px-6 text-center text-gray-400 dark:text-gray-600">
              <svg className="mb-3 h-8 w-8 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No matching files</p>
              {hasSearchQuery && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Try another filename keyword.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredFiles
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
                    forceExpanded={hasSearchQuery}
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
            onClick={onSwitchKnowledgeBase}
            className="flex items-center justify-between gap-2 w-full px-3 py-2.5 text-gray-700 dark:text-gray-200 rounded-xl border border-gray-200/70 dark:border-white/10 bg-gray-50/70 dark:bg-white/[0.03] hover:bg-gray-100/80 dark:hover:bg-white/[0.06] transition-colors"
            title={currentKnowledgeBasePath || 'Open Knowledge Base'}
          >
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              </svg>
              <p className="text-sm font-semibold truncate min-w-0">
                {currentKnowledgeBaseName || 'Open Knowledge Base'}
              </p>
            </div>
            <svg className="w-4 h-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              <polyline points="9 13 12 10 15 13" />
              <line x1="12" y1="10" x2="12" y2="16" />
            </svg>
          </button>
        </div>

        {isOpen && (
          <div
            className="absolute inset-y-0 right-0 hidden w-4 cursor-col-resize md:block"
            onMouseDown={handleResizeStart}
            aria-hidden
          >
            <div className="absolute right-0 top-0 h-full w-px bg-gray-200/70 dark:bg-white/10" />
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
          onRename={() => setDialogState({ type: 'rename', file: contextMenu.node, defaultValue: contextMenu.node.name.replace(/\.md$/, '') })}
          onDelete={() => setDialogState({ type: 'delete', file: contextMenu.node })}
          onReveal={() => onReveal(contextMenu.node.path)}
          onOpenInBrowser={onOpenInBrowser ? () => onOpenInBrowser(contextMenu.node) : undefined}
          onCreateFile={() => setDialogState({
            type: 'newFile',
            file: contextMenu.node.type === 'folder' ? contextMenu.node : undefined,
            defaultValue: 'Untitled',
          })}
          onCreateFolder={() => setDialogState({ type: 'newFolder', file: contextMenu.node })}
          onMoveToTrash={() => onMoveToTrash(contextMenu.node)}
          onRestoreFromTrash={() => onRestoreFromTrash(contextMenu.node)}
          onDeleteForever={() => setDialogState({ type: 'delete', file: contextMenu.node })}
        />
      )}

      {/* New File Dialog */}
      <PromptDialog
        isOpen={dialogState.type === 'newFile'}
        title="New File"
        label="File name:"
        defaultValue={dialogState.defaultValue || 'Untitled'}
        onConfirm={(value) => {
          onCreateFile(dialogState.file?.type === 'folder' ? dialogState.file : undefined, value);
          setDialogState({ type: null });
        }}
        onCancel={() => setDialogState({ type: null })}
      />

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
          onNewFolder(dialogState.file?.type === 'folder' ? dialogState.file : undefined, value);
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
