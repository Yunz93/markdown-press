import { useEffect, useState } from 'react';
import { isTauriEnvironment } from '../types/filesystem';

interface UseExternalFileOpenOptions {
  settingsHydrated: boolean;
  openFilePath: (path: string, options?: { silentSuccess?: boolean; suppressErrors?: boolean }) => Promise<string | null>;
}

interface ExternalFileOpenState {
  hasCheckedExternalFiles: boolean;
  hasHandledExternalFile: boolean;
}

function normalizeOpenedFilePayload(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths));
}

export function useExternalFileOpen({
  settingsHydrated,
  openFilePath,
}: UseExternalFileOpenOptions): ExternalFileOpenState {
  const [state, setState] = useState<ExternalFileOpenState>({
    hasCheckedExternalFiles: false,
    hasHandledExternalFile: false,
  });

  useEffect(() => {
    if (!settingsHydrated) return;

    if (!isTauriEnvironment()) {
      setState((current) => ({ ...current, hasCheckedExternalFiles: true }));
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    const openPaths = async (paths: string[]): Promise<boolean> => {
      let openedAny = false;

      for (const path of uniquePaths(paths)) {
        const openedPath = await openFilePath(path, {
          silentSuccess: true,
          suppressErrors: false,
        });
        openedAny = Boolean(openedPath) || openedAny;
      }

      if (openedAny && !cancelled) {
        setState((current) => ({ ...current, hasHandledExternalFile: true }));
      }

      return openedAny;
    };

    void (async () => {
      try {
        const [{ listen }, { invoke }] = await Promise.all([
          import('@tauri-apps/api/event'),
          import('@tauri-apps/api/core'),
        ]);

        unlisten = await listen('opened-files', (event) => {
          void openPaths(normalizeOpenedFilePayload(event.payload));
        });

        const initialPaths = normalizeOpenedFilePayload(await invoke('take_opened_files'));
        await openPaths(initialPaths);
      } catch (error) {
        console.warn('Failed to initialize external file open handling:', error);
      } finally {
        if (!cancelled) {
          setState((current) => ({ ...current, hasCheckedExternalFiles: true }));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [settingsHydrated, openFilePath]);

  return state;
}
