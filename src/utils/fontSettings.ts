import type { AppSettings } from '../types';
import lxgwWenKaiAssetUrl from '../assets/fonts/LXGWWenKai-Regular.ttf?url';
import tsangerJinKaiAssetUrl from '../assets/fonts/TsangerJinKai02-W04.ttf?url';

const DYNAMIC_FONT_STYLE_ID = 'markdown-press-dynamic-font-faces';
const PRESET_PREFIX = 'preset:';
const SYSTEM_PREFIX = 'system:';

export type FontZone = 'ui' | 'content' | 'code';
export type FontSettings = Pick<
  AppSettings,
  'uiFontFamily' | 'editorFontFamily' | 'previewFontFamily' | 'codeFontFamily'
>;

export interface BundledFontPreset {
  id: string;
  label: string;
  assetUrl: string;
  fontFaceFamily: string;
  familyNames: string[];
}

export const BUNDLED_FONT_PRESETS: BundledFontPreset[] = [
  {
    id: `${PRESET_PREFIX}lxgw-wenkai`,
    label: 'LXGW WenKai',
    assetUrl: lxgwWenKaiAssetUrl,
    fontFaceFamily: 'MarkdownPressPresetLXGWWenKai',
    familyNames: ['LXGW WenKai', '霞鹜文楷'],
  },
  {
    id: `${PRESET_PREFIX}tsanger-jinkai`,
    label: 'Tsanger JinKai 02',
    assetUrl: tsangerJinKaiAssetUrl,
    fontFaceFamily: 'MarkdownPressPresetTsangerJinKai02',
    familyNames: [
      'TsangerJinKai02 W04',
      'TsangerJinKai02-W04',
      'TsangerJinKai02',
      '仓耳今楷02 W04',
      '仓耳今楷02',
    ],
  },
];

const presetById = new Map(BUNDLED_FONT_PRESETS.map((preset) => [preset.id, preset]));

const UI_FONT_FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const CONTENT_FONT_FALLBACK = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const CODE_FONT_FALLBACK = '"SFMono-Regular", "JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace';

export const DEFAULT_UI_FONT_FAMILY = `${PRESET_PREFIX}lxgw-wenkai`;
export const DEFAULT_EDITOR_FONT_FAMILY = `${PRESET_PREFIX}lxgw-wenkai`;
export const DEFAULT_PREVIEW_FONT_FAMILY = `${PRESET_PREFIX}lxgw-wenkai`;
export const DEFAULT_CODE_FONT_FAMILY = `${PRESET_PREFIX}lxgw-wenkai`;

function getZoneFallback(zone: FontZone): string {
  if (zone === 'ui') return UI_FONT_FALLBACK;
  if (zone === 'code') return CODE_FONT_FALLBACK;
  return CONTENT_FONT_FALLBACK;
}

function escapeFontName(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isGenericFontFamily(value: string): boolean {
  return new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'emoji',
    'math',
    'fangsong',
  ]).has(value.trim().toLowerCase());
}

function resolveAssetUrl(assetUrl: string): string {
  if (typeof window === 'undefined') {
    return assetUrl;
  }

  return assetUrl.startsWith('http') || assetUrl.startsWith('/')
    ? assetUrl
    : new URL(assetUrl, window.location.href).href;
}

function normalizeSingleFontSetting(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith(PRESET_PREFIX) || trimmed.startsWith(SYSTEM_PREFIX)) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase();
  const matchedPreset = BUNDLED_FONT_PRESETS.find((preset) => (
    preset.id.toLowerCase() === normalized
    || preset.fontFaceFamily.toLowerCase() === normalized
    || preset.familyNames.some((name) => name.toLowerCase() === normalized)
    || preset.familyNames.some((name) => normalized.includes(name.toLowerCase()))
  ));

  if (matchedPreset) {
    return matchedPreset.id;
  }

  if (normalized.includes('markdownpressbundled') || normalized.includes('markdownpresslatin')) {
    return fallback;
  }

  if (!trimmed.includes(',') && !isGenericFontFamily(trimmed)) {
    return `${SYSTEM_PREFIX}${trimmed}`;
  }

  return trimmed;
}

function resolveFontSettingToCss(fontSetting: string, zone: FontZone): string {
  if (fontSetting.startsWith(PRESET_PREFIX)) {
    const preset = presetById.get(fontSetting);
    if (!preset) return getZoneFallback(zone);
    return `"${escapeFontName(preset.fontFaceFamily)}", ${getZoneFallback(zone)}`;
  }

  if (fontSetting.startsWith(SYSTEM_PREFIX)) {
    const fontName = fontSetting.slice(SYSTEM_PREFIX.length).trim();
    return fontName
      ? `"${escapeFontName(fontName)}", ${getZoneFallback(zone)}`
      : getZoneFallback(zone);
  }

  if (fontSetting.includes(',') || isGenericFontFamily(fontSetting)) {
    return fontSetting;
  }

  return `"${escapeFontName(fontSetting)}", ${getZoneFallback(zone)}`;
}

