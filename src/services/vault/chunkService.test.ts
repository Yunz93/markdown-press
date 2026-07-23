import { describe, expect, it } from "vitest";
import { chunkMarkdownFile, diffChunks, hashText } from "./chunkService";

describe("chunkService", () => {
  it("chunks by headings and keeps anchors", () => {
    const content = `---
title: Demo
---

# Intro

Intro paragraph with enough characters to keep.

## Details

Details paragraph with enough characters to keep as well.
`;
    const chunks = chunkMarkdownFile({
      path: "/vault/Demo.md",
      vaultRoot: "/vault",
      content,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]?.titlePath[0]).toBe("Demo");
    expect(chunks.some((chunk) => chunk.headingAnchor === "intro")).toBe(true);
    expect(chunks.every((chunk) => chunk.contentHash.length > 0)).toBe(true);
  });

  it("falls back to window chunks without headings", () => {
    const body = "字".repeat(1200);
    const chunks = chunkMarkdownFile({
      path: "/vault/plain.md",
      vaultRoot: "/vault",
      content: body,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.relPath).toBe("plain.md");
  });

  it("diffs chunks by content hash", () => {
    const a = chunkMarkdownFile({
      path: "/vault/a.md",
      vaultRoot: "/vault",
      content: "# A\n\nhello world content for chunking tests here.\n",
    });
    const b = chunkMarkdownFile({
      path: "/vault/a.md",
      vaultRoot: "/vault",
      content: "# A\n\nhello world content changed for chunking tests.\n",
    });
    const diff = diffChunks(a, b);
    expect(diff.upsert.length).toBeGreaterThan(0);
    expect(hashText("x")).not.toBe(hashText("y"));
  });
});
