import React, { useCallback } from 'react';

export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 420;

export interface UseSidebarResizeOptions {
  onWidthChange: (width: number) => void;
}

export interface UseSidebarResizeReturn {
  handleResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export function useSidebarResize(options: UseSidebarResizeOptions): UseSidebarResizeReturn {
  const { onWidthChange } = options;

  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768) return;

    event.preventDefault();

    const sidebarRect = (event.currentTarget.parentElement?.parentElement as HTMLElement | null)?.getBoundingClientRect();

    const handlePointerMove = (moveEvent: MouseEvent) => {
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

  return { handleResizeStart };
}
