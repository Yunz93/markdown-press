/**
 * Live Preview image widgets for `![alt](url)` markdown images.
 */

import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  createAttachmentResolverContext,
  resolveAttachmentTarget,
} from "../../../utils/attachmentResolver";
import { hasUriScheme } from "../preview/previewMedia";
import {
  getCachedPreviewImageSrc,
  resolvePreviewSource,
} from "../../../utils/previewImageCache";
import { isLargeEditorState } from "../hooks/codeMirrorHelpers";
import { livePreviewContextFacet } from "./context";
import {
  collectWikiLinkRanges,
  hasSkipAncestor,
  livePreviewContextChanged,
  rangesOverlap,
  selectionTouchesRange,
  livePreviewShouldRebuild,
} from "./shared";

const imageResolvedEffect = StateEffect.define<{
  cacheKey: string;
  src: string;
}>();

function isDirectDisplaySrc(url: string): boolean {
  return (
    hasUriScheme(url) || url.startsWith("data:") || url.startsWith("blob:")
  );
}

function cacheKeyFor(sourceFilePath: string | null, rawSrc: string): string {
  return `${sourceFilePath ?? ""}::${rawSrc}`;
}

class MarkdownImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly rawSrc: string,
    readonly resolvedSrc: string | null,
    readonly from: number,
    readonly to: number,
    readonly urlFrom: number,
    readonly urlTo: number,
  ) {
    super();
  }

  eq(other: MarkdownImageWidget) {
    return (
      this.alt === other.alt &&
      this.rawSrc === other.rawSrc &&
      this.resolvedSrc === other.resolvedSrc &&
      this.from === other.from &&
      this.to === other.to &&
      this.urlFrom === other.urlFrom &&
      this.urlTo === other.urlTo
    );
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-live-preview-image-wrap";
    wrap.setAttribute("contenteditable", "false");
    wrap.title = this.rawSrc;

    const img = document.createElement("img");
    img.className = "cm-live-preview-image";
    img.alt = this.alt || this.rawSrc;
    img.draggable = false;
    if (this.resolvedSrc) {
      img.src = this.resolvedSrc;
    } else {
      wrap.classList.add("is-loading");
    }
    wrap.appendChild(img);

    const revealSource = () => {
      const urlFrom = this.urlFrom;
      const urlTo = this.urlTo;
      const from = this.from;
      const to = this.to;
      view.focus();
      // Cover the whole image construct so replace widgets drop on rebuild.
      // Selecting a sub-range inside an active replace decoration collapses.
      view.dispatch({
        selection: { anchor: from, head: to },
        scrollIntoView: true,
      });
      if (urlFrom < urlTo) {
        requestAnimationFrame(() => {
          if (!view.dom.isConnected) return;
          view.dispatch({
            selection: { anchor: urlFrom, head: urlTo },
            scrollIntoView: true,
          });
        });
      }
    };

    wrap.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      // Prevent CM from applying a DOM selection inside the replaced range.
      event.preventDefault();
      event.stopPropagation();
    });
    wrap.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Defer past CM's DOM selection flush from this click.
      window.setTimeout(revealSource, 0);
    });

    return wrap;
  }

  ignoreEvent(event: Event) {
    return event.type !== "mousedown" && event.type !== "click";
  }
}

function extractImageParts(
  state: Parameters<typeof syntaxTree>[0],
  imageFrom: number,
  imageTo: number,
): { alt: string; url: string; urlFrom: number; urlTo: number } {
  const tree = syntaxTree(state);
  let url = "";
  let urlFrom = imageFrom;
  let urlTo = imageFrom;

  tree.iterate({
    from: imageFrom,
    to: imageTo,
    enter: (node) => {
      if (node.name === "URL") {
        url = state.doc.sliceString(node.from, node.to);
        urlFrom = node.from;
        urlTo = node.to;
      }
    },
  });

  const full = state.doc.sliceString(imageFrom, imageTo);
  const altMatch = full.match(/^!\[([^\]]*)\]/);
  if (!url) {
    const paren = full.match(/\(([^)]*)\)\s*$/);
    if (paren) {
      url = paren[1].trim();
      urlFrom = imageFrom + (paren.index ?? 0) + 1;
      urlTo = urlFrom + paren[1].length;
    }
  }
  return {
    alt: altMatch?.[1] ?? "",
    url: url.trim(),
    urlFrom,
    urlTo,
  };
}

