/**
 * Live Preview widgets for `[[wiki]]` links and `![[embed]]` image/note embeds.
 */

import { RangeSetBuilder, StateEffect, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  createAttachmentResolverContext,
  resolveAttachmentTarget,
} from "../../../utils/attachmentResolver";
import { isImageAttachment } from "../preview/previewMedia";
import {
  getCachedPreviewImageSrc,
  resolvePreviewSource,
} from "../../../utils/previewImageCache";
import { renderMarkdown } from "../../../utils/markdown";
import {
  extractWikiNoteFragment,
  parseWikiLinkReference,
  resolveWikiLinkFile,
} from "../../../utils/wikiLinks";
import { isLargeEditorState } from "../hooks/codeMirrorHelpers";
import { livePreviewContextFacet } from "./context";
import {
  collectWikiLinkRanges,
  defineLivePreviewBlockDecorationField,
  hasSkipAncestor,
  livePreviewContextChanged,
  livePreviewShouldRebuild,
  selectionTouchesRange,
} from "./shared";

const wikiImageResolvedEffect = StateEffect.define<{
  cacheKey: string;
  src: string;
}>();

const NOTE_EMBED_MAX_CHARS = 2400;

class WikiLinkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly target: string,
    readonly resolved: boolean,
  ) {
    super();
  }

  eq(other: WikiLinkWidget) {
    return (
      this.label === other.label &&
      this.target === other.target &&
      this.resolved === other.resolved
    );
  }

  toDOM(view: EditorView) {
    const el = document.createElement("a");
    el.className = this.resolved
      ? "cm-live-preview-wiki"
      : "cm-live-preview-wiki is-unresolved";
    el.href = "#";
    el.setAttribute("contenteditable", "false");
    el.textContent = this.label;
    el.addEventListener("mousedown", (event) => {
      if (event.button === 0) event.preventDefault();
    });
    el.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const ctx = view.state.facet(livePreviewContextFacet);
      void ctx.onOpenWiki?.(this.target);
    });
    return el;
  }

  ignoreEvent(event: Event) {
    return event.type !== "click" && event.type !== "mousedown";
  }
}

class WikiImageWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly rawSrc: string,
    readonly resolvedSrc: string | null,
    readonly from: number,
    readonly to: number,
    readonly width?: number,
    readonly height?: number,
  ) {
    super();
  }

  eq(other: WikiImageWidget) {
    return (
      this.label === other.label &&
      this.rawSrc === other.rawSrc &&
      this.resolvedSrc === other.resolvedSrc &&
      this.from === other.from &&
      this.to === other.to &&
      this.width === other.width &&
      this.height === other.height
    );
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-live-preview-image-wrap cm-live-preview-wiki-embed";
    wrap.setAttribute("contenteditable", "false");
    wrap.title = `![[${this.rawSrc}]]`;

    const img = document.createElement("img");
    img.className = "cm-live-preview-image";
    img.alt = this.label;
    img.draggable = false;
    if (this.width) img.style.width = `${this.width}px`;
    if (this.height) img.style.height = `${this.height}px`;
    if (this.resolvedSrc) {
      img.src = this.resolvedSrc;
    } else {
      wrap.classList.add("is-loading");
    }
    wrap.appendChild(img);

    wrap.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
    });
    wrap.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const from = this.from;
      const to = this.to;
      window.setTimeout(() => {
        view.focus();
        view.dispatch({
          selection: { anchor: from, head: to },
          scrollIntoView: true,
        });
      }, 0);
    });

    return wrap;
  }

  ignoreEvent(event: Event) {
    return event.type !== "mousedown" && event.type !== "click";
  }
}

class WikiNoteEmbedWidget extends WidgetType {
  constructor(
    readonly title: string,
    readonly target: string,
    readonly bodyHtml: string,
  ) {
    super();
  }

