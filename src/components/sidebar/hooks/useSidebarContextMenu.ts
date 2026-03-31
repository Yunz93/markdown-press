import React, { useState, useCallback } from 'react';
import type { FileNode } from '../../../types';

export interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}

export interface UseSidebarContextMenuReturn {
  contextMenu: ContextMenuState | null;
  openContextMenu: (event: React.MouseEvent, node: FileNode) => void;
  closeContextMenu: () => void;
}

export function useSidebarContextMenu(): UseSidebarContextMenuReturn {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const openContextMenu = useCallback((event: React.MouseEvent, node: FileNode) => {
    event.preventDefault();
    event.stopPropagation();

    // Small delay to avoid conflict with click handlers
    requestAnimationFrame(() => {
      const x = Math.min(event.clientX, window.innerWidth - 220);
      const y = Math.min(event.clientY, window.innerHeight - 200);
      setContextMenu({ x, y, node });
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    contextMenu,
    openContextMenu,
    closeContextMenu,
  };
}
