/**
 * Live Preview block widgets for GFM pipe tables.
 * Inactive: rendered HTML table. Click a cell to jump into source.
 */

import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { findTableAt } from "../../../utils/markdownTable";
import { renderMarkdown } from "../../../utils/markdown";
import { isLargeEditorState } from "../hooks/codeMirrorHelpers";
import { selectionTouchesRange } from "./shared";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInlineCell(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const html = renderMarkdown(trimmed);
    const match = html.match(/<p>([\s\S]*?)<\/p>/i);
    return match?.[1] ?? html;
  } catch {
    return escapeHtml(trimmed);
  }
}

function lineIndexForLogicalRow(startLine: number, logicalRow: number): number {
  return logicalRow === 0 ? startLine : startLine + 1 + logicalRow;
}

function cellContentRange(
  lineText: string,
  lineFrom: number,
  colIndex: number,
): { from: number; to: number } | null {
  let cursor = 0;
  const leading = lineText.match(/^\s*\|/)?.[0];
  if (leading) cursor = leading.length;

  const rest = lineText.slice(cursor);
  const parts = rest.split("|");
  const cells =
    parts.length > 0 && parts[parts.length - 1].trim() === ""
      ? parts.slice(0, -1)
      : parts;

  if (colIndex < 0 || colIndex >= cells.length) return null;

  let offset = lineFrom + cursor;
  for (let i = 0; i < cells.length; i += 1) {
    const part = cells[i];
    const lead = part.match(/^\s*/)?.[0].length ?? 0;
    const trail = part.match(/\s*$/)?.[0].length ?? 0;
    const from = offset + lead;
    const to = Math.max(from, offset + part.length - trail);
    if (i === colIndex) return { from, to };
    offset += part.length + 1;
  }
  return null;
}

class TableWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly from: number,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return this.html === other.html && this.from === other.from;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-live-preview-table-wrap";
    wrap.setAttribute("contenteditable", "false");
    wrap.innerHTML = this.html;

    wrap.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const target = event.target as HTMLElement | null;
      const cell = target?.closest?.("th, td") as HTMLElement | null;

      const focusAt = (pos: number) => {
        view.dispatch({
          selection: { anchor: pos },
          scrollIntoView: true,
        });
        view.focus();
      };

      if (!cell || !wrap.contains(cell)) {
        focusAt(this.from);
        return;
      }

      const rowEl = cell.parentElement;
      const section = rowEl?.parentElement;
      if (!rowEl || !section) {
        focusAt(this.from);
        return;
      }

      const isHeader = section.tagName.toLowerCase() === "thead";
      const rowIndex = Array.from(section.children).indexOf(rowEl);
      const colIndex = Array.from(rowEl.children).indexOf(cell);
      if (rowIndex < 0 || colIndex < 0) {
        focusAt(this.from);
        return;
      }

      const lines = view.state.doc.toString().split("\n");
      const lineIndex = view.state.doc.lineAt(this.from).number - 1;
      const table = findTableAt(lines, lineIndex);
      if (!table) {
        focusAt(this.from);
        return;
      }

      const logicalRow = isHeader ? 0 : rowIndex + 1;
      const resolvedLine = lineIndexForLogicalRow(table.startLine, logicalRow);
      if (resolvedLine < 0 || resolvedLine >= view.state.doc.lines) {
        focusAt(this.from);
        return;
      }

      const line = view.state.doc.line(resolvedLine + 1);
      const range = cellContentRange(line.text, line.from, colIndex);
      focusAt(range?.from ?? line.from);
    });

    return wrap;
  }

  ignoreEvent(event: Event) {
    return event.type !== "mousedown";
  }
}

function buildTableHtml(
  header: string[],
  alignments: string[],
  body: string[][],
): string {
  const alignAttr = (i: number) => {
    const a = alignments[i];
    if (a === "left" || a === "center" || a === "right") {
      return ` style="text-align:${a}"`;
    }
    return "";
  };

  const head = header
    .map((cell, i) => `<th${alignAttr(i)}>${renderInlineCell(cell)}</th>`)
    .join("");
  const rows = body
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => `<td${alignAttr(i)}>${renderInlineCell(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  return `<table class="cm-live-preview-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

export function buildLivePreviewTableDecorations(
  view: EditorView,
): DecorationSet {
  if (isLargeEditorState(view.state)) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;
  const lines = state.doc.toString().split("\n");
  const seen = new Set<number>();

  for (const { from: viewportFrom, to: viewportTo } of view.visibleRanges) {
    const startLine = state.doc.lineAt(viewportFrom).number - 1;
    const endLine =
      state.doc.lineAt(Math.max(viewportFrom, viewportTo - 1)).number - 1;

    for (let lineIndex = startLine; lineIndex <= endLine; lineIndex += 1) {
      if (seen.has(lineIndex)) continue;
      const table = findTableAt(lines, lineIndex);
      if (!table) continue;

      for (let i = table.startLine; i <= table.endLine; i += 1) {
        seen.add(i);
      }

      const from = state.doc.line(table.startLine + 1).from;
      const to = state.doc.line(table.endLine + 1).to;
      if (selectionTouchesRange(state, from, to)) continue;

      const html = buildTableHtml(table.header, table.alignments, table.body);
      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new TableWidget(html, from),
          block: true,
        }),
      );
    }
  }

  return builder.finish();
}

export const livePreviewTables = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewTableDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildLivePreviewTableDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);
