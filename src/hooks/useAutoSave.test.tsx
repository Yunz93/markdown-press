// @vitest-environment happy-dom

import React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../store/appStore";
import { useAutoSave } from "./useAutoSave";

const { writeFile } = vi.hoisted(() => ({
  writeFile: vi.fn(async () => {}),
}));

vi.mock("../types/filesystem", () => ({
  getFileSystem: vi.fn(async () => ({ writeFile })),
}));

const NOTE_ID = "/vault/note.md";

function setupStore(autoSaveInterval: number) {
  const base = useAppStore.getState();
  useAppStore.setState({
    files: [],
    openTabs: [NOTE_ID],
    activeTabId: NOTE_ID,
    currentFilePath: NOTE_ID,
    fileContents: { [NOTE_ID]: "original" },
    lastSavedContent: { [NOTE_ID]: "original" },
    settings: { ...base.settings, autoSaveInterval },
  });
}

function Harness({ debounceMs }: { debounceMs?: number }) {
  useAutoSave({ debounceMs, enabled: true });
  return null;
}

function setupDocumentWithUpdateTime() {
  const doc = [
    "---",
    "date modified: 2020-01-01 00:00:00",
    "---",
    "",
    "Body",
  ].join("\n");

  const base = useAppStore.getState();
  useAppStore.setState({
    files: [],
    openTabs: [NOTE_ID],
    activeTabId: NOTE_ID,
    currentFilePath: NOTE_ID,
    fileContents: { [NOTE_ID]: doc },
    lastSavedContent: { [NOTE_ID]: doc },
    isSaving: false,
    settings: { ...base.settings, autoSaveInterval: 60_000 },
  });

  return doc;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  writeFile.mockClear();
  writeFile.mockImplementation(async () => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  useAppStore.setState({
    files: [],
    currentFilePath: null,
    openTabs: [],
    activeTabId: null,
    fileContents: {},
    lastSavedContent: {},
    isSaving: false,
  });
});

