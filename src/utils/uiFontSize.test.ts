import { describe, expect, it } from "vitest";
import {
  clampUiFontSize,
  getUiFontSizeZoomDelta,
  isUiFontSizeResetShortcut,
  stepUiFontSize,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
} from "./uiFontSize";

function createKeyboardEvent(
  init: Partial<KeyboardEvent> & Pick<KeyboardEvent, "key" | "code">,
): KeyboardEvent {
  return {
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as KeyboardEvent;
}

describe("uiFontSize utils", () => {
  it("clamps ui font size to the supported range", () => {
    expect(clampUiFontSize(10)).toBe(UI_FONT_SIZE_MIN);
    expect(clampUiFontSize(16)).toBe(16);
    expect(clampUiFontSize(24)).toBe(UI_FONT_SIZE_MAX);
    expect(clampUiFontSize(Number.NaN)).toBe(UI_FONT_SIZE_MIN);
  });

  it("steps ui font size within bounds", () => {
    expect(stepUiFontSize(16, 1)).toBe(17);
    expect(stepUiFontSize(16, -1)).toBe(15);
    expect(stepUiFontSize(UI_FONT_SIZE_MIN, -1)).toBe(UI_FONT_SIZE_MIN);
    expect(stepUiFontSize(UI_FONT_SIZE_MAX, 1)).toBe(UI_FONT_SIZE_MAX);
  });

  it("detects zoom in shortcuts with primary modifier", () => {
    expect(
      getUiFontSizeZoomDelta(
        createKeyboardEvent({
          key: "+",
          code: "Equal",
          metaKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe(1);
    expect(
      getUiFontSizeZoomDelta(
        createKeyboardEvent({ key: "=", code: "Equal", metaKey: true }),
      ),
    ).toBe(1);
    expect(
      getUiFontSizeZoomDelta(
        createKeyboardEvent({ key: "+", code: "NumpadAdd", ctrlKey: true }),
      ),
    ).toBe(1);
  });

  it("detects zoom out shortcuts with primary modifier", () => {
    expect(
      getUiFontSizeZoomDelta(
        createKeyboardEvent({ key: "-", code: "Minus", metaKey: true }),
      ),
    ).toBe(-1);
    expect(
      getUiFontSizeZoomDelta(
        createKeyboardEvent({
          key: "-",
          code: "NumpadSubtract",
          ctrlKey: true,
        }),
      ),
    ).toBe(-1);
  });

  it("detects zoom reset shortcut with primary modifier and shift", () => {
    expect(
      isUiFontSizeResetShortcut(
        createKeyboardEvent({
          key: "0",
          code: "Digit0",
          metaKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe(true);
    expect(
      isUiFontSizeResetShortcut(
        createKeyboardEvent({ key: "0", code: "Digit0", metaKey: true }),
      ),
    ).toBe(false);
  });

  it("ignores zoom shortcuts without modifier or on repeat", () => {
    expect(
      getUiFontSizeZoomDelta(createKeyboardEvent({ key: "-", code: "Minus" })),
    ).toBe(0);
    expect(
      getUiFontSizeZoomDelta(
        createKeyboardEvent({
          key: "-",
          code: "Minus",
          metaKey: true,
          repeat: true,
        }),
      ),
    ).toBe(0);
  });
});
