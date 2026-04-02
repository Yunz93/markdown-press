/**
 * Preview Scroll Hook
 * 
 * 处理预览面板的滚动同步功能
 */

import { useCallback, useEffect, useRef } from 'react';
import { isWindowsPlatform } from '../../../utils/platform';

const DEFAULT_SCROLL_THRESHOLD = 5;
const WINDOWS_SCROLL_THRESHOLD = 12;
const DEFAULT_SCROLL_EMIT_THRESHOLD = 0.001;
const WINDOWS_SCROLL_EMIT_THRESHOLD = 0.0025;

export interface UsePreviewScrollOptions {
  onScroll?: (percentage: number) => void;
}

export interface UsePreviewScrollReturn {
  // 滚动处理器
  handleScroll: (element: HTMLElement) => void;
  // 取消同步
  cancelScrollSync: () => void;
  // 同步到百分比
  syncScrollTo: (element: HTMLElement, percentage: number) => void;
  // 检查是否正在同步
  isSyncing: () => boolean;
}

export function usePreviewScroll(options: UsePreviewScrollOptions): UsePreviewScrollReturn {
  const { onScroll } = options;

  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);
  const onScrollRef = useRef(onScroll);
  const emitAnimationFrameRef = useRef<number | null>(null);
  const pendingEmittedPercentageRef = useRef<number | null>(null);
  const syncAnimationFrameRef = useRef<number | null>(null);
  const syncTargetScrollTopRef = useRef<number | null>(null);
  const unlockAnimationFrameRef = useRef<number | null>(null);
  const useImmediateSyncRef = useRef(isWindowsPlatform());
  const scrollThresholdRef = useRef(
    useImmediateSyncRef.current ? WINDOWS_SCROLL_THRESHOLD : DEFAULT_SCROLL_THRESHOLD
  );
  const emitThresholdRef = useRef(
    useImmediateSyncRef.current ? WINDOWS_SCROLL_EMIT_THRESHOLD : DEFAULT_SCROLL_EMIT_THRESHOLD
  );

  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (emitAnimationFrameRef.current !== null) {
        cancelAnimationFrame(emitAnimationFrameRef.current);
      }
      cancelScrollSync();
    };
  }, []);

  // Cancel synced scroll
  const cancelScrollSync = useCallback(() => {
    if (syncAnimationFrameRef.current !== null) {
      cancelAnimationFrame(syncAnimationFrameRef.current);
      syncAnimationFrameRef.current = null;
    }
    if (unlockAnimationFrameRef.current !== null) {
      cancelAnimationFrame(unlockAnimationFrameRef.current);
      unlockAnimationFrameRef.current = null;
    }
    syncTargetScrollTopRef.current = null;
    isSyncingScroll.current = false;
  }, []);

  const scheduleSyncUnlock = useCallback(() => {
    if (unlockAnimationFrameRef.current !== null) {
      cancelAnimationFrame(unlockAnimationFrameRef.current);
    }

    unlockAnimationFrameRef.current = requestAnimationFrame(() => {
      unlockAnimationFrameRef.current = null;
      isSyncingScroll.current = false;
    });
  }, []);

  // Animate synced scroll
  const animateSyncedScroll = useCallback((element: HTMLElement, targetScrollTop: number) => {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const clampedTarget = Math.min(Math.max(targetScrollTop, 0), maxScrollTop);
    syncTargetScrollTopRef.current = clampedTarget;

    const commitScroll = () => {
      const target = syncTargetScrollTopRef.current;

      if (!element || target === null) {
        syncTargetScrollTopRef.current = null;
        isSyncingScroll.current = false;
        return;
      }

      element.scrollTop = target;
      syncTargetScrollTopRef.current = null;
      scheduleSyncUnlock();
    };

    isSyncingScroll.current = true;

    if (useImmediateSyncRef.current) {
      if (syncAnimationFrameRef.current !== null) {
        cancelAnimationFrame(syncAnimationFrameRef.current);
        syncAnimationFrameRef.current = null;
      }
      commitScroll();
      return;
    }

    if (syncAnimationFrameRef.current !== null) return;

    syncAnimationFrameRef.current = requestAnimationFrame(() => {
      syncAnimationFrameRef.current = null;
      commitScroll();
    });
  }, [scheduleSyncUnlock]);

  // Sync scroll to percentage
  const syncScrollTo = useCallback((element: HTMLElement, percentage: number) => {
    const scrollHeight = element.scrollHeight - element.clientHeight;
    if (scrollHeight <= 0) return;

    const targetScroll = scrollHeight * percentage;
    if (Math.abs(element.scrollTop - targetScroll) <= scrollThresholdRef.current) return;
    animateSyncedScroll(element, targetScroll);
  }, [animateSyncedScroll]);

  // Handle scroll event
  const handleScroll = useCallback((element: HTMLElement) => {
    const onScrollCallback = onScrollRef.current;
    if (!onScrollCallback || isSyncingScroll.current) return;

    const scrollHeight = element.scrollHeight - element.clientHeight;
    if (scrollHeight <= 0) return;

    const percentage = element.scrollTop / scrollHeight;

    if (Math.abs(percentage - lastScrollPercentage.current) <= emitThresholdRef.current) return;

    lastScrollPercentage.current = percentage;
    pendingEmittedPercentageRef.current = percentage;

    if (emitAnimationFrameRef.current !== null) return;

    emitAnimationFrameRef.current = requestAnimationFrame(() => {
      emitAnimationFrameRef.current = null;
      const pendingPercentage = pendingEmittedPercentageRef.current;
      pendingEmittedPercentageRef.current = null;
      const latestOnScroll = onScrollRef.current;
      if (pendingPercentage === null || !latestOnScroll) return;
      latestOnScroll(pendingPercentage);
    });
  }, []);

  // Check if currently syncing
  const isSyncing = useCallback(() => isSyncingScroll.current, []);

  return {
    handleScroll,
    cancelScrollSync,
    syncScrollTo,
    isSyncing,
  };
}
