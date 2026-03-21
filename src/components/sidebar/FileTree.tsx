import React, { useState, useCallback } from 'react';
import type { FileNode } from '../../types';

interface FileTreeItemProps {
  node: FileNode;
  level: number;
  activeId: string | null;
  onSelect: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onMoveNode: (sourceId: string, targetId: string) => void;
  forceExpanded?: boolean;
}

export const FileTreeItem: React.FC<FileTreeItemProps> = ({
  node,
  level,
  activeId,
  onSelect,
  onContextMenu,
  onMoveNode,
  forceExpanded = false
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const isFolder = node.type === 'folder';

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      setExpanded(prev => !prev);
    } else {
      onSelect(node);
    }
  }, [isFolder, onSelect, node]);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node);
  }, [onContextMenu, node]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/json', JSON.stringify({ id: node.id }));
    e.dataTransfer.effectAllowed = 'move';
  }, [node.id]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isFolder || node.isTrash) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }, [isFolder, node.isTrash]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const data = e.dataTransfer.getData('application/json');
    if (data) {
      try {
        const { id: sourceId } = JSON.parse(data);
        if (sourceId !== node.id) {
          onMoveNode(sourceId, node.id);
        }
      } catch (err) {
        console.error('Drop error', err);
      }
    }
  }, [isFolder, onMoveNode, node.id]);

  const isActive = node.id === activeId;

  const showChildren = isFolder && (expanded || forceExpanded) && node.children;

  return (
    <div
      className="select-none"
      draggable={!node.isTrash}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`
          flex items-center py-2 px-3 cursor-pointer transition-all duration-200 mx-2 rounded-lg text-sm font-medium border border-transparent
          ${isActive
            ? 'bg-white shadow-sm dark:bg-white/10 text-black dark:text-white'
            : 'hover:bg-black/5 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'}
          ${isDragOver ? 'bg-accent-DEFAULT/20 border-accent-DEFAULT dark:bg-accent-DEFAULT/20 dark:border-accent-DEFAULT' : ''}
        `}
        style={{ paddingLeft: `${Math.max(level * 12 + 12, 12)}px` }}
        onClick={handleClick}
        onContextMenu={handleRightClick}
      >
        <span className={`mr-2.5 transition-colors ${isActive ? 'text-accent-DEFAULT' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`}>
          {isFolder ? (
            expanded ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            )
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
          )}
        </span>
        <span className="truncate flex-1">{node.name.replace('.md', '')}</span>
        {isFolder && (
          <span className="ml-auto opacity-30 group-hover:opacity-100 transition-opacity">
            {expanded ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </span>
        )}
      </div>

      {showChildren && (
        <div className="ml-0 mt-0.5 space-y-0.5">
          {node.children
            .filter(child => !child.isTrash)
            .map(child => (
              <FileTreeItem
                key={child.id}
                node={child}
                onSelect={onSelect}
                activeId={activeId}
                level={level + 1}
                onContextMenu={onContextMenu}
                onMoveNode={onMoveNode}
                forceExpanded={forceExpanded}
              />
            ))}
        </div>
      )}
    </div>
  );
};