describe("useAutoSave", () => {
  it("auto-saves using the configured autoSaveInterval when no debounce override is provided", async () => {
    setupStore(5000);

    render(<Harness />);

    act(() => {
      useAppStore.getState().updateTabContent(NOTE_ID, "edited");
    });

    // A short delay (the previously hardcoded 500ms) must NOT trigger a save
    // when the user has configured a longer interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(writeFile).not.toHaveBeenCalled();

    // Once the configured interval elapses, the save runs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(writeFile).toHaveBeenCalledWith(NOTE_ID, "edited");
  });

  it("honors an explicit debounceMs override", async () => {
    setupStore(60000);

    render(<Harness debounceMs={300} />);

    act(() => {
      useAppStore.getState().updateTabContent(NOTE_ID, "edited");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(writeFile).toHaveBeenCalledWith(NOTE_ID, "edited");
  });

  it("manual save with update-time refresh does not loop or stay in saving state", async () => {
    vi.setSystemTime(new Date("2026-05-11T12:34:56.000Z"));

    setupDocumentWithUpdateTime();
    let saveHook: ReturnType<typeof useAutoSave>;

    function SaveHarness() {
      saveHook = useAutoSave({ debounceMs: 60_000, enabled: true });
      return null;
    }

    render(<SaveHarness />);

    writeFile.mockClear();

    await act(async () => {
      await saveHook!.forceSave(undefined, { trigger: "manual" });
    });

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().isSaving).toBe(false);

    const savedContent = (
      writeFile.mock.calls[0] as unknown as [string, string]
    )[1];
    expect(savedContent).toMatch(
      /date modified: "\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}"/,
    );
    expect(useAppStore.getState().fileContents[NOTE_ID]).toBe(savedContent);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().isSaving).toBe(false);
  });

  it("queues a single auto follow-up save when the user edits during manual save", async () => {
    setupStore(60_000);
    let saveHook: ReturnType<typeof useAutoSave>;

    function SaveHarness() {
      saveHook = useAutoSave({ debounceMs: 60_000, enabled: true });
      return null;
    }

    render(<SaveHarness />);

    act(() => {
      useAppStore.getState().updateTabContent(NOTE_ID, "pending save");
    });

    let resolveWrite: (() => void) | undefined;
    writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );

    await act(async () => {
      const pending = saveHook!.forceSave(undefined, { trigger: "manual" });
      await Promise.resolve();
      act(() => {
        useAppStore.getState().updateTabContent(NOTE_ID, "edited during save");
      });
      resolveWrite?.();
      await pending;
    });

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenNthCalledWith(1, NOTE_ID, "pending save");
    expect(writeFile).toHaveBeenNthCalledWith(2, NOTE_ID, "edited during save");
    expect(useAppStore.getState().isSaving).toBe(false);
  });

  it("auto-saves the previous tab when switching away before the debounce", async () => {
    const NOTE_B = "/vault/other.md";
    const base = useAppStore.getState();

    useAppStore.setState({
      files: [
        {
          id: NOTE_ID,
          name: "note.md",
          path: NOTE_ID,
          type: "file",
        },
        {
          id: NOTE_B,
          name: "other.md",
          path: NOTE_B,
          type: "file",
        },
      ],
      openTabs: [NOTE_ID, NOTE_B],
      activeTabId: NOTE_ID,
      currentFilePath: NOTE_ID,
      fileContents: {
        [NOTE_ID]: "edited locally",
        [NOTE_B]: "other",
      },
      lastSavedContent: {
        [NOTE_ID]: "original",
        [NOTE_B]: "other",
      },
      settings: { ...base.settings, autoSaveInterval: 60_000 },
    });

    render(<Harness debounceMs={60_000} />);

    writeFile.mockClear();

    await act(async () => {
      useAppStore.getState().setActiveTab(NOTE_B);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(writeFile).toHaveBeenCalledWith(NOTE_ID, "edited locally");
    expect(useAppStore.getState().hasUnsavedChanges(NOTE_ID)).toBe(false);
  });

  it("auto-saves after switching back to a tab with unsaved edits", async () => {
    const NOTE_B = "/vault/other.md";
    const base = useAppStore.getState();

    useAppStore.setState({
      files: [
        {
          id: NOTE_ID,
          name: "note.md",
          path: NOTE_ID,
          type: "file",
        },
        {
          id: NOTE_B,
          name: "other.md",
          path: NOTE_B,
          type: "file",
        },
      ],
      openTabs: [NOTE_ID, NOTE_B],
      activeTabId: NOTE_ID,
      currentFilePath: NOTE_ID,
      fileContents: {
        [NOTE_ID]: "original",
        [NOTE_B]: "other",
      },
      lastSavedContent: {
        [NOTE_ID]: "original",
        [NOTE_B]: "other",
      },
      settings: { ...base.settings, autoSaveInterval: 1000 },
    });

    render(<Harness debounceMs={1000} />);

    // Switch away (no dirty flush), then edit A while it is inactive via store,
    // then switch back so the active-tab debounce path saves it.
    act(() => {
      useAppStore.getState().setActiveTab(NOTE_B);
    });

    act(() => {
      useAppStore.getState().updateTabContent(NOTE_ID, "edited while inactive");
      useAppStore.getState().setActiveTab(NOTE_ID);
    });

    writeFile.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(writeFile).toHaveBeenCalledWith(NOTE_ID, "edited while inactive");
  });

  it("marks the original tab saved when an in-flight save completes after switching tabs", async () => {
    const NOTE_B = "/vault/other.md";
    const base = useAppStore.getState();

    useAppStore.setState({
      files: [
        {
          id: NOTE_ID,
          name: "note.md",
          path: NOTE_ID,
          type: "file",
        },
        {
          id: NOTE_B,
          name: "other.md",
          path: NOTE_B,
          type: "file",
        },
      ],
      openTabs: [NOTE_ID, NOTE_B],
      activeTabId: NOTE_ID,
      currentFilePath: NOTE_ID,
      fileContents: {
        [NOTE_ID]: "tab-a",
        [NOTE_B]: "tab-b",
      },
      lastSavedContent: {
        [NOTE_ID]: "tab-a",
        [NOTE_B]: "tab-b",
      },
      settings: { ...base.settings, autoSaveInterval: 60_000 },
    });

    let saveHook: ReturnType<typeof useAutoSave>;
    function SaveHarness() {
      saveHook = useAutoSave({ debounceMs: 60_000, enabled: true });
      return null;
    }

    render(<SaveHarness />);

    let resolveWrite: (() => void) | undefined;
    writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );

    act(() => {
      useAppStore.getState().updateTabContent(NOTE_ID, "tab-a-edited");
    });

    const pendingSave = act(async () => {
      const promise = saveHook!.forceSave(undefined, { trigger: "manual" });
      await Promise.resolve();
      act(() => {
        useAppStore.getState().setActiveTab(NOTE_B);
        useAppStore.getState().setCurrentFilePath(NOTE_B);
      });
      resolveWrite?.();
      await promise;
    });

    await pendingSave;

    expect(useAppStore.getState().lastSavedContent[NOTE_B]).toBe("tab-b");
    expect(useAppStore.getState().fileContents[NOTE_B]).toBe("tab-b");
    expect(useAppStore.getState().lastSavedContent[NOTE_ID]).toBe(
      "tab-a-edited",
    );
    expect(useAppStore.getState().fileContents[NOTE_ID]).toBe("tab-a-edited");
  });

  it("drains a queued manual save after an in-flight save completes", async () => {
    setupStore(60_000);
    let saveHook: ReturnType<typeof useAutoSave>;

    function SaveHarness() {
      saveHook = useAutoSave({ debounceMs: 60_000, enabled: true });
      return null;
    }

    render(<SaveHarness />);

    act(() => {
      useAppStore.getState().updateTabContent(NOTE_ID, "first");
    });

    let resolveFirst: (() => void) | undefined;
    writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const firstSave = saveHook!.forceSave(undefined, { trigger: "manual" });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useAppStore.getState().updateTabContent(NOTE_ID, "second");
    });

    const secondSave = saveHook!.forceSave(undefined, { trigger: "manual" });

    await act(async () => {
      resolveFirst?.();
      await firstSave;
      await secondSave;
    });

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenNthCalledWith(1, NOTE_ID, "first");
    expect(writeFile).toHaveBeenNthCalledWith(2, NOTE_ID, "second");
  });

  it("skips auto-save while tab content is still loading", async () => {
    const base = useAppStore.getState();
    useAppStore.setState({
      files: [],
      openTabs: [NOTE_ID],
      activeTabId: NOTE_ID,
      currentFilePath: NOTE_ID,
      fileContents: {},
      lastSavedContent: {},
      settings: { ...base.settings, autoSaveInterval: 300 },
    });

    render(<Harness debounceMs={300} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(writeFile).not.toHaveBeenCalled();
  });
});
