/**
 * Live Preview Mermaid widgets for ```mermaid fenced blocks.
 */

import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  renderMermaidDiagrams,
  resetMermaidPlaceholders,
} from "../../../utils/markdown-extensions";
import { livePreviewContextFacet } from "./context";
import {
  defineLivePreviewBlockDecorationField,
  selectionTouchesRange,
  type BlockDecorationBuild,
  type CoverageRange,
} from "./shared";
import {
  getLivePreviewOptimizationMode,
  SoftOffPlaceholderWidget,
  softOffReason,
} from "./softOff";

class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly themeMode: "light" | "dark",
  ) {
    super();
  }

  eq(other: MermaidWidget) {
    return this.source === other.source && this.themeMode === other.themeMode;
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-live-preview-mermaid is-loading";
    wrap.setAttribute("contenteditable", "false");
    wrap.setAttribute("data-mermaid-status", "loading");

    const status = document.createElement("div");
    status.className = "cm-live-preview-mermaid-status";
    status.textContent = "Rendering Mermaid…";
    wrap.appendChild(status);

    const diagram = document.createElement("div");
    diagram.className = "mermaid";
    diagram.textContent = this.source;
    wrap.appendChild(diagram);

    const themeMode = this.themeMode;
    let cancelled = false;
    let rendering = false;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;

    const setStatus = (
      next: "loading" | "ready" | "error" | "pending-width",
      message?: string,
    ) => {
      wrap.classList.remove("is-loading", "is-error", "is-pending-width");
      wrap.setAttribute("data-mermaid-status", next);
      if (next === "loading") wrap.classList.add("is-loading");
      if (next === "error") wrap.classList.add("is-error");
      if (next === "pending-width") wrap.classList.add("is-pending-width");
      status.textContent =
        message ??
        (next === "ready"
          ? ""
          : next === "error"
            ? "Mermaid render failed"
            : next === "pending-width"
              ? "Waiting for layout…"
              : "Rendering Mermaid…");
      status.hidden = next === "ready";
    };

    const tryRender = () => {
      if (cancelled || rendering || !wrap.isConnected) return;
      const rect = diagram.getBoundingClientRect();
      if (rect.width < 4) {
        setStatus("pending-width");
        return;
      }
      rendering = true;
      setStatus("loading");
      void renderMermaidDiagrams(wrap, { themeMode })
        .then(() => {
          if (cancelled) return;
          const hasSvg = Boolean(diagram.querySelector("svg"));
          const pending =
            diagram.dataset.mermaidPendingWidth === "true" ||
            diagram.getBoundingClientRect().width < 4;
          if (hasSvg && !pending) {
            setStatus("ready");
          } else if (pending) {
            setStatus("pending-width");
          } else if (!hasSvg) {
            setStatus("error", "Mermaid render failed");
          }
        })
        .catch(() => {
          if (cancelled) return;
          setStatus("error", "Mermaid render failed — click to retry");
        })
        .finally(() => {
          rendering = false;
        });
    };

    const retry = () => {
      if (cancelled) return;
      resetMermaidPlaceholders(wrap);
      tryRender();
    };

    wrap.addEventListener("click", (event) => {
      if (wrap.getAttribute("data-mermaid-status") !== "error") return;
      event.preventDefault();
      event.stopPropagation();
      retry();
    });

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => tryRender());
      resizeObserver.observe(wrap);
    }
    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) tryRender();
        },
        { root: null, threshold: 0.01 },
      );
      intersectionObserver.observe(wrap);
    }

    queueMicrotask(tryRender);

    // CM may detach the node; disconnect observers when removed.
    const detachObserver = new MutationObserver(() => {
      if (wrap.isConnected) return;
      cancelled = true;
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      detachObserver.disconnect();
    });
    queueMicrotask(() => {
      if (wrap.parentElement) {
        detachObserver.observe(wrap.parentElement, { childList: true });
      }
    });

    return wrap;
  }

  ignoreEvent(event: Event) {
    return event.type !== "click";
  }
}

function extractFencedInfo(
  state: { doc: { sliceString: (a: number, b: number) => string } },
  from: number,
  to: number,
) {
  const text = state.doc.sliceString(from, to);
  const open = text.match(/^```([^\n]*)\n/);
  const lang = (open?.[1] ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const close = text.lastIndexOf("\n```");
  const body =
    open && close > open[0].length ? text.slice(open[0].length, close) : "";
  return { lang, body };
}

export function buildMermaidDecorations(
  state: EditorState,
): BlockDecorationBuild {
  const coverage: CoverageRange[] = [];
  const mode = getLivePreviewOptimizationMode(state);
  const reason = softOffReason(mode, "mermaid");
  const builder = new RangeSetBuilder<Decoration>();
  const ctx = state.facet(livePreviewContextFacet);
  const themeMode = ctx.themeMode ?? "light";
  const tree =
    ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state);

  tree.iterate({
    from: 0,
    to: state.doc.length,
    enter: (node) => {
      if (node.name !== "FencedCode") return;
      const { from, to } = node;
      const { lang, body } = extractFencedInfo(state, from, to);
      if (lang !== "mermaid" && lang !== "mmd") return;
      if (!body.trim()) return;

      coverage.push({ from, to });
      if (selectionTouchesRange(state, from, to)) return;

      if (reason) {
        builder.add(
          from,
          to,
          Decoration.replace({
            widget: new SoftOffPlaceholderWidget(
              "mermaid",
              reason,
              body.trim().slice(0, 48),
            ),
            block: true,
          }),
        );
        return;
      }

      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new MermaidWidget(body, themeMode),
          block: true,
        }),
      );
    },
  });

  return { decorations: builder.finish(), coverage };
}

/** @deprecated Prefer buildMermaidDecorations(state). */
export function buildLivePreviewMermaidDecorations(
  view: EditorView,
): DecorationSet {
  return buildMermaidDecorations(view.state).decorations;
}

export const livePreviewMermaid = defineLivePreviewBlockDecorationField({
  create: buildMermaidDecorations,
});
