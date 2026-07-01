import type { AppSettings } from "../types";
import { defaultSettings } from "./uiStore";
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_PREVIEW_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  FONT_DEFAULTS_VERSION,
  LEGACY_DEFAULT_BUNDLED_FONT_FAMILY,
  LEGACY_DEFAULT_CODE_FONT_FAMILY,
  normalizeStoredCodeFontFamily,
  normalizeStoredEditorFontFamily,
  normalizeStoredPreviewFontFamily,
  normalizeStoredUiFontFamily,
} from "../utils/fontSettings";
import { normalizeBlogRepoUrl, normalizeBlogSiteUrl } from "../utils/blogRepo";
import { clampUiFontSize } from "../utils/uiFontSize";
import { normalizeShortcutConfigForPlatform } from "../utils/shortcuts";
import {
  DEFAULT_AI_SYSTEM_PROMPT,
  DEFAULT_AI_SYSTEM_PROMPT_EN,
  DEFAULT_WIKI_PROMPT_TEMPLATE,
  DEFAULT_WIKI_PROMPT_TEMPLATE_EN,
} from "../services/aiPrompts";
import { SENSITIVE_SETTING_KEYS } from "../services/sensitiveSettingKeys";

const REMOVED_SETTING_KEYS = ["exportStrikethroughMode"] as const;

function clampPersistedNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function resolveFirstValidNumber(
  settings: Record<string, unknown>,
  keys: string[],
  min: number,
  max: number,
  fallback: number,
): number {
  for (const key of keys) {
    const v = settings[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      return Math.min(max, Math.max(min, v));
    }
  }
  return fallback;
}

