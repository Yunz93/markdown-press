/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";
import { exportToHtml } from "./htmlExport";

describe("exportToHtml", () => {
  it("forwards orderedListMode to markdown rendering", async () => {
    const md = "1. first\n   indent\n3. third";
    const looseHtml = await exportToHtml(md, {
      theme: "light",
      includeProperties: false,
      orderedListMode: "loose",
    });
    const strictHtml = await exportToHtml(md, {
      theme: "light",
      includeProperties: false,
      orderedListMode: "strict",
    });

    expect(looseHtml).toMatch(/<li[^>]*value="3"/);
    expect(strictHtml).not.toMatch(/value="3"/);
  });
});
