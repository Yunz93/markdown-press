import { describe, expect, it } from "vitest";
import { buildAskVaultPrompt } from "../ai/prompts";
import { estimateLineOffset } from "./askVaultService";

describe("askVault prompts", () => {
  it("includes numbered excerpts and question", () => {
    const prompt = buildAskVaultPrompt("What is RAG?", [
      {
        index: 1,
        path: "notes/rag.md",
        titlePath: ["RAG"],
        startLine: 1,
        endLine: 4,
        text: "RAG retrieves documents before generation.",
      },
    ]);
    expect(prompt).toContain("What is RAG?");
    expect(prompt).toContain("[1] notes/rag.md");
    expect(prompt).toContain("citationIndexes");
  });
});

describe("estimateLineOffset", () => {
  it("maps 1-based lines to offsets", () => {
    const content = "a\nbc\ndef";
    expect(estimateLineOffset(content, 1)).toBe(0);
    expect(estimateLineOffset(content, 2)).toBe(2);
    expect(estimateLineOffset(content, 3)).toBe(5);
  });
});
