import type { FileNode } from "../types";
import type { WikiOutboundLink } from "../types/vaultIndex";
import { WIKI_LINK_REGEX } from "./markdownLinkUtils";
import { parseWikiLinkReference, resolveWikiLinkFile } from "./wikiLinks";

export type UnresolvedWikiOutboundLink = Omit<WikiOutboundLink, "resolvedPath">;

/**
 * Extract outbound wiki / embed links from markdown content.
 * Does not resolve targets — call {@link resolveOutbounds} with the file tree.
 */
export function extractOutboundWikiLinks(
  sourcePath: string,
  content: string,
): UnresolvedWikiOutboundLink[] {
  const results: UnresolvedWikiOutboundLink[] = [];
  const regex = new RegExp(WIKI_LINK_REGEX.source, WIKI_LINK_REGEX.flags);

  for (const match of content.matchAll(regex)) {
    const fullMatch = match[0];
    const inner = match[1];
    if (!fullMatch || inner === undefined) continue;

    const startOffset = match.index ?? 0;
    const endOffset = startOffset + fullMatch.length;
    const isEmbed = fullMatch.startsWith("!");
    const parsed = parseWikiLinkReference(inner, { embed: isEmbed });

    results.push({
      sourcePath,
      raw: fullMatch,
      targetRaw: parsed.path,
      displayText: parsed.displayText,
      isEmbed,
      subpath: parsed.subpath,
      subpathType: parsed.subpathType,
      startOffset,
      endOffset,
    });
  }

  return results;
}

export function resolveOutbounds(
  links: UnresolvedWikiOutboundLink[],
  files: FileNode[],
  rootFolderPath: string | null,
): WikiOutboundLink[] {
  return links.map((link) => {
    // Empty path with only #heading / #^block refers to the current note.
    if (!link.targetRaw.trim()) {
      return {
        ...link,
        resolvedPath: link.sourcePath,
      };
    }

    const resolved = resolveWikiLinkFile(
      files,
      link.targetRaw,
      rootFolderPath,
      link.sourcePath,
    );

    return {
      ...link,
      resolvedPath: resolved?.path ?? null,
    };
  });
}

export function extractAndResolveOutboundWikiLinks(
  sourcePath: string,
  content: string,
  files: FileNode[],
  rootFolderPath: string | null,
): WikiOutboundLink[] {
  return resolveOutbounds(
    extractOutboundWikiLinks(sourcePath, content),
    files,
    rootFolderPath,
  );
}
