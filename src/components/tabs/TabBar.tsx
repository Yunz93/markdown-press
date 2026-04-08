import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../store/appStore';
import type { FileNode } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface TabBarProps {
  onToggleSidebar: () => void;
}

interface TabContextMenuState {
  x: number;
  y: number;
  fileId: string;
}

/**
 * Recursively find a file in the tree by ID
 */
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

/**
 * Get a flat map of all files by ID for quick lookup
 */
function buildFileMap(nodes: FileNode[], map: Map<string, FileNode> = new Map()): Map<string, FileNode> {
  for (const node of nodes) {
    map.set(node.id, node);
    if (node.children) {
      buildFileMap(node.children, map);
    }
  }
  return map;
}

function getDisplayFileName(name: string): string {
  return name.replace(/\.md$/i, '');
}

const TabContextMenu: React.FC<{
  x: number;
  y: number;
  onClose: () => void;
  onCloseOtherTabs: () => void;
}> = ({ x, y, onClose, onCloseOtherTabs }) => {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const nextX = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 10 : x;
      const nextY = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 10 : y;
      setPosition({ x: Math.max(10, nextX), y: Math.max(10, nextY) });
    }
  }, [x, y]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[120] min-w-[180px] rounded-xl bg-white/95 p-1 shadow-2xl backdrop-blur-xl dark:bg-gray-800/95"
      style={{ top: position.y, left: position.x }}
    >
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100/80 dark:text-gray-200 dark:hover:bg-gray-700/80"
        onClick={() => {
          onCloseOtherTabs();
          onClose();
        }}
      >
        <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
          <path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8" />
        </svg>
        {t('tab_closeOtherTabs')}
      </button>
    </div>,
    document.body
  );
};

export const TabBar: React.FC<TabBarProps> = ({ onToggleSidebar }) => {
  const { t } = useI18n();
  void onToggleSidebar;
  const {
    files,
    openTabs,
    activeTabId,
    setActiveTab,
    closeTab,
    closeOtherTabs,
    setCurrentFilePath,
  } = useAppStore();
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);

  // Build a map of all files for quick lookup (including nested ones)
  const fileMap = useMemo(() => buildFileMap(files), [files]);

  const handleTabClick = useCallback((fileId: string) => {
    const file = fileMap.get(fileId);
    if (file) {
      setActiveTab(fileId);
      setCurrentFilePath(file.path);
    }
  }, [fileMap, setActiveTab, setCurrentFilePath]);

  const handleCloseTab = useCallback((e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    closeTab(fileId);
  }, [closeTab]);

  const handleTabContextMenu = useCallback((event: React.MouseEvent, fileId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, fileId });
  }, []);

  const handleCloseOtherTabs = useCallback((fileId: string) => {
    const file = fileMap.get(fileId);
    closeOtherTabs(fileId);
    if (file) {
      setCurrentFilePath(file.path);
    }
  }, [closeOtherTabs, fileMap, setCurrentFilePath]);

  if (openTabs.length === 0) {
    return null;
  }

  return (
    <div className="tab-bar min-w-0">
      <div className="tab-strip">
        {openTabs.map((fileId) => {
          const file = fileMap.get(fileId);
          if (!file) return null;

          const isActive = activeTabId === fileId;
          const hasChanges = false; // Could track dirty state in future

          return (
            <div
              key={fileId}
              className={`tab browser-tab ${isActive ? 'is-active' : 'is-inactive'}`}
              onClick={() => handleTabClick(fileId)}
              onContextMenu={(event) => handleTabContextMenu(event, fileId)}
              title={file.path}
            >
              <div className="tab-surface">
                <span className="tab-side-spacer" aria-hidden />
                <span className="tab-title truncate text-xs font-medium">
                  {getDisplayFileName(file.name)}
                </span>
                <span className="tab-actions">
                  {hasChanges && (
                    <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                  )}
                  <button
                    className="close-tab p-0.5 rounded-md hover:bg-gray-200/80 dark:hover:bg-gray-700/80 transition-colors flex-shrink-0"
                    onClick={(e) => handleCloseTab(e, fileId)}
                    title={t('tab_closeTab')}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCloseOtherTabs={() => handleCloseOtherTabs(contextMenu.fileId)}
        />
      )}
    </div>
  );
};
