/**
 * Scroll Sync Hook
 * 
 * 处理编辑器滚动同步功能
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { EditorView } from '@codemirror/view';

const DEFAULT_SCROLL_THRESHOLD = 5;
const DEFAULT_SCROLL_EMIT_THRESHOLD = 0.001;
const SYNC_SETTLE_THRESHOLD = 0.75;
const SYNC_MIN_DURATION_MS = 90;
const SYNC_MAX_DURATION_MS = 260;
const SYNC_PIXELS_PER_MS = 3.2;

function getNormalizedScrollPercentage(scrollTop: number, scrollHeight: number): number {
  if (scrollHeight <= 0) return 0;
  return Math.min(Math.max(scrollTop / scrollHeight, 0), 1);
}

export interface UseScrollSyncOptions {
  onScroll?: (percentage: number) => void;
}

export interface UseScrollSyncReturn {
  // 注册编辑器视图
  registerView: (view: EditorView | null) => void;
  // 取消同步
  cancelScrollSync: () => void;
  // 同步到指定百分比
  syncScrollTo: (percentage: number, options?: { immediate?: boolean }) => void;
  // 滚动事件处理器（用于传递给 CodeMirror）
  handleScroll: () => void;
}

export function useScrollSync(options: UseScrollSyncOptions): UseScrollSyncReturn {
  const { onScroll } = options;

  const viewRef = useRef<EditorView | null>(null);
  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);
  const onScrollRef = useRef(onScroll);
  const syncAnimationFrameRef = useRef<number | null>(null);
  const syncTargetScrollTopRef = useRef<number | null>(null);
  const syncStartScrollTopRef = useRef(0);
  const syncStartTimeRef = useRef(0);
  const syncDurationRef = useRef(SYNC_MIN_DURATION_MS);
  const unlockAnimationFrameRef = useRef<number | null>(null);
  const scrollThresholdRef = useRef(DEFAULT_SCROLL_THRESHOLD);
  const emitThresholdRef = useRef(DEFAULT_SCROLL_EMIT_THRESHOLD);

  // 更新 onScroll ref
  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);

  // 清理动画帧
  useEffect(() => {
    return () => {
      cancelScrollSync();
    };
  }, []);

  // 发射滚动百分比
  const emitScrollPercentage = useCallback((scrollContainer: HTMLElement) => {
    const denom = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    if (denom <= 0) return;

    const percentage = getNormalizedScrollPercentage(scrollContainer.scrollTop, denom);

    // 程序化滚动期间仍更新 ref，避免与真实 scrollTop 脱节导致分屏联动偶发失效
    if (isSyncingScroll.current) {
      lastScrollPercentage.current = percentage;
      return;
    }

    const onScrollCallback = onScrollRef.current;
    if (!onScrollCallback) return;

    if (Math.abs(percentage - lastScrollPercentage.current) <= emitThresholdRef.current) return;

    lastScrollPercentage.current = percentage;
    // Emit immediately for lower latency in split view sync
    onScrollCallback(percentage);
  }, []);

  // 取消同步滚动
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
    syncStartTimeRef.current = 0;
    isSyncingScroll.current = false;
  }, []);

  const scheduleSyncUnlock = useCallback(() => {
    if (unlockAnimationFrameRef.current !== null) {
      cancelAnimationFrame(unlockAnimationFrameRef.current);
    }

    unlockAnimationFrameRef.current = requestAnimationFrame(() => {
      unlockAnimationFrameRef.current = null;
      const view = viewRef.current;
      if (view) {
        const dom = view.scrollDOM;
        const d = dom.scrollHeight - dom.clientHeight;
        if (d > 0) {
          lastScrollPercentage.current = getNormalizedScrollPercentage(dom.scrollTop, d);
        }
      }
      isSyncingScroll.current = false;
    });
  }, []);

  // 动画同步滚动
  const animateSyncedScroll = useCallback((scrollDom: HTMLElement, targetScrollTop: number) => {
    const maxScrollTop = Math.max(0, scrollDom.scrollHeight - scrollDom.clientHeight);
    const clampedTarget = Math.min(Math.max(targetScrollTop, 0), maxScrollTop);
    const currentScrollTop = scrollDom.scrollTop;
    syncTargetScrollTopRef.current = clampedTarget;
    syncStartScrollTopRef.current = currentScrollTop;
    syncStartTimeRef.current = 0;
    syncDurationRef.current = Math.min(
      SYNC_MAX_DURATION_MS,
      Math.max(SYNC_MIN_DURATION_MS, Math.abs(clampedTarget - currentScrollTop) / SYNC_PIXELS_PER_MS)
    );
    isSyncingScroll.current = true;

    if (syncAnimationFrameRef.current !== null) return;

    const step = (timestamp: number) => {
      const currentView = viewRef.current;
      const target = syncTargetScrollTopRef.current;

      if (!currentView || currentView.scrollDOM !== scrollDom || target === null) {
        syncAnimationFrameRef.current = null;
        syncTargetScrollTopRef.current = null;
        syncStartTimeRef.current = 0;
        isSyncingScroll.current = false;
        return;
      }

      if (syncStartTimeRef.current === 0) {
        syncStartTimeRef.current = timestamp;
      }

      const start = syncStartScrollTopRef.current;
      const duration = syncDurationRef.current;
      const progress = Math.min(1, (timestamp - syncStartTimeRef.current) / duration);
      const nextScrollTop = start + ((target - start) * progress);

      if (Math.abs(target - nextScrollTop) <= SYNC_SETTLE_THRESHOLD || progress >= 1) {
        scrollDom.scrollTop = target;
        syncAnimationFrameRef.current = null;
        syncTargetScrollTopRef.current = null;
        syncStartTimeRef.current = 0;
        scheduleSyncUnlock();
        return;
      }

      scrollDom.scrollTop = nextScrollTop;
      syncAnimationFrameRef.current = requestAnimationFrame(step);
    };

    syncAnimationFrameRef.current = requestAnimationFrame(step);
  }, [scheduleSyncUnlock]);

  // 同步到指定百分比
  const syncScrollTo = useCallback((percentage: number, options?: { immediate?: boolean }) => {
    const view = viewRef.current;
    if (!view) return;

    const scrollDom = view.scrollDOM;
    const maxScrollTop = scrollDom.scrollHeight - scrollDom.clientHeight;
    if (maxScrollTop <= 0) return;

    const targetScrollTop = maxScrollTop * percentage;
    if (Math.abs(scrollDom.scrollTop - targetScrollTop) <= scrollThresholdRef.current) return;
    if (options?.immediate) {
      cancelScrollSync();
      isSyncingScroll.current = true;
      scrollDom.scrollTop = targetScrollTop;
      const d = scrollDom.scrollHeight - scrollDom.clientHeight;
      if (d > 0) {
        lastScrollPercentage.current = getNormalizedScrollPercentage(scrollDom.scrollTop, d);
      }
      scheduleSyncUnlock();
      return;
    }
    animateSyncedScroll(scrollDom, targetScrollTop);
  }, [animateSyncedScroll, cancelScrollSync, scheduleSyncUnlock]);

  // 处理滚动事件
  const handleScroll = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    emitScrollPercentage(view.scrollDOM);
  }, [emitScrollPercentage]);

  // 注册视图
  const registerView = useCallback((view: EditorView | null) => {
    viewRef.current = view;
  }, []);

  return useMemo(() => ({
    registerView,
    cancelScrollSync,
    syncScrollTo,
    handleScroll,
  }), [cancelScrollSync, handleScroll, registerView, syncScrollTo]);
}
