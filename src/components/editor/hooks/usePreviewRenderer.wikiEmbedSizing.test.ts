import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("usePreviewRenderer wiki embed sizing", () => {
  it("stores bare numbers in data-wiki-embed-w/h for typed CSS attr(... px)", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "usePreviewRenderer.ts"),
      "utf8",
    );

    expect(source).toMatch(
      /setAttribute\(["']data-wiki-embed-w["'],\s*String\(embedWidth\)\)/,
    );
    expect(source).toMatch(
      /setAttribute\(["']data-wiki-embed-h["'],\s*String\(embedHeight\)\)/,
    );
    expect(source).not.toMatch(
      /setAttribute\(['"]data-wiki-embed-w['"],\s*`\$\{embedWidth\}px`\)/,
    );
    expect(source).not.toMatch(
      /setAttribute\(['"]data-wiki-embed-h['"],\s*`\$\{embedHeight\}px`\)/,
    );
  });
});
