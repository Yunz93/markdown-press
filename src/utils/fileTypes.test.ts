import { describe, expect, it } from "vitest";
import {
  getRenameDialogDefaultValue,
  resolveRenamedFileName,
} from "./fileTypes";

describe("rename name helpers", () => {
  it("strips markdown extensions for the rename dialog", () => {
    expect(getRenameDialogDefaultValue("note.md")).toBe("note");
    expect(getRenameDialogDefaultValue("note.markdown")).toBe("note");
    expect(getRenameDialogDefaultValue("page.html")).toBe("page.html");
    expect(getRenameDialogDefaultValue("image.png")).toBe("image.png");
  });

  it("preserves markdown extensions when resolving rename input", () => {
    expect(resolveRenamedFileName("note.md", "renamed")).toBe("renamed.md");
    expect(resolveRenamedFileName("note.markdown", "renamed")).toBe(
      "renamed.markdown",
    );
    expect(resolveRenamedFileName("note.md", "renamed.markdown")).toBe(
      "renamed.markdown",
    );
  });

  it("does not force .md onto non-markdown files", () => {
    expect(resolveRenamedFileName("page.html", "page.html")).toBe("page.html");
    expect(resolveRenamedFileName("page.html", "about")).toBe("about.html");
    expect(resolveRenamedFileName("image.PNG", "cover")).toBe("cover.PNG");
    expect(resolveRenamedFileName("doc.pdf", "doc.pdf")).toBe("doc.pdf");
  });
});
