import { describe, expect, it } from "vitest";
import {
  normalizeNewNoteFolder,
  normalizeNewNoteLocation,
  resolveNewNoteFolderPath,
} from "./newNoteLocation";

describe("normalizeNewNoteLocation", () => {
  it("defaults unknown values to knowledge base root", () => {
    expect(normalizeNewNoteLocation(undefined)).toBe("knowledgeBaseRoot");
    expect(normalizeNewNoteLocation("nope")).toBe("knowledgeBaseRoot");
  });

  it("keeps current-file-folder when valid", () => {
    expect(normalizeNewNoteLocation("currentFileFolder")).toBe(
      "currentFileFolder",
    );
  });

  it("keeps specified-folder when valid", () => {
    expect(normalizeNewNoteLocation("specifiedFolder")).toBe("specifiedFolder");
  });
});

describe("normalizeNewNoteFolder", () => {
  it("defaults invalid values to notes", () => {
    expect(normalizeNewNoteFolder(undefined)).toBe("notes");
    expect(normalizeNewNoteFolder("../etc")).toBe("notes");
    expect(normalizeNewNoteFolder("")).toBe("notes");
  });

  it("sanitizes relative folder paths", () => {
    expect(normalizeNewNoteFolder("  inbox/daily  ")).toBe("inbox/daily");
  });
});

describe("resolveNewNoteFolderPath", () => {
  it("prefers an explicit folder from the sidebar context menu", () => {
    expect(
      resolveNewNoteFolderPath({
        location: "currentFileFolder",
        rootFolderPath: "/vault",
        currentFilePath: "/vault/notes/a.md",
        explicitFolderPath: "/vault/inbox",
      }),
    ).toBe("/vault/inbox");
  });

  it("returns undefined for knowledge-base-root so createFile uses the root", () => {
    expect(
      resolveNewNoteFolderPath({
        location: "knowledgeBaseRoot",
        rootFolderPath: "/vault",
        currentFilePath: "/vault/notes/a.md",
      }),
    ).toBeUndefined();
  });

  it("uses the current file folder when configured", () => {
    expect(
      resolveNewNoteFolderPath({
        location: "currentFileFolder",
        rootFolderPath: "/vault",
        currentFilePath: "/vault/notes/a.md",
      }),
    ).toBe("/vault/notes");
  });

  it("joins root with sanitized newNoteFolder for specifiedFolder", () => {
    expect(
      resolveNewNoteFolderPath({
        location: "specifiedFolder",
        rootFolderPath: "/vault",
        currentFilePath: "/vault/notes/a.md",
        newNoteFolder: "inbox/daily",
      }),
    ).toBe("/vault/inbox/daily");
  });

  it("falls back to notes when specifiedFolder path is unsafe", () => {
    expect(
      resolveNewNoteFolderPath({
        location: "specifiedFolder",
        rootFolderPath: "/vault",
        newNoteFolder: "../etc",
      }),
    ).toBe("/vault/notes");
  });

  it("falls back when no file is open or the path is outside the vault", () => {
    expect(
      resolveNewNoteFolderPath({
        location: "currentFileFolder",
        rootFolderPath: "/vault",
        currentFilePath: null,
      }),
    ).toBeUndefined();

    expect(
      resolveNewNoteFolderPath({
        location: "currentFileFolder",
        rootFolderPath: "/vault",
        currentFilePath: "/other/notes/a.md",
      }),
    ).toBeUndefined();
  });
});
