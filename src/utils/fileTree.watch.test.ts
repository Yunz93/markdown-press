import { describe, expect, it } from "vitest";
import type { FileNode } from "../types";
import { buildFileTreeSignature, collectRemovedOpenTabIds } from "./fileTree";

const folder: FileNode = {
  id: "/vault/docs",
  name: "docs",
  path: "/vault/docs",
  type: "folder",
  children: [
    {
      id: "/vault/docs/guide.md",
      name: "guide.md",
      path: "/vault/docs/guide.md",
      type: "file",
    },
  ],
};

const note: FileNode = {
  id: "/vault/note.md",
  name: "note.md",
  path: "/vault/note.md",
  type: "file",
};

describe("buildFileTreeSignature", () => {
  it("changes when a file is removed from the tree", () => {
    const before = buildFileTreeSignature([folder, note]);
    const after = buildFileTreeSignature([folder]);

    expect(before).not.toBe(after);
  });
});

describe("collectRemovedOpenTabIds", () => {
  it("returns open tabs whose files disappeared from the next tree", () => {
    const removed = collectRemovedOpenTabIds(
      [folder, note],
      [],
      [note.id, folder.id, "/vault/docs/guide.md"],
    );

    expect(removed).toEqual([note.id, "/vault/docs/guide.md"]);
  });
});
