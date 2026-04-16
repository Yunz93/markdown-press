import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { FileNode } from '../../types';

const AUTO_EXPAND_ON_DRAG_MS = 420;

interface FileTreeItemProps {
  node: FileNode;
  level: number;
  activeId: string | null;
  onSelect: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onMoveNode: (sourceId: string, targetId: string) => void;
  forceExpanded?: boolean;
  expandedPathIds?: Set<string>;
  locateRequestKey?: number;
}

export const FileTreeItem: React.FC<FileTreeItemProps> = ({
  node,
  level,
  activeId,
  onSelect,
  onContextMenu,
  onMoveNode,
  forceExpanded = false,
  expandedPathIds,
  locateRequestKey = 0,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const autoExpandTimerRef = useRef<number | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  const isFolder = node.type === 'folder';
  const isDropTarget = !node.isTrash;

  const extractDraggedNodeId = useCallback((event: React.DragEvent): string | null => {
    const rawPayload = event.dataTransfer.getData('application/json');
    if (!rawPayload) {
      return event.dataTransfer.getData('text/plain') || null;
    }

    try {
      const parsed = JSON.parse(rawPayload) as { id?: string };
      return parsed.id ?? null;
    } catch {
      return event.dataTransfer.getData('text/plain') || null;
    }
  }, []);

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
    const payload = JSON.stringify({ id: node.id, type: node.type });
    e.dataTransfer.setData('application/json', payload);
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  }, [node.id, node.type]);

  const clearAutoExpandTimer = useCallback(() => {
    if (autoExpandTimerRef.current !== null) {
      window.clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isDropTarget) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
    if (isFolder && !expanded && autoExpandTimerRef.current === null) {
      autoExpandTimerRef.current = window.setTimeout(() => {
        setExpanded(true);
        autoExpandTimerRef.current = null;
      }, AUTO_EXPAND_ON_DRAG_MS);
    }
  }, [expanded, isDropTarget, isFolder]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    clearAutoExpandTimer();
  }, [clearAutoExpandTimer]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!isDropTarget) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    clearAutoExpandTimer();

    const sourceId = extractDraggedNodeId(e);
    if (!sourceId) return;

    if (sourceId !== node.id) {
      onMoveNode(sourceId, node.id);
    }
  }, [clearAutoExpandTimer, extractDraggedNodeId, isDropTarget, onMoveNode, node.id]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setIsDragOver(false);
    clearAutoExpandTimer();
  }, [clearAutoExpandTimer]);

  const isActive = node.id === activeId;
  const isInLocatedPath = Boolean(expandedPathIds?.has(node.id));

  useEffect(() => {
    if (locateRequestKey <= 0 || !isFolder || !isInLocatedPath) return;
    setExpanded(true);
  }, [isFolder, isInLocatedPath, locateRequestKey]);

  useEffect(() => {
    if (locateRequestKey <= 0 || !isActive) return;

    itemRef.current?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  }, [isActive, locateRequestKey]);

  const showChildren = isFolder && (expanded || forceExpanded) && node.children;

  return (
    <div className="select-none" data-file-tree-item>
      <div
        ref={itemRef}
        className={`
          group flex items-center py-2 px-3 cursor-pointer transition-all duration-200 mx-2 rounded-lg text-sm font-medium border border-transparent
          ${isActive
            ? 'border-gray-200/70 bg-white/72 text-gray-900 shadow-sm dark:border-white/10 dark:bg-[#1a2230] dark:text-white'
            : 'text-gray-600 hover:bg-black/[0.04] hover:text-black dark:text-slate-400 dark:hover:bg-[#121923] dark:hover:text-white'}
          ${isDragOver ? 'bg-accent-DEFAULT/20 border-accent-DEFAULT dark:bg-accent-DEFAULT/20 dark:border-accent-DEFAULT' : ''}
          ${isDragging ? 'opacity-60' : ''}
        `}
        style={{ paddingLeft: `${level * 8 + 12}px` }}
        draggable={!node.isTrash}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        onContextMenu={handleRightClick}
      >
        <span className={`mr-2.5 transition-colors ${isActive ? 'text-accent-DEFAULT' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`}>
          {isFolder ? (
            expanded ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.74999 9.77602C3.86203 9.7589 3.97698 9.75 4.09426 9.75H19.9057C20.023 9.75 20.138 9.7589 20.25 9.77602M3.74999 9.77602C2.55399 9.9588 1.68982 11.0788 1.86688 12.3182L2.72402 18.3182C2.88237 19.4267 3.83169 20.25 4.95141 20.25H19.0486C20.1683 20.25 21.1176 19.4267 21.276 18.3182L22.1331 12.3182C22.3102 11.0788 21.446 9.9588 20.25 9.77602M3.74999 9.77602V6C3.74999 4.75736 4.75735 3.75 5.99999 3.75H9.87867C10.2765 3.75 10.658 3.90804 10.9393 4.18934L13.0607 6.31066C13.342 6.59197 13.7235 6.75 14.1213 6.75H18C19.2426 6.75 20.25 7.75736 20.25 9V9.77602" />
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
          {(node.children ?? [])
            .filter(child => !child.isTrash)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
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
                expandedPathIds={expandedPathIds}
                locateRequestKey={locateRequestKey}
              />
            ))}
        </div>
      )}
    </div>
  );
};