function collectUsedPresetIds(settings: FontSettings): string[] {
  const normalizedValues = [
    normalizeStoredUiFontFamily(settings.uiFontFamily),
    normalizeStoredEditorFontFamily(settings.editorFontFamily),
    normalizeStoredPreviewFontFamily(settings.previewFontFamily),
    normalizeStoredCodeFontFamily(settings.codeFontFamily),
  ];

  return Array.from(new Set(
    normalizedValues.filter((value) => value.startsWith(PRESET_PREFIX))
  ));
}

function buildPresetFontFaceCss(
  preset: BundledFontPreset,
  assetUrl: string,
): string {
  const resolvedUrl = resolveAssetUrl(assetUrl);
  return [preset.fontFaceFamily, ...preset.familyNames].map((familyName) => `
@font-face {
  font-family: "${escapeFontName(familyName)}";
  src: url("${resolvedUrl}") format("truetype");
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}
`.trim()).join('\n\n');
}

export function normalizeStoredUiFontFamily(value: string | undefined): string {
  return normalizeSingleFontSetting(value, DEFAULT_UI_FONT_FAMILY);
}

export function normalizeStoredEditorFontFamily(value: string | undefined): string {
  return normalizeSingleFontSetting(value, DEFAULT_EDITOR_FONT_FAMILY);
}

export function normalizeStoredPreviewFontFamily(value: string | undefined): string {
  return normalizeSingleFontSetting(value, DEFAULT_PREVIEW_FONT_FAMILY);
}

export function normalizeStoredCodeFontFamily(value: string | undefined): string {
  return normalizeSingleFontSetting(value, DEFAULT_CODE_FONT_FAMILY);
}

export function buildSystemFontFamily(fontName: string): string {
  return `${SYSTEM_PREFIX}${fontName.trim()}`;
}

export function getResolvedUiFontFamily(settings: Pick<AppSettings, 'uiFontFamily'>): string {
  return resolveFontSettingToCss(normalizeStoredUiFontFamily(settings.uiFontFamily), 'ui');
}

export function getResolvedEditorFontFamily(settings: Pick<AppSettings, 'editorFontFamily'>): string {
  return resolveFontSettingToCss(normalizeStoredEditorFontFamily(settings.editorFontFamily), 'content');
}

export function getResolvedPreviewFontFamily(settings: Pick<AppSettings, 'previewFontFamily'>): string {
  return resolveFontSettingToCss(normalizeStoredPreviewFontFamily(settings.previewFontFamily), 'content');
}

export function getResolvedCodeFontFamily(settings: Pick<AppSettings, 'codeFontFamily'>): string {
  return resolveFontSettingToCss(normalizeStoredCodeFontFamily(settings.codeFontFamily), 'code');
}

export function getBundledPresetAssetUrl(presetId: string): string | null {
  return presetById.get(presetId)?.assetUrl ?? null;
}

export function buildDynamicFontFaceCss(
  settings: FontSettings,
  overrides: Partial<Record<string, string>> = {},
): string {
  return collectUsedPresetIds(settings)
    .map((presetId) => {
      const preset = presetById.get(presetId);
      if (!preset) return '';
      return buildPresetFontFaceCss(preset, overrides[presetId] ?? preset.assetUrl);
    })
    .filter(Boolean)
    .join('\n\n');
}

export async function ensureDynamicFontFaces(settings: FontSettings): Promise<void> {
  if (typeof document === 'undefined') return;

  const css = buildDynamicFontFaceCss(settings);
  let styleElement = document.getElementById(DYNAMIC_FONT_STYLE_ID) as HTMLStyleElement | null;

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = DYNAMIC_FONT_STYLE_ID;
    document.head.appendChild(styleElement);
  }

  if (styleElement.textContent !== css) {
    styleElement.textContent = css;
  }

  if (!css || !document.fonts) {
    return;
  }

  const loadTargets = collectUsedPresetIds(settings)
    .map((presetId) => presetById.get(presetId)?.fontFaceFamily)
    .filter((familyName): familyName is string => Boolean(familyName))
    .map((familyName) => document.fonts.load(`1em "${familyName}"`, 'Aa测'));

  await Promise.all(loadTargets);
}

export function buildPreviewExportFontFamily(settings: Pick<AppSettings, 'previewFontFamily'>): string {
  return getResolvedPreviewFontFamily(settings);
}

export function buildCodeExportFontFamily(settings: Pick<AppSettings, 'codeFontFamily'>): string {
  return getResolvedCodeFontFamily(settings);
}
