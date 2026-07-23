/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { LAYOUT } from "../../config/layout";
import { useSettingsModalLayout } from "./useSettingsModalLayout";

describe("useSettingsModalLayout", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts from the default modal and nav sizes", () => {
    const { result } = renderHook(() => useSettingsModalLayout());

    expect(result.current.width).toBe(LAYOUT.SETTINGS_MODAL.DEFAULT_WIDTH);
    expect(result.current.height).toBe(LAYOUT.SETTINGS_MODAL.DEFAULT_HEIGHT);
    expect(result.current.navWidth).toBe(
      LAYOUT.SETTINGS_MODAL.NAV_DEFAULT_WIDTH,
    );
  });

  it("persists modal size and nav width to localStorage", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 900,
    });

    const { result } = renderHook(() => useSettingsModalLayout());

    act(() => {
      result.current.updateSize(1000, 700);
      result.current.updateNavWidth(260);
      result.current.updateMetadataKeyWidth(140);
      result.current.updateMetadataValueWidth(200);
    });

    expect(result.current.width).toBe(1000);
    expect(result.current.height).toBe(700);
    expect(result.current.navWidth).toBe(260);
    expect(
      window.localStorage.getItem(LAYOUT.STORAGE_KEYS.SETTINGS_MODAL_WIDTH),
    ).toBe("1000");
    expect(
      window.localStorage.getItem(LAYOUT.STORAGE_KEYS.SETTINGS_NAV_WIDTH),
    ).toBe("260");
    expect(
      window.localStorage.getItem(
        LAYOUT.STORAGE_KEYS.SETTINGS_METADATA_KEY_WIDTH,
      ),
    ).toBe("140");
  });

  it("clamps oversized values", () => {
    const { result } = renderHook(() => useSettingsModalLayout());

    act(() => {
      result.current.updateSize(9999, 9999);
      result.current.updateNavWidth(999);
    });

    expect(result.current.width).toBeLessThanOrEqual(
      LAYOUT.SETTINGS_MODAL.MAX_WIDTH,
    );
    expect(result.current.height).toBeLessThanOrEqual(
      LAYOUT.SETTINGS_MODAL.MAX_HEIGHT,
    );
    expect(result.current.navWidth).toBe(LAYOUT.SETTINGS_MODAL.NAV_MAX_WIDTH);
  });
});
