import React, { useState, useCallback } from 'react';

const DRAG_DATA_TYPE = 'application/vnd.markdown-press.node-id';

export interface UseSidebarDragAndDropReturn {
  isRootDragOver: boolean;
  setIsRootDragOver: (value: boolean) => void;
  extractDraggedNodeId: (event: React.DragEvent) => string | null;
  handleDragStart: (event: React.DragEvent, nodeId: string) => void;
  handleRootDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleRootDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  handleRootDrop: (event: React.DragEvent<HTMLDivElement>, onMoveToRoot: (nodeId: string) => void) => void;
}

export function useSidebarDragAndDrop(): UseSidebarDragAndDropReturn {
  const [isRootDragOver, setIsRootDragOver] = useState(false);

  const extractDraggedNodeId = useCallback((event: React.DragEvent): string | null => {
    try {
      const data = event.dataTransfer.getData(DRAG_DATA_TYPE);
      if (data) return data;
    } catch {
      // Some browsers may throw when accessing dataTransfer during dragOver
    }
    return null;
  }, []);

  const handleDragStart = useCallback((event: React.DragEvent, nodeId: string) => {
    event.dataTransfer.setData(DRAG_DATA_TYPE, nodeId);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleRootDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const sourceId = extractDraggedNodeId(event);
      if (!sourceId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setIsRootDragOver(true);
    },
    [extractDraggedNodeId]
  );

  const handleRootDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setIsRootDragOver(false);
  }, []);

  const handleRootDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>, onMoveToRoot: (nodeId: string) => void) => {
      event.preventDefault();
      const sourceId = extractDraggedNodeId(event);
      setIsRootDragOver(false);
      if (!sourceId) return;
      onMoveToRoot(sourceId);
    },
    [extractDraggedNodeId]
  );

  return {
    isRootDragOver,
    setIsRootDragOver,
    extractDraggedNodeId,
    handleDragStart,
    handleRootDragOver,
    handleRootDragLeave,
    handleRootDrop,
  };
}
