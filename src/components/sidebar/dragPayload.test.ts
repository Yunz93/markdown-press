import { describe, expect, it } from "vitest";
import type React from "react";
import {
  DRAG_DATA_TYPE,
  extractDraggedNodeId,
  hasDragPayload,
  setDragPayload,
} from "./dragPayload";

function createDragEvent(): {
  event: React.DragEvent;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const dataTransfer = {
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
    getData: (type: string) => store.get(type) ?? "",
    get types() {
      return Array.from(store.keys());
    },
    effectAllowed: "none",
    dropEffect: "none",
  };
  return { event: { dataTransfer } as unknown as React.DragEvent, store };
}

describe("sidebar drag payload", () => {
  it("writes and reads back the node id through the shared MIME type", () => {
    const { event } = createDragEvent();
    setDragPayload(event, "notes/todo.md", "file");

    expect(hasDragPayload(event)).toBe(true);
    expect(extractDraggedNodeId(event)).toBe("notes/todo.md");
  });

  it("falls back to application/json payloads from older writers", () => {
    const { event, store } = createDragEvent();
    store.set(
      "application/json",
      JSON.stringify({ id: "folder/a", type: "folder" }),
    );

    expect(hasDragPayload(event)).toBe(true);
    expect(extractDraggedNodeId(event)).toBe("folder/a");
  });

  it("falls back to text/plain payloads", () => {
    const { event, store } = createDragEvent();
    store.set("text/plain", "plain-id");

    expect(extractDraggedNodeId(event)).toBe("plain-id");
  });

  it("reports no payload for unrelated drags", () => {
    const { event, store } = createDragEvent();
    store.set("text/uri-list", "https://example.com");

    expect(hasDragPayload(event)).toBe(false);
    expect(extractDraggedNodeId(event)).toBeNull();
  });

  it("keeps the custom MIME type as the primary payload", () => {
    const { event, store } = createDragEvent();
    setDragPayload(event, "primary-id", "file");
    store.set("text/plain", "stale-id");

    expect(store.get(DRAG_DATA_TYPE)).toBe("primary-id");
    expect(extractDraggedNodeId(event)).toBe("primary-id");
  });
});
