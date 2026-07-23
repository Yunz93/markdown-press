/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  bindLivePreviewImageMeasure,
  scheduleLivePreviewMeasure,
} from "./shared";

describe("live preview geometry remasure", () => {
  const views: EditorView[] = [];

  afterEach(() => {
    while (views.length) {
      const view = views.pop();
      view?.destroy();
      view?.dom.parentElement?.remove();
    }
    vi.restoreAllMocks();
  });

  it("scheduleLivePreviewMeasure calls view.requestMeasure when connected", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: "hello" }),
      parent,
    });
    views.push(view);
    const spy = vi.spyOn(view, "requestMeasure");
    scheduleLivePreviewMeasure(view);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("bindLivePreviewImageMeasure remasures on load", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: "hello" }),
      parent,
    });
    views.push(view);
    const spy = vi.spyOn(view, "requestMeasure");

    const img = document.createElement("img");
    Object.defineProperty(img, "complete", {
      configurable: true,
      get: () => false,
    });
    bindLivePreviewImageMeasure(view, img);
    expect(spy).not.toHaveBeenCalled();

    img.dispatchEvent(new Event("load"));
    expect(spy).toHaveBeenCalled();
  });

  it("bindLivePreviewImageMeasure remasures for already-complete images", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: "hello" }),
      parent,
    });
    views.push(view);
    const spy = vi.spyOn(view, "requestMeasure");

    const img = document.createElement("img");
    Object.defineProperty(img, "complete", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(img, "naturalHeight", {
      configurable: true,
      get: () => 120,
    });
    bindLivePreviewImageMeasure(view, img);
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
    expect(spy).toHaveBeenCalled();
  });
});
