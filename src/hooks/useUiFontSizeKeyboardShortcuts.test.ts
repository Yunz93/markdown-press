// @vitest-environment happy-dom

import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAppStore } from "../store/appStore";
import { defaultSettings } from "../store/uiStore";
import { useUiFontSizeKeyboardShortcuts } from "./useUiFontSizeKeyboardShortcuts";

function Harness() {
  useUiFontSizeKeyboardShortcuts();
  return React.createElement("div", { tabIndex: 0 });
}

describe("useUiFontSizeKeyboardShortcuts", () => {
  afterEach(() => {
    cleanup();
    useAppStore.setState({
      settings: defaultSettings,
      uiZoomHintPercent: null,
    });
  });

  it("increases ui font size on Cmd/Ctrl + plus", () => {
    render(React.createElement(Harness));

    fireEvent.keyDown(window, {
      key: "+",
      code: "Equal",
      metaKey: true,
      shiftKey: true,
    });

    expect(useAppStore.getState().settings.uiFontSize).toBe(17);
    expect(useAppStore.getState().uiZoomHintPercent).toBe(106);
  });

  it("decreases ui font size on Cmd/Ctrl + minus", () => {
    useAppStore.setState({
      settings: {
        ...defaultSettings,
        uiFontSize: 18,
      },
    });

    render(React.createElement(Harness));

    fireEvent.keyDown(window, {
      key: "-",
      code: "Minus",
      metaKey: true,
    });

    expect(useAppStore.getState().settings.uiFontSize).toBe(17);
    expect(useAppStore.getState().uiZoomHintPercent).toBe(106);
  });

  it("resets ui font size on Cmd/Ctrl+Shift+0", () => {
    useAppStore.setState({
      settings: {
        ...defaultSettings,
        uiFontSize: 20,
      },
    });

    render(React.createElement(Harness));

    fireEvent.keyDown(window, {
      key: "0",
      code: "Digit0",
      metaKey: true,
      shiftKey: true,
    });

    expect(useAppStore.getState().settings.uiFontSize).toBe(
      defaultSettings.uiFontSize,
    );
  });

  it("clamps ui font size at the configured bounds", () => {
    useAppStore.setState({
      settings: {
        ...defaultSettings,
        uiFontSize: 12,
      },
    });

    render(React.createElement(Harness));

    fireEvent.keyDown(window, {
      key: "-",
      code: "Minus",
      metaKey: true,
    });

    expect(useAppStore.getState().settings.uiFontSize).toBe(12);
    expect(useAppStore.getState().uiZoomHintPercent).toBeNull();
  });
});
