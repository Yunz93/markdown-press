import { describe, expect, it } from "vitest";
import {
  normalizeAttachmentLocation,
  resolveAttachmentTargetDir,
} from "./attachmentLocation";

describe("normalizeAttachmentLocation", () => {
  it("defaults unknown values to resourceFolder", () => {
    expect(normalizeAttachmentLocation(undefined)).toBe("resourceFolder");
    expect(normalizeAttachmentLocation("nope")).toBe("resourceFolder");
  });

  it("keeps valid locations", () => {
    expect(normalizeAttachmentLocation("sameAsCurrent")).toBe("sameAsCurrent");
    expect(normalizeAttachmentLocation("subfolderUnderCurrent")).toBe(
      "subfolderUnderCurrent",
    );
  });
});

describe("resolveAttachmentTargetDir", () => {
  it("uses the vault resource folder by default", () => {
    expect(
      resolveAttachmentTargetDir({
        location: "resourceFolder",
        rootFolderPath: "/vault",
        currentFilePath: "/vault/notes/a.md",
        resourceFolder: "resources",
      }),
    ).toEqual({
      absoluteDir: "/vault/resources",
      markdownRelativePathPrefix: "resources",
    });
  });

  it("stores attachments next to the current file", () => {
    expect(
      resolveAttachmentTargetDir({
        location: "sameAsCurrent",
        rootFolderPath: "/vault",
        currentFilePath: "/vault/notes/a.md",
        resourceFolder: "resources",
      }),
    ).toEqual({
      absoluteDir: "/vault/notes",
      markdownRelativePathPrefix: "",
    });
  });

  it("stores attachments in a subfolder under the current file folder", () => {
    expect(
      resolveAttachmentTargetDir({
        location: "subfolderUnderCurrent",
        rootFolderPath: "/vault",
        currentFilePath: "/vault/notes/a.md",
        resourceFolder: "attachments",
      }),
    ).toEqual({
      absoluteDir: "/vault/notes/attachments",
      markdownRelativePathPrefix: "attachments",
    });
  });

  it("falls back to the vault resource folder when no current file is open", () => {
    expect(
      resolveAttachmentTargetDir({
        location: "sameAsCurrent",
        rootFolderPath: "/vault",
        currentFilePath: null,
        resourceFolder: "resources",
      }),
    ).toEqual({
      absoluteDir: "/vault/resources",
      markdownRelativePathPrefix: "resources",
    });
  });
});
