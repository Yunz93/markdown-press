import { describe, expect, it } from "vitest";
import { convertHtmlToMarkdown } from "./htmlToMarkdown";

describe("convertHtmlToMarkdown", () => {
  it("converts basic HTML to Markdown", () => {
    expect(convertHtmlToMarkdown("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello **world**",
    );
  });

  it("strips script tags before converting", () => {
    expect(
      convertHtmlToMarkdown(
        '<p>Safe</p><script>alert("x")</script><p>Text</p>',
      ),
    ).toContain("Safe");
    expect(
      convertHtmlToMarkdown(
        '<p>Safe</p><script>alert("x")</script><p>Text</p>',
      ),
    ).not.toContain("alert");
  });

  it("returns an empty string for blank input", () => {
    expect(convertHtmlToMarkdown("   ")).toBe("");
  });
});
