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
  ) {
    super();
  }

  eq(other: MarkdownImageWidget) {
    return (
      this.alt === other.alt &&
      this.rawSrc === other.rawSrc &&
      this.resolvedSrc === other.resolvedSrc
    );
  }

  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-live-preview-image-wrap";
    wrap.setAttribute("contenteditable", "false");

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
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

function extractImageParts(
  state: Parameters<typeof syntaxTree>[0],
  imageFrom: number,
  imageTo: number,
): { alt: string; url: string } {
  const tree = syntaxTree(state);
  let url = "";

  tree.iterate({
    from: imageFrom,
    to: imageTo,
    enter: (node) => {
      if (node.name === "URL") {
        url = state.doc.sliceString(node.from, node.to);
      }
    },
  });

  const full = state.doc.sliceString(imageFrom, imageTo);
  const altMatch = full.match(/^!\[([^\]]*)\]/);
  return { alt: altMatch?.[1] ?? "", url: url.trim() };
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

        const { alt, url } = extractImageParts(state, from, to);
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
            widget: new MarkdownImageWidget(alt, url, resolvedSrc),
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
        livePreviewShouldRebuild(update, "widgets") ||
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
