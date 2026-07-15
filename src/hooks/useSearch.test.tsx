// @vitest-environment happy-dom

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../store/appStore";
import { useSearch } from "./useSearch";

const NOTE_ID = "/vault/search.md";

function setupStore(content: string) {
  const base = useAppStore.getState();
  useAppStore.setState({
    files: [],
    openTabs: [NOTE_ID],
    activeTabId: NOTE_ID,
    currentFilePath: NOTE_ID,
    fileContents: { [NOTE_ID]: content },
    lastSavedContent: { [NOTE_ID]: content },
    settings: base.settings,
  });
}

describe("useSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
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

  it("tracks debounced search progress and exposes matches", async () => {
    setupStore("alpha beta alpha");

    const { result } = renderHook(() => useSearch());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(result.current.isSearching).toBe(false);

    act(() => {
      result.current.setQuery("alpha");
    });

    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.results).toHaveLength(2);
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.resultsTruncated).toBe(false);
  });
});
