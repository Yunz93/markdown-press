import { describe, expect, it } from "vitest";
import type { FileNode } from "../types";
import {
  extractAndResolveOutboundWikiLinks,
  extractOutboundWikiLinks,
  resolveOutbounds,
} from "./wikiOutbound";

function file(path: string, name: string): FileNode {
  return { id: path, name, type: "file", path };
}

function folder(path: string, name: string, children: FileNode[]): FileNode {
  return { id: path, name, type: "folder", path, children };
}

const vault: FileNode[] = [
  file("/vault/Alpha.md", "Alpha.md"),
  file("/vault/Beta.md", "Beta.md"),
  folder("/vault/notes", "notes", [
    file("/vault/notes/Nested.md", "Nested.md"),
    file("/vault/notes/中文笔记.md", "中文笔记.md"),
  ]),
  folder("/vault/.trash", ".trash", [
    { ...file("/vault/.trash/Gone.md", "Gone.md"), isTrash: true },
  ]),
];

describe("extractOutboundWikiLinks", () => {
  it("extracts wiki links and embeds with offsets", () => {
    const content =
      "See [[Alpha]] and ![[Beta#Intro]] plus [[notes/Nested|alias]].";
    const links = extractOutboundWikiLinks("/vault/Current.md", content);

    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({
      raw: "[[Alpha]]",
      targetRaw: "Alpha",
      isEmbed: false,
      displayText: "Alpha",
    });
    expect(links[1]).toMatchObject({
      raw: "![[Beta#Intro]]",
      targetRaw: "Beta",
      isEmbed: true,
      subpath: "Intro",
      subpathType: "heading",
    });
    expect(links[2]).toMatchObject({
      targetRaw: "notes/Nested",
      displayText: "alias",
    });
    expect(content.slice(links[0].startOffset, links[0].endOffset)).toBe(
      "[[Alpha]]",
    );
  });

  it("supports Chinese note names and block refs", () => {
    const content = "[[中文笔记#^block-1]]";
    const links = extractOutboundWikiLinks("/vault/Current.md", content);
    expect(links[0]?.targetRaw).toBe("中文笔记");
    expect(links[0]?.subpathType).toBe("block");
  });

  it("returns empty for content without wiki links", () => {
    expect(extractOutboundWikiLinks("/vault/a.md", "plain text")).toEqual([]);
  });
});

describe("resolveOutbounds", () => {
  it("resolves basename, path, and marks dead links", () => {
    const unresolved = extractOutboundWikiLinks(
      "/vault/Current.md",
      "[[Alpha]] [[notes/Nested]] [[Missing]] ![[Gone]]",
    );
    const resolved = resolveOutbounds(unresolved, vault, "/vault");

    expect(resolved[0]?.resolvedPath).toBe("/vault/Alpha.md");
    expect(resolved[1]?.resolvedPath).toBe("/vault/notes/Nested.md");
    expect(resolved[2]?.resolvedPath).toBeNull();
    // Trash notes are ignored by resolveWikiLinkFile flatten
    expect(resolved[3]?.resolvedPath).toBeNull();
  });

  it("resolves empty-path heading refs to the source note", () => {
    const unresolved = extractOutboundWikiLinks(
      "/vault/Alpha.md",
      "Jump [[#Section]]",
    );
    const resolved = resolveOutbounds(unresolved, vault, "/vault");
    expect(resolved[0]?.resolvedPath).toBe("/vault/Alpha.md");
  });

  it("resolves relative links from nested notes", () => {
    const links = extractAndResolveOutboundWikiLinks(
      "/vault/notes/Nested.md",
      "[[中文笔记]]",
      vault,
      "/vault",
    );
    expect(links[0]?.resolvedPath).toBe("/vault/notes/中文笔记.md");
  });
});
