import React, { useState, useCallback } from "react";
import {
  extractDraggedNodeId as extractDraggedNodeIdFromEvent,
  hasDragPayload,
  setDragPayload,
} from "../dragPayload";

export interface UseSidebarDragAndDropReturn {
  isRootDragOver: boolean;
  setIsRootDragOver: (value: boolean) => void;
  extractDraggedNodeId: (event: React.DragEvent) => string | null;
  handleDragStart: (event: React.DragEvent, nodeId: string) => void;
  handleRootDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleRootDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  handleRootDrop: (
    event: React.DragEvent<HTMLDivElement>,
    onMoveToRoot: (nodeId: string) => void,
  ) => void;
}

export function useSidebarDragAndDrop(): UseSidebarDragAndDropReturn {
  const [isRootDragOver, setIsRootDragOver] = useState(false);

  const extractDraggedNodeId = useCallback(
    (event: React.DragEvent): string | null =>
      extractDraggedNodeIdFromEvent(event),
    [],
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent, nodeId: string) => {
      setDragPayload(event, nodeId);
    },
    [],
  );

  const handleRootDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      // During dragover the payload data is not readable (protected mode);
      // only the list of types is, so gate on that instead of getData.
      if (!hasDragPayload(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setIsRootDragOver(true);
    },
    [],
  );

  const handleRootDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) return;
      setIsRootDragOver(false);
    },
    [],
  );

  const handleRootDrop = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      onMoveToRoot: (nodeId: string) => void,
    ) => {
      event.preventDefault();
      const sourceId = extractDraggedNodeIdFromEvent(event);
      setIsRootDragOver(false);
      if (!sourceId) return;
      onMoveToRoot(sourceId);
    },
    [],
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
