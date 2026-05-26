import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import type { StateCommand } from "@codemirror/state";
import {
  toggleOrderedList,
  toggleTaskList,
  toggleUnorderedList,
} from "./nestedListCommands";

function applyCommand(
  cmd: StateCommand,
  doc: string,
  anchor: number,
  head: number,
): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
  });
  let next = state;
  cmd({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  return next;
}

describe("toggleUnorderedList", () => {
  it("wraps plain text as an unordered list item", () => {
    const next = applyCommand(toggleUnorderedList, "hello", 5, 5);
    expect(next.doc.toString()).toBe("- hello");
  });

  it("removes marker when toggling off an unordered selection", () => {
    const doc = "- item";
    const next = applyCommand(toggleUnorderedList, doc, 3, 3);
    expect(next.doc.toString()).toBe("item");
  });

  it("preserves indent when converting nested plain text", () => {
    const doc = "    nested";
    const next = applyCommand(toggleUnorderedList, doc, doc.length, doc.length);
    expect(next.doc.toString()).toBe("    - nested");
  });
});

describe("toggleOrderedList", () => {
  it("wraps plain text as an ordered list item", () => {
    const next = applyCommand(toggleOrderedList(), "hello", 5, 5);
    expect(next.doc.toString()).toBe("1. hello");
  });

  it("removes marker when toggling off an ordered selection", () => {
    const doc = "1. item";
    const next = applyCommand(toggleOrderedList(), doc, 4, 4);
    expect(next.doc.toString()).toBe("item");
  });

  it("renumbers siblings after converting unordered lines in strict mode", () => {
    const doc = "- one\n- two";
    const next = applyCommand(
      toggleOrderedList({ strictMode: true }),
      doc,
      0,
      doc.length,
    );
    expect(next.doc.toString()).toBe("1. one\n2. two");
  });
});

describe("toggleTaskList", () => {
  it("converts unordered text to a task item", () => {
    const doc = "- todo";
    const next = applyCommand(toggleTaskList, doc, doc.length, doc.length);
    expect(next.doc.toString()).toBe("- [ ] todo");
  });

  it("converts task items back to unordered list items", () => {
    const doc = "- [ ] todo";
    const next = applyCommand(toggleTaskList, doc, doc.length, doc.length);
    expect(next.doc.toString()).toBe("- todo");
  });

  it("converts ordered items to task items", () => {
    const doc = "1. step";
    const next = applyCommand(toggleTaskList, doc, doc.length, doc.length);
    expect(next.doc.toString()).toBe("- [ ] step");
  });
});
