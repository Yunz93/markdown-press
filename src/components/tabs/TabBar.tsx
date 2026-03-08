import React, { useCallback, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import type { FileNode } from '../../types';

interface TabBarProps {
  onToggleSidebar: () => void;
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

export const TabBar: React.FC<TabBarProps> = ({ onToggleSidebar }) => {
  const {
    files,
    openTabs,
    activeTabId,
    setActiveTab,
    closeTab,
    setCurrentFilePath,
  } = useAppStore();

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

  if (openTabs.length === 0) {
    return null;
  }

  return (
    <div className="tab-bar flex items-center h-10 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {openTabs.map((fileId) => {
        const file = fileMap.get(fileId);
        if (!file) return null;

        const isActive = activeTabId === fileId;
        const hasChanges = false; // Could track dirty state in future

        return (
          <div
            key={fileId}
            className={`tab flex items-center gap-2 px-3 py-1.5 min-w-0 max-w-[200px] cursor-pointer border-r border-gray-200 dark:border-gray-700 transition-colors ${
              isActive
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            onClick={() => handleTabClick(fileId)}
            title={file.path}
          >
            <span className="truncate text-xs font-medium flex-1">
              {file.name}
            </span>
            {hasChanges && (
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            )}
            <button
              className="close-tab p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
              onClick={(e) => handleCloseTab(e, fileId)}
              title="Close tab"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
};
