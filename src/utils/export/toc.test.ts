import { describe, it, expect } from "vitest";
import { generateTOC, injectExportHeadingIds } from "./styles";

describe("generateTOC", () => {
  it("returns empty string when there are no headings", () => {
    expect(generateTOC("just a paragraph")).toBe("");
  });

  it("produces anchors that match injected heading ids for ASCII headings", () => {
    const content = "# Hello World\n\nbody\n\n## Sub Section";
    const toc = generateTOC(content);
    expect(toc).toContain('href="#hello-world"');
    expect(toc).toContain('href="#sub-section"');

    const html = injectExportHeadingIds(
      '<h1 class="heading-1">Hello World</h1><h2 class="heading-2">Sub Section</h2>',
      content,
    );
    expect(html).toContain('id="hello-world"');
    expect(html).toContain('id="sub-section"');
  });

  it("preserves CJK headings instead of collapsing them to empty slugs", () => {
    const content = "# 你好世界\n\n## 重构建议";
    const toc = generateTOC(content);
    expect(toc).toContain('href="#你好世界"');
    expect(toc).toContain('href="#重构建议"');

    const html = injectExportHeadingIds(
      "<h1>你好世界</h1><h2>重构建议</h2>",
      content,
    );
    expect(html).toContain('id="你好世界"');
    expect(html).toContain('id="重构建议"');
  });

  it("disambiguates duplicate headings consistently in TOC and ids", () => {
    const content = "# Intro\n\n# Intro";
    const toc = generateTOC(content);
    expect(toc).toContain('href="#intro"');
    expect(toc).toContain('href="#intro-2"');

    const html = injectExportHeadingIds(
      "<h1>Intro</h1><h1>Intro</h1>",
      content,
    );
    expect(html).toContain('id="intro"');
    expect(html).toContain('id="intro-2"');
  });

  it("does not overwrite an existing id attribute", () => {
    const html = injectExportHeadingIds(
      '<h1 id="custom">Title</h1>',
      "# Title",
    );
    expect(html).toContain('id="custom"');
    expect(html).not.toContain('id="title"');
  });
});
