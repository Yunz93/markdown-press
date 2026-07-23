/**
 * Live Preview widgets for `[[wiki]]` links and `![[embed]]` image embeds.
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
import { syntaxTree } from "@codemirror/language";
import {
  createAttachmentResolverContext,
  resolveAttachmentTarget,
} from "../../../utils/attachmentResolver";
import { isImageAttachment } from "../preview/previewMedia";
import {
  getCachedPreviewImageSrc,
  resolvePreviewSource,
} from "../../../utils/previewImageCache";
import {
  parseWikiLinkReference,
  resolveWikiLinkFile,
} from "../../../utils/wikiLinks";
import { isLargeEditorState } from "../hooks/codeMirrorHelpers";
import { livePreviewContextFacet } from "./context";
import {
  collectWikiLinkRanges,
  hasSkipAncestor,
  selectionTouchesRange,
} from "./shared";

const wikiImageResolvedEffect = StateEffect.define<{
  cacheKey: string;
  src: string;
}>();

class WikiLinkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly resolved: boolean,
  ) {
    super();
  }

  eq(other: WikiLinkWidget) {
    return this.label === other.label && this.resolved === other.resolved;
  }

  toDOM() {
    const el = document.createElement("span");
    el.className = this.resolved
      ? "cm-live-preview-wiki"
      : "cm-live-preview-wiki is-unresolved";
    el.setAttribute("contenteditable", "false");
    el.textContent = this.label;
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

class WikiImageWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly rawSrc: string,
    readonly resolvedSrc: string | null,
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
      this.width === other.width &&
      this.height === other.height
    );
  }

  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-live-preview-image-wrap cm-live-preview-wiki-embed";
    wrap.setAttribute("contenteditable", "false");

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
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

function cacheKeyFor(sourceFilePath: string | null, raw: string): string {
  return `wiki::${sourceFilePath ?? ""}::${raw}`;
}

export function buildLivePreviewWikiDecorations(
  view: EditorView,
  resolvedCache: Map<string, string>,
  scheduleResolve: (cacheKey: string, path: string) => void,
): DecorationSet {
  if (isLargeEditorState(view.state)) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;
  const ctx = state.facet(livePreviewContextFacet);
  const docText = state.doc.toString();

  const ranges = view.visibleRanges.flatMap(({ from, to }) =>
    collectWikiLinkRanges(
      docText,
      Math.max(0, from - 2),
      Math.min(docText.length, to + 2),
    ),
  );

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  let lastTo = -1;

  for (const range of ranges) {
    if (range.from < lastTo) continue;
    if (selectionTouchesRange(state, range.from, range.to)) continue;
    if (hasSkipAncestor(state, range.from)) continue;
    if (!range.raw) continue;

    const parsed = parseWikiLinkReference(range.raw, { embed: range.embed });

    if (range.embed) {
      const matched = resolveWikiLinkFile(
        ctx.files,
        parsed.path || parsed.target,
        ctx.rootFolderPath,
        ctx.sourceFilePath,
      );
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
              parsed.embedSize?.width,
              parsed.embedSize?.height,
            ),
          }),
        );
        lastTo = range.to;
        continue;
      }

      // Non-image embeds: show a compact chip (full note embed is too heavy).
      builder.add(
        range.from,
        range.to,
        Decoration.replace({
          widget: new WikiLinkWidget(`↗ ${parsed.displayText}`, true),
        }),
      );
      lastTo = range.to;
      continue;
    }

    const matched = resolveWikiLinkFile(
      ctx.files,
      parsed.path || parsed.target,
      ctx.rootFolderPath,
      ctx.sourceFilePath,
    );
    builder.add(
      range.from,
      range.to,
      Decoration.replace({
        widget: new WikiLinkWidget(parsed.displayText, Boolean(matched)),
      }),
    );
    lastTo = range.to;
  }

  return builder.finish();
}

export const livePreviewWiki = ViewPlugin.fromClass(
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
      pathHint: string,
    ) {
      if (this.pending.has(cacheKey) || this.resolvedCache.has(cacheKey)) {
        return;
      }
      this.pending.add(cacheKey);
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
          this.resolvedCache.set(cacheKey, displaySrc);
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
          this.pending.delete(cacheKey);
        }
      })();
    }

    private rebuild(view: EditorView) {
      return buildLivePreviewWikiDecorations(
        view,
        this.resolvedCache,
        (cacheKey, path) => this.scheduleResolve(view, cacheKey, path),
      );
    }

    update(update: ViewUpdate) {
      let resolved = false;
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(wikiImageResolvedEffect)) {
            this.resolvedCache.set(effect.value.cacheKey, effect.value.src);
            resolved = true;
          }
        }
      }

      if (
        resolved ||
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = this.rebuild(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);