function resolveFirstValidString(
  settings: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const v = settings[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

type FontSettingNormalizer = (value: string | undefined) => string;

function shouldMigrateLegacyDefaultFonts(
  persistedSettings: Record<string, unknown>,
): boolean {
  const version = persistedSettings.fontDefaultsVersion;
  return typeof version !== "number" || version < FONT_DEFAULTS_VERSION;
}

function resolvePersistedFontFamily(
  value: unknown,
  normalize: FontSettingNormalizer,
  fallback: string,
  migrateLegacyDefaults: boolean,
): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const normalized = normalize(value);
  if (
    migrateLegacyDefaults &&
    (normalized === LEGACY_DEFAULT_BUNDLED_FONT_FAMILY ||
      normalized === LEGACY_DEFAULT_CODE_FONT_FAMILY)
  ) {
    return fallback;
  }

  return normalized;
}

export function resolvePersistedFontSettings(
  persistedSettings: Record<string, unknown>,
): Pick<
  AppSettings,
  | "fontDefaultsVersion"
  | "uiFontFamily"
  | "uiFontSize"
  | "editorFontFamily"
  | "previewFontFamily"
  | "codeFontFamily"
  | "fontSize"
> {
  const migrateLegacyDefaults =
    shouldMigrateLegacyDefaultFonts(persistedSettings);
  const legacyContentFontFamily = resolvePersistedFontFamily(
    resolveFirstValidString(persistedSettings, [
      "chineseFontFamily",
      "englishFontFamily",
      "fontFamily",
    ]),
    normalizeStoredEditorFontFamily,
    DEFAULT_EDITOR_FONT_FAMILY,
    migrateLegacyDefaults,
  );
  const legacyContentFontSize = clampPersistedNumber(
    persistedSettings.fontSize,
    12,
    32,
    16,
  );
  const resolvedSharedFontSize = resolveFirstValidNumber(
    persistedSettings,
    [
      "fontSize",
      "editorFontSize",
      "previewFontSize",
      "codeFontSize",
      "editorCodeFontSize",
      "previewCodeFontSize",
    ],
    11,
    32,
    legacyContentFontSize,
  );

  return {
    fontDefaultsVersion: FONT_DEFAULTS_VERSION,
    uiFontFamily: resolvePersistedFontFamily(
      persistedSettings.uiFontFamily,
      normalizeStoredUiFontFamily,
      DEFAULT_UI_FONT_FAMILY,
      migrateLegacyDefaults,
    ),
    uiFontSize:
      typeof persistedSettings.uiFontSize === "number" &&
      Number.isFinite(persistedSettings.uiFontSize)
        ? clampUiFontSize(persistedSettings.uiFontSize)
        : defaultSettings.uiFontSize,
    editorFontFamily: resolvePersistedFontFamily(
      persistedSettings.editorFontFamily,
      normalizeStoredEditorFontFamily,
      legacyContentFontFamily,
      migrateLegacyDefaults,
    ),
    previewFontFamily: resolvePersistedFontFamily(
      persistedSettings.previewFontFamily,
      normalizeStoredPreviewFontFamily,
      legacyContentFontFamily || DEFAULT_PREVIEW_FONT_FAMILY,
      migrateLegacyDefaults,
    ),
    codeFontFamily: resolvePersistedFontFamily(
      persistedSettings.codeFontFamily,
      normalizeStoredCodeFontFamily,
      DEFAULT_CODE_FONT_FAMILY,
      migrateLegacyDefaults,
    ),
    fontSize: resolvedSharedFontSize,
  };
}

export function stripNonRuntimeSettings(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = { ...settings };
  [...SENSITIVE_SETTING_KEYS, ...REMOVED_SETTING_KEYS].forEach((key) => {
    delete sanitized[key];
  });
  return sanitized;
}

export function sanitizeSettingsForPersistence(
  settings: AppSettings,
): AppSettings {
  return stripNonRuntimeSettings(
    settings as unknown as Record<string, unknown>,
  ) as unknown as AppSettings;
}

export function resolvePersistedBlogRepoUrl(
  persistedSettings: Record<string, unknown>,
): string {
  if (typeof persistedSettings.blogRepoUrl === "string") {
    const normalized = normalizeBlogRepoUrl(persistedSettings.blogRepoUrl);
    if (normalized) {
      return normalized;
    }
  }

  if (typeof persistedSettings.simpleBlogPath === "string") {
    const normalized = normalizeBlogRepoUrl(persistedSettings.simpleBlogPath);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

export function resolvePersistedBlogSiteUrl(
  persistedSettings: Record<string, unknown>,
): string {
  if (typeof persistedSettings.blogSiteUrl === "string") {
    return normalizeBlogSiteUrl(persistedSettings.blogSiteUrl);
  }

  return "";
}

function resolvePromptVariant(
  localizedValue: unknown,
  legacyValue: string,
  defaultZh: string,
  defaultEn: string,
  language: "zh-CN" | "en",
): string {
  if (typeof localizedValue === "string" && localizedValue.trim()) {
    return localizedValue;
  }

  const trimmedLegacyValue = legacyValue.trim();
  if (
    !trimmedLegacyValue ||
    trimmedLegacyValue === defaultZh.trim() ||
    trimmedLegacyValue === defaultEn.trim()
  ) {
    return language === "en" ? defaultEn : defaultZh;
  }

  return legacyValue;
}

export function resolveLocalizedPrompts(
  persistedSettings: Record<string, unknown>,
) {
  const legacySystemPrompt =
    typeof persistedSettings.aiSystemPrompt === "string"
      ? persistedSettings.aiSystemPrompt
      : "";
  const legacyWikiPrompt =
    typeof persistedSettings.wikiPromptTemplate === "string"
      ? persistedSettings.wikiPromptTemplate
      : "";

  const aiSystemPromptZh = resolvePromptVariant(
    persistedSettings.aiSystemPromptZh,
    legacySystemPrompt,
    DEFAULT_AI_SYSTEM_PROMPT,
    DEFAULT_AI_SYSTEM_PROMPT_EN,
    "zh-CN",
  );
  const aiSystemPromptEn = resolvePromptVariant(
    persistedSettings.aiSystemPromptEn,
    legacySystemPrompt,
    DEFAULT_AI_SYSTEM_PROMPT,
    DEFAULT_AI_SYSTEM_PROMPT_EN,
    "en",
  );
  const wikiPromptTemplateZh = resolvePromptVariant(
    persistedSettings.wikiPromptTemplateZh,
    legacyWikiPrompt,
    DEFAULT_WIKI_PROMPT_TEMPLATE,
    DEFAULT_WIKI_PROMPT_TEMPLATE_EN,
    "zh-CN",
  );
  const wikiPromptTemplateEn = resolvePromptVariant(
    persistedSettings.wikiPromptTemplateEn,
    legacyWikiPrompt,
    DEFAULT_WIKI_PROMPT_TEMPLATE,
    DEFAULT_WIKI_PROMPT_TEMPLATE_EN,
    "en",
  );

  return {
    aiSystemPrompt: legacySystemPrompt,
    aiSystemPromptZh,
    aiSystemPromptEn,
    wikiPromptTemplate: legacyWikiPrompt,
    wikiPromptTemplateZh,
    wikiPromptTemplateEn,
  };
}

function looksLikeGeminiModel(value: unknown): boolean {
  return typeof value === "string" && /^gemini(?:-|$)/i.test(value.trim());
}

function looksLikeOpenAIModel(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^(gpt-|o[1-9]\b|o[1-9]-|codex\b)/i.test(value.trim())
  );
}

function looksLikeDeepSeekModel(value: unknown): boolean {
  return typeof value === "string" && /^deepseek(?:-|$)/i.test(value.trim());
}

export function resolvePersistedAISettings(
  persistedSettings: Record<string, unknown>,
) {
  const persistedProvider =
    typeof persistedSettings.aiProvider === "string"
      ? persistedSettings.aiProvider
      : "";
  const persistedGeminiModel =
    typeof persistedSettings.geminiModel === "string"
      ? persistedSettings.geminiModel.trim()
      : "";
  const persistedCodexModel =
    typeof persistedSettings.codexModel === "string"
      ? persistedSettings.codexModel.trim()
      : "";
  const persistedDeepSeekModel =
    typeof persistedSettings.deepseekModel === "string"
      ? persistedSettings.deepseekModel.trim()
      : "";

  if (
    persistedProvider === "codex" ||
    persistedProvider === "gemini" ||
    persistedProvider === "deepseek"
  ) {
    return {
      aiProvider: persistedProvider,
      codexModel:
        persistedCodexModel ||
        (persistedProvider === "codex" &&
        looksLikeOpenAIModel(persistedGeminiModel)
          ? persistedGeminiModel
          : defaultSettings.codexModel),
      geminiModel: persistedGeminiModel || defaultSettings.geminiModel,
      deepseekModel:
        persistedDeepSeekModel ||
        (persistedProvider === "deepseek" &&
        looksLikeDeepSeekModel(persistedGeminiModel)
          ? persistedGeminiModel
          : defaultSettings.deepseekModel),
    };
  }

  if (!persistedDeepSeekModel && looksLikeDeepSeekModel(persistedGeminiModel)) {
    return {
      aiProvider: "deepseek",
      codexModel: persistedCodexModel || defaultSettings.codexModel,
      geminiModel: defaultSettings.geminiModel,
      deepseekModel: persistedGeminiModel || defaultSettings.deepseekModel,
    };
  }

  if (!persistedCodexModel && looksLikeOpenAIModel(persistedGeminiModel)) {
    return {
      aiProvider: "codex",
      codexModel:
        persistedCodexModel ||
        persistedGeminiModel ||
        defaultSettings.codexModel,
      geminiModel: looksLikeGeminiModel(persistedGeminiModel)
        ? persistedGeminiModel
        : defaultSettings.geminiModel,
      deepseekModel: persistedDeepSeekModel || defaultSettings.deepseekModel,
    };
  }

  if (looksLikeGeminiModel(persistedGeminiModel)) {
    return {
      aiProvider: "gemini",
      codexModel: persistedCodexModel || defaultSettings.codexModel,
      geminiModel: persistedGeminiModel || defaultSettings.geminiModel,
      deepseekModel: persistedDeepSeekModel || defaultSettings.deepseekModel,
    };
  }

  return {
    aiProvider: "deepseek",
    codexModel: persistedCodexModel || defaultSettings.codexModel,
    geminiModel: persistedGeminiModel || defaultSettings.geminiModel,
    deepseekModel: persistedDeepSeekModel || defaultSettings.deepseekModel,
  };
}

export function resolvePersistedShortcuts(
  persistedSettings: Record<string, unknown>,
) {
  const persistedShortcuts =
    persistedSettings.shortcuts &&
    typeof persistedSettings.shortcuts === "object"
      ? (persistedSettings.shortcuts as Record<string, unknown>)
      : {};

  const mergedShortcuts = {
    ...defaultSettings.shortcuts,
    ...persistedShortcuts,
  };

  const defaultShortcutMigrations: Partial<
    Record<keyof typeof mergedShortcuts, string[]>
  > = {
    aiAnalyze: ["Cmd+J", "Ctrl+J"],
    toggleView: ["Ctrl+E", "Cmd+Shift+V", "Ctrl+Shift+V"],
    search: ["Ctrl+F"],
    sidebarSearch: ["Ctrl+Shift+F"],
    settings: [
      "Ctrl+,",
      "Cmd+,",
      "Command+,",
      "Meta+,",
      "Cmd+Shift+0",
      "Ctrl+Shift+0",
    ],
    toggleOutline: ["Ctrl+O", "Cmd+Shift+O", "Ctrl+Shift+O"],
    toggleSidebar: ["Ctrl+B", "Cmd+Shift+B", "Ctrl+Shift+B"],
    toggleTheme: ["Ctrl+T", "Cmd+Shift+T", "Ctrl+Shift+T"],
    openKnowledgeBase: ["Ctrl+Shift+O"],
    exportPdf: ["Ctrl+Shift+E"],
  };

  (
    Object.keys(defaultShortcutMigrations) as Array<
      keyof typeof mergedShortcuts
    >
  ).forEach((key) => {
    const persistedValue = persistedShortcuts[key];
    const legacyValues = defaultShortcutMigrations[key] ?? [];

    if (
      persistedValue === undefined ||
      (typeof persistedValue === "string" &&
        legacyValues.includes(persistedValue))
    ) {
      mergedShortcuts[key] = defaultSettings.shortcuts[key];
    }
  });

  return normalizeShortcutConfigForPlatform(mergedShortcuts);
}
