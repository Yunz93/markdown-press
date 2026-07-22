/** Vault link-index / retrieval shared types (Phase 1+). */

export type WikiSubpathType = "heading" | "block" | null;

/** One outbound [[wiki]] / ![[embed]] occurrence in a source note. */
export interface WikiOutboundLink {
  sourcePath: string;
  raw: string;
  targetRaw: string;
  displayText: string;
  resolvedPath: string | null;
  isEmbed: boolean;
  subpath: string;
  subpathType: WikiSubpathType;
  startOffset: number;
  endOffset: number;
}

export interface LinkIndexSnapshot {
  version: 1;
  vaultRoot: string;
  builtAt: number;
  /** sourcePath -> outbound links */
  outbounds: Record<string, WikiOutboundLink[]>;
  /** resolvedPath -> sourcePaths that link to it */
  inbounds: Record<string, string[]>;
  /** unresolved targetRaw -> sourcePaths */
  unresolved: Record<string, string[]>;
}

export interface LinkIndexProgress {
  phase: "idle" | "building" | "updating" | "error";
  done: number;
  total: number;
  currentPath: string | null;
  error: string | null;
  builtAt: number | null;
}

export interface BacklinkGroup {
  sourcePath: string;
  links: WikiOutboundLink[];
}
