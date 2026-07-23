import type { Extension } from "@codemirror/state";
import {
  EMPTY_LIVE_PREVIEW_CONTEXT,
  livePreviewContextFacet,
  type LivePreviewContext,
} from "./context";
import {
  livePreviewHideFormatting,
  livePreviewTheme,
} from "./hideFormattingMarks";
import { livePreviewImages } from "./images";
import { livePreviewMath } from "./math";
import { livePreviewTaskCheckboxes } from "./taskCheckboxes";
import { livePreviewWiki } from "./wiki";
import { livePreviewTables } from "./tables";
import { livePreviewCallouts } from "./callouts";
import { livePreviewMermaid } from "./mermaid";
import {
  livePreviewHighlights,
  livePreviewListMarkers,
} from "./listAndHighlight";
import { livePreviewLinks } from "./links";

export type { LivePreviewContext };
export { EMPTY_LIVE_PREVIEW_CONTEXT, livePreviewContextFacet };

/** Context facet only — update without remounting Live Preview plugins. */
export function createLivePreviewContextExtension(
  context: LivePreviewContext = EMPTY_LIVE_PREVIEW_CONTEXT,
): Extension {
  return livePreviewContextFacet.of(context);
}

/**
 * Stable Live Preview ViewPlugins / theme.
 * Keep these in a separate compartment from context so file-tree / callback
 * churn does not destroy widgets and yank scroll/caret on click.
 */
export function createLivePreviewPluginExtensions(): Extension[] {
  return [
    livePreviewTheme,
    livePreviewHideFormatting,
    livePreviewTaskCheckboxes,
    livePreviewListMarkers,
    livePreviewImages,
    livePreviewLinks,
    livePreviewMath,
    livePreviewWiki,
    livePreviewTables,
    livePreviewCallouts,
    livePreviewMermaid,
    livePreviewHighlights,
  ];
}

/** Full Live Preview extension set for CodeMirror (initial mount). */
export function createLivePreviewExtensions(
  context: LivePreviewContext = EMPTY_LIVE_PREVIEW_CONTEXT,
): Extension[] {
  return [
    createLivePreviewContextExtension(context),
    ...createLivePreviewPluginExtensions(),
  ];
}

export {
  buildLivePreviewHideDecorations,
  livePreviewHideFormatting,
} from "./hideFormattingMarks";
export {
  buildLivePreviewTaskDecorations,
  livePreviewTaskCheckboxes,
} from "./taskCheckboxes";
export { buildLivePreviewImageDecorations, livePreviewImages } from "./images";
export {
  buildLivePreviewMathDecorations,
  findMathRangesInText,
  livePreviewMath,
} from "./math";
export { buildLivePreviewWikiDecorations, livePreviewWiki } from "./wiki";
export { buildLivePreviewTableDecorations, livePreviewTables } from "./tables";
export {
  buildLivePreviewCalloutDecorations,
  findCalloutRanges,
  livePreviewCallouts,
} from "./callouts";
export { livePreviewMermaid } from "./mermaid";
export {
  buildLivePreviewHighlightDecorations,
  buildLivePreviewListMarkerDecorations,
  findHighlightRanges,
  livePreviewHighlights,
  livePreviewListMarkers,
} from "./listAndHighlight";
export { buildLivePreviewLinkDecorations, livePreviewLinks } from "./links";