export function buildLivePreviewImageDecorations(
  view: EditorView,
  resolvedCache: Map<string, string>,
  scheduleResolve: (cacheKey: string, rawSrc: string) => void,
): DecorationSet {
  if (isLargeEditorState(view.state)) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;
  const ctx = state.facet(livePreviewContextFacet);
  const tree =
    ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state);
  const docText = state.doc.toString();

  const wikiRanges = view.visibleRanges.flatMap(({ from, to }) =>
    collectWikiLinkRanges(
      docText,
      Math.max(0, from - 2),
      Math.min(docText.length, to + 2),
    ),
  );

  for (const { from: viewportFrom, to: viewportTo } of view.visibleRanges) {
    tree.iterate({
      from: viewportFrom,
      to: viewportTo,
      enter: (node) => {
        if (node.name !== "Image") return;
        const { from, to } = node;
        if (from >= to) return;
        if (hasSkipAncestor(state, from)) return;
        if (selectionTouchesRange(state, from, to)) return;
        if (wikiRanges.some((w) => rangesOverlap(from, to, w.from, w.to))) {
          return;
        }

        const { alt, url, urlFrom, urlTo } = extractImageParts(state, from, to);
        if (!url) return;

        const key = cacheKeyFor(ctx.sourceFilePath, url);
        let resolvedSrc =
          resolvedCache.get(key) ??
          getCachedPreviewImageSrc(url, ctx.sourceFilePath ?? undefined) ??
          null;

        if (!resolvedSrc && isDirectDisplaySrc(url)) {
          resolvedSrc = url;
          resolvedCache.set(key, url);
        } else if (!resolvedSrc) {
          scheduleResolve(key, url);
        }

        builder.add(
          from,
          to,
          Decoration.replace({
            widget: new MarkdownImageWidget(
              alt,
              url,
              resolvedSrc,
              from,
              to,
              urlFrom,
              urlTo,
            ),
          }),
        );
      },
    });
  }

  return builder.finish();
}

export const livePreviewImages = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private resolvedCache = new Map<string, string>();
    private pending = new Set<string>();

    constructor(view: EditorView) {
      this.decorations = this.rebuild(view);
    }

    private scheduleResolve(
      view: EditorView,
      cacheKey: string,
      rawSrc: string,
    ) {
      if (this.pending.has(cacheKey) || this.resolvedCache.has(cacheKey)) {
        return;
      }
      this.pending.add(cacheKey);

      const ctx = view.state.facet(livePreviewContextFacet);
      void (async () => {
        try {
          let pathOrSrc = rawSrc;
          if (!hasUriScheme(rawSrc)) {
            const resolverCtx = createAttachmentResolverContext(
              ctx.files,
              ctx.rootFolderPath,
              ctx.sourceFilePath,
            );
            const resolved = await resolveAttachmentTarget(resolverCtx, rawSrc);
            if (resolved?.path) {
              pathOrSrc = resolved.path;
            }
          }
          const displaySrc = await resolvePreviewSource(
            pathOrSrc,
            ctx.sourceFilePath ?? undefined,
          );
          this.resolvedCache.set(cacheKey, displaySrc);
          if (view.dom.isConnected) {
            view.dispatch({
              effects: imageResolvedEffect.of({
                cacheKey,
                src: displaySrc,
              }),
            });
          }
        } catch {
          // Keep placeholder until the user edits the source.
        } finally {
          this.pending.delete(cacheKey);
        }
      })();
    }

    private rebuild(view: EditorView) {
      return buildLivePreviewImageDecorations(
        view,
        this.resolvedCache,
        (cacheKey, rawSrc) => this.scheduleResolve(view, cacheKey, rawSrc),
      );
    }

    update(update: ViewUpdate) {
      let resolved = false;
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(imageResolvedEffect)) {
            this.resolvedCache.set(effect.value.cacheKey, effect.value.src);
            resolved = true;
          }
        }
      }

      if (
        resolved ||
        // Selection must rebuild immediately so click-to-reveal source works
        // on the same line as the image widget.
        livePreviewShouldRebuild(update, "marks") ||
        livePreviewContextChanged(update)
      ) {
        this.decorations = this.rebuild(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);
