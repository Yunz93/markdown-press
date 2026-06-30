import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("preview spacing CSS", () => {
  it("uses source blank lines as one editor-height line without adjacent margin stacking", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/preview.css"),
      "utf8",
    );

    expect(css).toMatch(
      /\.preview-pane-document\.markdown-body\s*\{[^}]*--preview-line-height:\s*1\.95;[^}]*line-height:\s*var\(--preview-line-height\);/m,
    );
    expect(css).toMatch(
      /\.preview-pane-document\.markdown-body \.preview-source-blank-line\s*\{[^}]*height:\s*calc\(var\(--preview-line-height\) \* 1em\);/m,
    );
    expect(css).toMatch(
      /\.preview-pane-document\.markdown-body > :has\(\+ \.preview-source-blank-line\)\s*\{[^}]*margin-bottom:\s*0;/m,
    );
    expect(css).toMatch(
      /\.preview-pane-document\.markdown-body \.preview-source-blank-line \+ \*\s*\{[^}]*margin-top:\s*0;/m,
    );
  });

  it("does not add paragraph-to-list spacing when the source has no blank line", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/preview.css"),
      "utf8",
    );

    expect(css).toMatch(
      /\.preview-pane-document\.markdown-body p:has\(\+ :is\(ul,\s*ol\)\)\s*\{[^}]*margin-bottom:\s*0;/m,
    );
    expect(css).toMatch(
      /\.preview-pane-document\.markdown-body p \+ :is\(ul,\s*ol\)\s*\{[^}]*margin-top:\s*0;/m,
    );
  });

  it("keeps inline code pills vertically centered inside prose lines", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/preview.css"),
      "utf8",
    );

    expect(css).toMatch(
      /\.preview-pane-document\.markdown-body code\s*\{[^}]*line-height:\s*1\.35;/m,
    );
    expect(css).toMatch(
      /\.preview-pane-document\.markdown-body pre(?:,\s*\n\.preview-pane-document\.markdown-body pre:not\(\.shiki\) code)+[^}]*line-height:\s*1\.75;/m,
    );
  });

  it("sizes wiki embed images via typed attr(... px) on bare numeric data attributes", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/preview.css"),
      "utf8",
    );

    expect(css).toMatch(
      /img\.preview-attachment-image\[data-wiki-embed-w\][\s\S]*?attr\(data-wiki-embed-w px,\s*100%\)/m,
    );
    expect(css).toMatch(
      /img\.preview-attachment-image\[data-wiki-embed-h\][\s\S]*?attr\(data-wiki-embed-h px,\s*auto\)/m,
    );
    expect(css).toMatch(/Values are bare numbers like "100"/);
  });

  it("lays out multi-value frontmatter fields horizontally", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/preview.css"),
      "utf8",
    );

    expect(css).toMatch(
      /\.preview-pane-properties-multi-value\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/m,
    );
    expect(css).toMatch(
      /\.preview-pane-properties-multi-value-item\s*\{[^}]*display:\s*inline-flex;[^}]*border-radius:\s*0\.45rem;[^}]*background:/m,
    );
  });

  it("defines preview attachment, pdf, video, note embed, and properties blocks", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/preview.css"),
      "utf8",
    );

    expect(css).toMatch(/\.preview-pane-properties\b/);
    expect(css).toMatch(/\.preview-attachment-pdf\b/);
    expect(css).toMatch(/\.preview-attachment-video\b/);
    expect(css).toMatch(/\.preview-note-embed\b/);
    expect(css).toMatch(/\.preview-external-video-embed\b/);
    expect(css).toMatch(/\.preview-html-document\b/);
    expect(css).toMatch(/\.preview-pane-document-compact\b/);
  });
});
