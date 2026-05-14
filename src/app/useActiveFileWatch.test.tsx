// @vitest-environment happy-dom

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/appStore';
import type { FileNode } from '../types';
import type { FileWatchEvent } from '../types/filesystem';
import { useActiveFileWatch } from './useActiveFileWatch';

const note: FileNode = {
  id: '/vault/note.md',
  name: 'note.md',
  path: '/vault/note.md',
  type: 'file',
};

afterEach(() => {
  vi.restoreAllMocks();
  useAppStore.setState({
    files: [],
    currentFilePath: null,
    openTabs: [],
    activeTabId: null,
    fileContents: {},
    lastSavedContent: {},
  });
});

describe('useActiveFileWatch', () => {
  it('reloads external disk changes without marking them as local unsaved edits', async () => {
    const watched = {
      callback: null as ((event: FileWatchEvent | null) => void) | null,
    };
    const readFile = vi.fn(async () => '# Changed outside\n');
    const showNotification = vi.fn();
    const watchFile = vi.fn(async (_path: string, callback: (event: FileWatchEvent | null) => void) => {
      watched.callback = callback;
      return vi.fn();
    });

    useAppStore.setState({
      files: [note],
      currentFilePath: note.path,
      openTabs: [note.id],
      activeTabId: note.id,
      fileContents: { [note.id]: '# Original\n' },
      lastSavedContent: { [note.id]: '# Original\n' },
    });

    function Harness() {
      useActiveFileWatch({
        activeTabId: note.id,
        currentFilePath: note.path,
        files: [note],
        readFile,
        setCurrentFilePath: useAppStore.getState().setCurrentFilePath,
        showNotification,
        watchFile,
        t: (key) => key,
      });

      return null;
    }

    render(React.createElement(Harness));

    await waitFor(() => {
      expect(watched.callback).not.toBeNull();
    });

    const emitWatchedEvent = watched.callback as (event: FileWatchEvent | null) => void;
    emitWatchedEvent({ path: note.path, type: 'modified' });

    await waitFor(() => {
      expect(useAppStore.getState().fileContents[note.id]).toBe('# Changed outside\n');
      expect(useAppStore.getState().lastSavedContent[note.id]).toBe('# Changed outside\n');
      expect(useAppStore.getState().hasUnsavedChanges(note.id)).toBe(false);
    });
  });
});
