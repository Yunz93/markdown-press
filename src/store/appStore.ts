import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createFileSlice, type FileState, type FileActions } from "./fileStore";
import { createTabSlice, type TabState, type TabActions } from "./tabStore";
import {
  createEditorSlice,
  type EditorState,
  type EditorActions,
  selectContent,
} from "./editorStore";
import {
  createUISlice,
  type UIState,
  type UIActions,
  defaultSettings,
  normalizeLanguage,
  normalizeThemeMode,
} from "./uiStore";
import { normalizeMetadataFields } from "../utils/metadataFields";
import { normalizeTrashFolder } from "../utils/trashFolder";
import { normalizeWikiFolder } from "../utils/wikiGeneration";
import { normalizeMarkdownStylePreset } from "../utils/markdownStyle";
import {
  resolveLocalizedPrompts,
  resolvePersistedAISettings,
  resolvePersistedBlogRepoUrl,
  resolvePersistedBlogSiteUrl,
  resolvePersistedFontSettings,
  resolvePersistedShortcuts,
  sanitizeSettingsForPersistence,
  stripNonRuntimeSettings,
} from "./persistMigrations";

// Re-export types from slice stores
export type {
  FileState,
  FileActions,
  TabState,
  TabActions,
  EditorState,
  EditorActions,
  UIState,
  UIActions,
};
// Re-export selector for convenience
export { selectContent };
// Re-export default settings for convenience
export { defaultSettings };
// Re-export persistence migration helpers (kept here for backwards-compatible
// imports and unit tests).
export {
  resolveLocalizedPrompts,
  resolvePersistedAISettings,
  resolvePersistedFontSettings,
  stripNonRuntimeSettings,
} from "./persistMigrations";

// Complete AppState combines all slices
export interface AppState
  extends
    FileState,
    TabState,
    EditorState,
    UIState,
    FileActions,
    TabActions,
    EditorActions,
    UIActions {}

/**
 * Create the combined store using slice pattern
 */
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Combine all slice states and actions
      ...createFileSlice(set as any, get as any),
      ...createTabSlice(set as any, get as any),
      ...createEditorSlice(set as any, get as any),
      ...createUISlice(set as any, get as any),
    }),
    {
      name: "markdown-press-settings",
      partialize: (state) => ({
        settings: sanitizeSettingsForPersistence((state as any).settings),
      }),
      merge: (persistedState, currentState) => {
        const persistedSettings = stripNonRuntimeSettings(
          (persistedState as any)?.settings ?? {},
        );
        const resolvedAISettings =
          resolvePersistedAISettings(persistedSettings);
        const resolvedLocalizedPrompts =
          resolveLocalizedPrompts(persistedSettings);
        const resolvedFontSettings =
          resolvePersistedFontSettings(persistedSettings);
        const mergedSettings = {
          ...defaultSettings,
          ...persistedSettings,
          blogRepoUrl: resolvePersistedBlogRepoUrl(persistedSettings),
          blogSiteUrl: resolvePersistedBlogSiteUrl(persistedSettings),
          ...resolvedFontSettings,
          ...resolvedAISettings,
          ...resolvedLocalizedPrompts,
          language: normalizeLanguage(
            persistedSettings.language ?? defaultSettings.language,
          ),
          themeMode: normalizeThemeMode(
            persistedSettings.themeMode ?? defaultSettings.themeMode,
          ),
          markdownStylePreset: normalizeMarkdownStylePreset(
            persistedSettings.markdownStylePreset,
          ),
          wikiFolder: normalizeWikiFolder(
            typeof persistedSettings.wikiFolder === "string"
              ? persistedSettings.wikiFolder
              : defaultSettings.wikiFolder,
          ),
          trashFolder: normalizeTrashFolder(
            persistedSettings.trashFolder ?? defaultSettings.trashFolder,
          ),
          metadataFields: normalizeMetadataFields(
            persistedSettings.metadataFields,
          ),
          shortcuts: resolvePersistedShortcuts(persistedSettings),
        };

        return {
          ...currentState,
          ...(persistedState as any),
          settings: mergedSettings,
        };
      },
    },
  ),
);
