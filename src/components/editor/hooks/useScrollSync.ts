/**
 * Scroll Sync Hook
 * 
 * 处理编辑器滚动同步功能
 */

import { useCallback, useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { throttle } from '../../../utils/throttle';

const SCROLL_THRESHOLD = 5;
const SCROLL_EMIT_THRESHOLD = 0.001;

export interface UseScrollSyncOptions {
  onScroll?: (percentage: number) => void;
}

export interface UseScrollSyncReturn {
  // 注册编辑器视图
  registerView: (view: EditorView | null) => void;
  // 取消同步
  cancelScrollSync: () => void;
  // 同步到指定百分比
  syncScrollTo: (percentage: number) => void;
  // 滚动事件处理器（用于传递给 CodeMirror）
  handleScroll: () => void;
}

export function useScrollSync(options: UseScrollSyncOptions): UseScrollSyncReturn {
  const { onScroll } = options;

  const viewRef = useRef<EditorView | null>(null);
  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);
  const onScrollRef = useRef(onScroll);
  const emitAnimationFrameRef = useRef<number | null>(null);
  const pendingEmittedPercentageRef = useRef<number | null>(null);
  const syncAnimationFrameRef = useRef<number | null>(null);
  const syncTargetScrollTopRef = useRef<number | null>(null);

  // 更新 onScroll ref
  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);

  // 清理动画帧
  useEffect(() => {
    return () => {
      if (emitAnimationFrameRef.current !== null) {
        cancelAnimationFrame(emitAnimationFrameRef.current);
      }
      cancelScrollSync();
    };
  }, []);

  // 发射滚动百分比
  const emitScrollPercentage = useCallback((scrollContainer: HTMLElement) => {
    if (isSyncingScroll.current) return;

    const onScrollCallback = onScrollRef.current;
    if (!onScrollCallback) return;

    const scrollHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    if (scrollHeight <= 0) return;

    const percentage = scrollContainer.scrollTop / scrollHeight;
    if (Math.abs(percentage - lastScrollPercentage.current) <= SCROLL_EMIT_THRESHOLD) return;

    lastScrollPercentage.current = percentage;
    pendingEmittedPercentageRef.current = percentage;

    if (emitAnimationFrameRef.current !== null) return;

    emitAnimationFrameRef.current = requestAnimationFrame(() => {
      emitAnimationFrameRef.current = null;
      const pendingPercentage = pendingEmittedPercentageRef.current;
      pendingEmittedPercentageRef.current = null;
      if (pendingPercentage === null) return;
      onScrollCallback(pendingPercentage);
    });
  }, []);

  // 取消同步滚动
  const cancelScrollSync = useCallback(() => {
    if (syncAnimationFrameRef.current !== null) {
      cancelAnimationFrame(syncAnimationFrameRef.current);
      syncAnimationFrameRef.current = null;
    }
    syncTargetScrollTopRef.current = null;
    isSyncingScroll.current = false;
  }, []);

  // 动画同步滚动
  const animateSyncedScroll = useCallback((scrollDom: HTMLElement, targetScrollTop: number) => {
    const maxScrollTop = Math.max(0, scrollDom.scrollHeight - scrollDom.clientHeight);
    const clampedTarget = Math.min(Math.max(targetScrollTop, 0), maxScrollTop);
    syncTargetScrollTopRef.current = clampedTarget;

    if (syncAnimationFrameRef.current !== null) return;

    isSyncingScroll.current = true;

    syncAnimationFrameRef.current = requestAnimationFrame(() => {
      syncAnimationFrameRef.current = null;
      const currentView = viewRef.current;
      const target = syncTargetScrollTopRef.current;

      if (!currentView || currentView.scrollDOM !== scrollDom || target === null) {
        syncTargetScrollTopRef.current = null;
        isSyncingScroll.current = false;
        return;
      }

      scrollDom.scrollTop = target;
      syncTargetScrollTopRef.current = null;
      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    });
  }, []);

  // 同步到指定百分比
  const syncScrollTo = useCallback((percentage: number) => {
    const view = viewRef.current;
    if (!view) return;

    const scrollDom = view.scrollDOM;
    const maxScrollTop = scrollDom.scrollHeight - scrollDom.clientHeight;
    if (maxScrollTop <= 0) return;

    const targetScrollTop = maxScrollTop * percentage;
    if (Math.abs(scrollDom.scrollTop - targetScrollTop) <= SCROLL_THRESHOLD) return;
    animateSyncedScroll(scrollDom, targetScrollTop);
  }, [animateSyncedScroll]);

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

  return {
    registerView,
    cancelScrollSync,
    syncScrollTo,
    handleScroll,
  };
}
