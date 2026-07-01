// @vitest-environment happy-dom

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../store/appStore";
import type { FileNode } from "../types";
import type { DirectoryWatchEvent } from "../types/filesystem";
import { useKnowledgeBaseWatch } from "./useKnowledgeBaseWatch";

const note: FileNode = {
  id: "/vault/note.md",
  name: "note.md",
  path: "/vault/note.md",
  type: "file",
};

const otherNote: FileNode = {
  id: "/vault/other.md",
  name: "other.md",
  path: "/vault/other.md",
  type: "file",
};

afterEach(() => {
  vi.restoreAllMocks();
  useAppStore.setState({
    files: [],
    rootFolderPath: null,
    openTabs: [],
    activeTabId: null,
    fileContents: {},
    lastSavedContent: {},
  });
});

describe("useKnowledgeBaseWatch", () => {
  it("syncs the file tree and closes tabs when saved files are removed on disk", async () => {
    const watched = {
      callback: null as ((event: DirectoryWatchEvent) => void) | null,
    };
    const showNotification = vi.fn();
    const watchDirectory = vi.fn(
      async (
        _dirPath: string,
        callback: (event: DirectoryWatchEvent) => void,
      ) => {
        watched.callback = callback;
        return vi.fn();
      },
    );

    useAppStore.setState({
      files: [note, otherNote],
      rootFolderPath: "/vault",
      openTabs: [note.id, otherNote.id],
      activeTabId: note.id,
      fileContents: {
        [note.id]: "# Note\n",
        [otherNote.id]: "# Other\n",
      },
      lastSavedContent: {
        [note.id]: "# Note\n",
        [otherNote.id]: "# Other\n",
      },
    });

    function Harness() {
      useKnowledgeBaseWatch({
        rootFolderPath: "/vault",
        watchDirectory,
        showNotification,
        t: (key) => key,
      });

      return null;
    }

    render(React.createElement(Harness));

    await waitFor(() => {
      expect(watched.callback).not.toBeNull();
    });

    const emitDirectoryEvent = watched.callback as (
      event: DirectoryWatchEvent,
    ) => void;
    emitDirectoryEvent({ type: "changed", tree: [otherNote] });

    await waitFor(() => {
      expect(useAppStore.getState().files).toEqual([otherNote]);
      expect(useAppStore.getState().openTabs).toEqual([otherNote.id]);
      expect(showNotification).toHaveBeenCalledWith(
        "notifications_fileDeletedOnDisk",
        "error",
      );
    });
  });

  it("keeps tabs with unsaved changes when files are removed on disk", async () => {
    const watched = {
      callback: null as ((event: DirectoryWatchEvent) => void) | null,
    };
    const showNotification = vi.fn();
    const watchDirectory = vi.fn(
      async (
        _dirPath: string,
        callback: (event: DirectoryWatchEvent) => void,
      ) => {
        watched.callback = callback;
        return vi.fn();
      },
    );

    useAppStore.setState({
      files: [note, otherNote],
      rootFolderPath: "/vault",
      openTabs: [note.id, otherNote.id],
      activeTabId: note.id,
      fileContents: {
        [note.id]: "# Note\n",
        [otherNote.id]: "# Other\nunsaved",
      },
      lastSavedContent: {
        [note.id]: "# Note\n",
        [otherNote.id]: "# Other\n",
      },
    });

    function Harness() {
      useKnowledgeBaseWatch({
        rootFolderPath: "/vault",
        watchDirectory,
        showNotification,
        t: (key) => key,
      });

      return null;
    }

    render(React.createElement(Harness));

    await waitFor(() => {
      expect(watched.callback).not.toBeNull();
    });

    const emitDirectoryEvent = watched.callback as (
      event: DirectoryWatchEvent,
    ) => void;
    emitDirectoryEvent({ type: "changed", tree: [note] });

    await waitFor(() => {
      expect(useAppStore.getState().openTabs).toContain(otherNote.id);
      expect(showNotification).toHaveBeenCalledWith(
        "notifications_fileDeletedOnDiskUnsaved",
        "error",
      );
    });
  });

  it("does not leave a watcher active after unmounting during async setup", async () => {
    let resolveWatch: (unwatch: () => void) => void = () => {};
    const unwatch = vi.fn();
    const watchDirectory = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveWatch = resolve;
        }),
    );

    function Harness() {
      useKnowledgeBaseWatch({
        rootFolderPath: "/vault",
        watchDirectory,
        showNotification: vi.fn(),
        t: (key) => key,
      });

      return null;
    }

    const { unmount } = render(React.createElement(Harness));
    unmount();

    resolveWatch(unwatch);

    await waitFor(() => {
      expect(unwatch).toHaveBeenCalled();
    });
  });
});
