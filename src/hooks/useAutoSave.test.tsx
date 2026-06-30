// @vitest-environment happy-dom

import React from "react";
import { render, act } from "@testing-library/react";
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

beforeEach(() => {
  vi.useFakeTimers();
  writeFile.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  useAppStore.setState({
    files: [],
    currentFilePath: null,
    openTabs: [],
    activeTabId: null,
    fileContents: {},
    lastSavedContent: {},
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
});
