import { describe, it, expect } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import type { StateCommand } from "@codemirror/state";
import {
  handleTableTab,
  handleTableShiftTab,
  handleTableEnter,
  insertTable,
  insertTableRowBelow,
  insertTableColumnRight,
  deleteTableColumn,
  alignTableColumnCenter,
  formatTable,
} from "./tables";
import { createHandleSmartTab, handleSmartEnter } from "./input";

function applyCommand(
  cmd: StateCommand,
  doc: string,
  anchor: number,
  head = anchor,
): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
  });
  let next = state;
  const handled = cmd({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  expect(handled).toBe(true);
  return next;
}

function cellOffset(doc: string, lineIndex: number, col: number): number {
  const lines = doc.split("\n");
  let offset = 0;
  for (let i = 0; i < lineIndex; i += 1) offset += lines[i].length + 1;
  const line = lines[lineIndex];
  // Find nth cell content start roughly: after pipes
  const ranges: number[] = [];
  let working = line;
  let base = 0;
  const lead = working.match(/^\s*/)?.[0].length ?? 0;
  working = working.slice(lead);
  base += lead;
  if (working.startsWith("|")) {
    working = working.slice(1);
    base += 1;
  }
  if (working.endsWith("|")) working = working.slice(0, -1);
  let cursor = 0;
  for (const part of working.split("|")) {
    const l = part.match(/^\s*/)?.[0].length ?? 0;
    ranges.push(base + cursor + l);
    cursor += part.length + 1;
  }
  return offset + ranges[col];
}

const TABLE = [
  "| Name | Age |",
  "| --- | --- |",
  "| Ada | 36 |",
  "| Bob | 28 |",
].join("\n");

describe("handleTableTab", () => {
  it("moves to the next cell", () => {
    const from = cellOffset(TABLE, 2, 0);
    const next = applyCommand(handleTableTab, TABLE, from);
    expect(next.selection.main.from).toBe(cellOffset(TABLE, 2, 1));
  });

  it("appends a row when Tab on the last cell", () => {
    const from = cellOffset(TABLE, 3, 1);
    const next = applyCommand(handleTableTab, TABLE, from);
    const lines = next.doc.toString().split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[4]).toMatch(/^\|/);
    expect(next.selection.main.from).toBe(
      cellOffset(next.doc.toString(), 4, 0),
    );
  });

  it("is invoked via SmartTab inside tables", () => {
    const tab = createHandleSmartTab("strict");
    const from = cellOffset(TABLE, 2, 0);
    const next = applyCommand(tab, TABLE, from);
    expect(next.selection.main.from).toBe(cellOffset(TABLE, 2, 1));
  });
});

describe("handleTableShiftTab", () => {
  it("moves to the previous cell", () => {
    const from = cellOffset(TABLE, 2, 1);
    const next = applyCommand(handleTableShiftTab, TABLE, from);
    expect(next.selection.main.from).toBe(cellOffset(TABLE, 2, 0));
  });
});

describe("handleTableEnter", () => {
  it("moves to the same column on the next row", () => {
    const from = cellOffset(TABLE, 2, 1);
    const next = applyCommand(handleTableEnter, TABLE, from);
    expect(next.selection.main.from).toBe(cellOffset(TABLE, 3, 1));
  });

  it("appends a row at the bottom", () => {
    const from = cellOffset(TABLE, 3, 0);
    const next = applyCommand(handleTableEnter, TABLE, from);
    expect(next.doc.toString().split("\n")).toHaveLength(5);
  });

  it("is invoked via SmartEnter inside tables even mid-line", () => {
    const from = cellOffset(TABLE, 2, 0);
    const next = applyCommand(handleSmartEnter, TABLE, from);
    expect(next.selection.main.from).toBe(cellOffset(TABLE, 3, 0));
  });
});

describe("structure commands", () => {
  it("inserts a table template", () => {
    const next = applyCommand(insertTable, "", 0);
    const text = next.doc.toString();
    expect(text).toContain("| 列1 | 列2 | 列3 |");
    expect(text).toContain("| --- | --- | --- |");
  });

  it("inserts a row below", () => {
    const from = cellOffset(TABLE, 2, 0);
    const next = applyCommand(insertTableRowBelow, TABLE, from);
    expect(next.doc.toString().split("\n")).toHaveLength(5);
  });

  it("inserts and deletes columns", () => {
    const from = cellOffset(TABLE, 2, 0);
    const withCol = applyCommand(insertTableColumnRight, TABLE, from);
    const headerAfterInsert = withCol.doc.toString().split("\n")[0];
    expect(headerAfterInsert.split("|").length - 2).toBe(3);

    const deleted = applyCommand(
      deleteTableColumn,
      withCol.doc.toString(),
      withCol.selection.main.from,
    );
    const headerAfterDelete = deleted.doc.toString().split("\n")[0];
    expect(headerAfterDelete.split("|").length - 2).toBe(2);
  });

  it("aligns and formats", () => {
    const from = cellOffset(TABLE, 0, 1);
    const aligned = applyCommand(alignTableColumnCenter, TABLE, from);
    expect(aligned.doc.toString().split("\n")[1]).toMatch(/:---:/);

    const formatted = applyCommand(
      formatTable,
      aligned.doc.toString(),
      aligned.selection.main.from,
    );
    expect(formatted.doc.toString()).toContain("Name");
  });
});
