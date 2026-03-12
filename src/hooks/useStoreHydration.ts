import { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';

interface PersistAPI {
  hasHydrated: () => boolean;
  onFinishHydration: (fn: () => void) => () => void;
}

function getPersistAPI(): PersistAPI | null {
  return (useAppStore as unknown as { persist?: PersistAPI }).persist ?? null;
}

/**
 * Tracks whether the zustand persist store has finished hydrating from localStorage.
 * Replaces the raw `(useAppStore as any).persist` pattern in App.tsx.
 */
export function useStoreHydration(): boolean {
  const [hydrated, setHydrated] = useState(() => {
    const api = getPersistAPI();
    return api ? api.hasHydrated() : true;
  });

  useEffect(() => {
    const api = getPersistAPI();
    if (!api) return;

    setHydrated(api.hasHydrated());
    const unsubscribe = api.onFinishHydration(() => setHydrated(true));
    return () => unsubscribe?.();
  }, []);

  return hydrated;
}
