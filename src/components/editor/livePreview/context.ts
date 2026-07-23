import { Facet } from "@codemirror/state";
import type { FileNode } from "../../../types";

export interface LivePreviewContext {
  sourceFilePath: string | null;
  rootFolderPath: string | null;
  files: FileNode[];
}

export const EMPTY_LIVE_PREVIEW_CONTEXT: LivePreviewContext = {
  sourceFilePath: null,
  rootFolderPath: null,
  files: [],
};

export const livePreviewContextFacet = Facet.define<
  LivePreviewContext,
  LivePreviewContext
>({
  combine(values) {
    return values.length > 0
      ? values[values.length - 1]!
      : EMPTY_LIVE_PREVIEW_CONTEXT;
  },
});
