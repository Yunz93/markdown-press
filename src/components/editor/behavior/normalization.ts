/**
 * Markdown Behavior - List Normalization
 * Ordered list renumbering
 */

import type { EditorState, ChangeSpec } from "@codemirror/state";
import { getStrictOrderedListNormalizationChanges as computeNestedOrderedListNormalizationChanges } from "./nestedListBehavior";

export function getStrictOrderedListNormalizationChanges(
  state: EditorState,
): ChangeSpec[] | null {
  return computeNestedOrderedListNormalizationChanges(state);
}