  eq(other: WikiNoteEmbedWidget) {
    return (
      this.title === other.title &&
      this.target === other.target &&
      this.bodyHtml === other.bodyHtml
    );
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-live-preview-note-embed";
    wrap.setAttribute("contenteditable", "false");

    const title = document.createElement("a");
    title.className = "cm-live-preview-note-embed-title";
    title.href = "#";
    title.textContent = this.title;
    title.addEventListener("mousedown", (event) => {
      if (event.button === 0) event.preventDefault();
    });
    title.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const ctx = view.state.facet(livePreviewContextFacet);
      void ctx.onOpenWiki?.(this.target);
    });
    wrap.appendChild(title);

    if (this.bodyHtml.trim()) {
      const body = document.createElement("div");
      body.className = "cm-live-preview-note-embed-body markdown-body";
      body.innerHTML = this.bodyHtml;
      wrap.appendChild(body);
    }

    return wrap;
  }

  ignoreEvent(event: Event) {
    return event.type !== "click" && event.type !== "mousedown";
  }
}

function cacheKeyFor(sourceFilePath: string | null, raw: string): string {
  return `wiki::${sourceFilePath ?? ""}::${raw}`;
}

async function resolveNoteEmbedHtml(
  view: EditorView,
  raw: string,
  matchedPath: string | null,
): Promise<{ title: string; html: string }> {
  const ctx = view.state.facet(livePreviewContextFacet);
  let content: string | null = null;
  if (matchedPath && ctx.getFileContent) {
    content = await ctx.getFileContent(matchedPath);
  }
  if (!content) {
    return { title: parseWikiLinkReference(raw).displayText, html: "" };
  }
  const fragment = extractWikiNoteFragment(content, raw);
  let markdown = fragment.markdown ?? "";
  if (markdown.length > NOTE_EMBED_MAX_CHARS) {
    markdown = `${markdown.slice(0, NOTE_EMBED_MAX_CHARS).trimEnd()}\n\n…`;
  }
  let html = "";
  try {
    html = markdown.trim() ? renderMarkdown(markdown) : "";
  } catch {
    html = "";
  }
  return {
    title: fragment.title || parseWikiLinkReference(raw).displayText,
    html,
  };
}

const noteEmbedCache = new Map<string, { title: string; html: string }>();
const wikiImageResolvedCache = new Map<string, string>();
const wikiPending = new Set<string>();

export function buildWikiDecorations(
  state: EditorState,
  scheduleResolve: (cacheKey: string, path: string) => void = () => {},
  scheduleNoteEmbed: (
    cacheKey: string,
    raw: string,
    path: string | null,
  ) => void = () => {},
  resolvedCache: Map<string, string> = wikiImageResolvedCache,
): DecorationSet {
  if (isLargeEditorState(state)) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const ctx = state.facet(livePreviewContextFacet);
  const docText = state.doc.toString();
  const ranges = collectWikiLinkRanges(docText, 0, docText.length);

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  let lastTo = -1;

  for (const range of ranges) {
    if (range.from < lastTo) continue;
    if (selectionTouchesRange(state, range.from, range.to)) continue;
    if (hasSkipAncestor(state, range.from)) continue;
    if (!range.raw) continue;

    const parsed = parseWikiLinkReference(range.raw, { embed: range.embed });
    const matched = resolveWikiLinkFile(
      ctx.files,
      parsed.path || parsed.target,
      ctx.rootFolderPath,
      ctx.sourceFilePath,
    );

    if (range.embed) {
      const looksLikeImage =
        isImageAttachment(parsed.path) ||
        isImageAttachment(parsed.target) ||
        (matched ? isImageAttachment(matched.name) : false);

      if (looksLikeImage) {
        const key = cacheKeyFor(ctx.sourceFilePath, range.raw);
        const pathHint = matched?.path ?? (parsed.path || parsed.target);
        const resolvedSrc =
          resolvedCache.get(key) ??
          getCachedPreviewImageSrc(pathHint, ctx.sourceFilePath ?? undefined) ??
          null;

        if (!resolvedSrc) {
          scheduleResolve(key, pathHint);
        }

        builder.add(
          range.from,
          range.to,
          Decoration.replace({
            widget: new WikiImageWidget(
              parsed.displayText,
              range.raw,
              resolvedSrc,
              range.from,
              range.to,
              parsed.embedSize?.width,
              parsed.embedSize?.height,
            ),
          }),
        );
        lastTo = range.to;
        continue;
      }

      const noteKey = `note::${ctx.sourceFilePath ?? ""}::${range.raw}`;
      const cached = noteEmbedCache.get(noteKey);
      if (!cached) {
        scheduleNoteEmbed(noteKey, range.raw, matched?.path ?? null);
      }

      builder.add(
        range.from,
        range.to,
        Decoration.replace({
          widget: new WikiNoteEmbedWidget(
            cached?.title ?? parsed.displayText,
            parsed.target,
            cached?.html ?? "",
          ),
          block: true,
        }),
      );
      lastTo = range.to;
      continue;
    }

    builder.add(
      range.from,
      range.to,
      Decoration.replace({
        widget: new WikiLinkWidget(
          parsed.displayText,
          parsed.target,
          Boolean(matched),
        ),
      }),
    );
    lastTo = range.to;
  }

  return builder.finish();
}

