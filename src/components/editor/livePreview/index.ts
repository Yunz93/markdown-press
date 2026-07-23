import type { Extension } from "@codemirror/state";
import {
  livePreviewHideFormatting,
  livePreviewTheme,
} from "./hideFormattingMarks";
import { livePreviewTaskCheckboxes } from "./taskCheckboxes";

/** Full Live Preview extension set for CodeMirror. */
export function createLivePreviewExtensions(): Extension {
  return [
    livePreviewTheme,
    livePreviewHideFormatting,
    livePreviewTaskCheckboxes,
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