/** Test/helper wrapper — schedules are optional no-ops by default. */
export function buildLivePreviewWikiDecorations(
  view: EditorView,
  resolvedCache: Map<string, string> = wikiImageResolvedCache,
  scheduleResolve: (cacheKey: string, path: string) => void = () => {},
  scheduleNoteEmbed: (
    cacheKey: string,
    raw: string,
    path: string | null,
  ) => void = () => {},
): DecorationSet {
  return buildWikiDecorations(
    view.state,
    scheduleResolve,
    scheduleNoteEmbed,
    resolvedCache,
  );
}

const wikiDecorationsField = defineLivePreviewBlockDecorationField({
  create: (state) => buildWikiDecorations(state),
  rebuildOn: (tr) =>
    tr.effects.some((effect) => effect.is(wikiImageResolvedEffect)),
});

const wikiAsyncPlugin = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.scan(view);
    }

    private scheduleResolve(view: EditorView, cacheKey: string, pathHint: string) {
      if (wikiPending.has(cacheKey) || wikiImageResolvedCache.has(cacheKey)) {
        return;
      }
      wikiPending.add(cacheKey);
      const ctx = view.state.facet(livePreviewContextFacet);

      void (async () => {
        try {
          const resolverCtx = createAttachmentResolverContext(
            ctx.files,
            ctx.rootFolderPath,
            ctx.sourceFilePath,
          );
          const resolved = await resolveAttachmentTarget(resolverCtx, pathHint);
          const pathOrSrc = resolved?.path ?? pathHint;
          const displaySrc = await resolvePreviewSource(
            pathOrSrc,
            ctx.sourceFilePath ?? undefined,
          );
          wikiImageResolvedCache.set(cacheKey, displaySrc);
          if (view.dom.isConnected) {
            view.dispatch({
              effects: wikiImageResolvedEffect.of({
                cacheKey,
                src: displaySrc,
              }),
            });
          }
        } catch {
          // Keep loading placeholder.
        } finally {
          wikiPending.delete(cacheKey);
        }
      })();
    }

    private scheduleNoteEmbed(
      view: EditorView,
      cacheKey: string,
      raw: string,
      path: string | null,
    ) {
      if (wikiPending.has(cacheKey) || noteEmbedCache.has(cacheKey)) return;
      wikiPending.add(cacheKey);
      void (async () => {
        try {
          const result = await resolveNoteEmbedHtml(view, raw, path);
          noteEmbedCache.set(cacheKey, result);
          if (view.dom.isConnected) {
            view.dispatch({
              effects: wikiImageResolvedEffect.of({
                cacheKey,
                src: "note",
              }),
            });
          }
        } finally {
          wikiPending.delete(cacheKey);
        }
      })();
    }

    private scan(view: EditorView) {
      if (isLargeEditorState(view.state)) return;
      buildWikiDecorations(
        view.state,
        (cacheKey, path) => this.scheduleResolve(view, cacheKey, path),
        (cacheKey, raw, path) =>
          this.scheduleNoteEmbed(view, cacheKey, raw, path),
      );
    }

    update(update: ViewUpdate) {
      if (
        livePreviewShouldRebuild(update, "marks") ||
        livePreviewContextChanged(update) ||
        update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(wikiImageResolvedEffect)),
        )
      ) {
        this.scan(update.view);
      }
    }
  },
);

export const livePreviewWiki = [wikiDecorationsField, wikiAsyncPlugin];
