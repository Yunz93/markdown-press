import type { AppSettings } from '../types';
import bundledChineseFontUrl from '../assets/fonts/LXGWWenKai-Regular.ttf?url';

const DYNAMIC_FONT_STYLE_ID = 'markdown-press-dynamic-font-faces';
const LATIN_FONT_ALIAS = 'MarkdownPressLatin';
const BUNDLED_CHINESE_FONT_NAMES = ['LXGW WenKai', '霞鹜文楷'];
export type FontSettings = Pick<AppSettings, 'englishFontFamily' | 'chineseFontFamily'>;

const GENERIC_FONT_FAMILIES = new Set([
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
]);

export const DEFAULT_ENGLISH_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const LEGACY_DEFAULT_CHINESE_FONT_FAMILY = '"FZ XingHeiS-R-GB", "方正行黑简体", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';
export const DEFAULT_CHINESE_FONT_FAMILY = '"LXGW WenKai", "霞鹜文楷", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';

function parseLocalFontNames(fontFamily: string): string[] {
  return fontFamily
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter((item) => item.length > 0 && !GENERIC_FONT_FAMILIES.has(item.toLowerCase()));
}

function escapeFontName(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildLocalFontSource(fontFamily: string): string {
  const localNames = parseLocalFontNames(fontFamily);
  if (localNames.length === 0) {
    return 'local("Arial")';
  }

  return localNames.map((name) => `local("${escapeFontName(name)}")`).join(', ');
}

function normalizeFontFamily(fontFamily: string): string {
  return fontFamily
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
    .filter(Boolean)
    .join(',');
}

function fontFamilyMentionsBundledChineseFont(fontFamily: string): boolean {
  const normalizedFontNames = new Set(
    fontFamily
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
      .filter(Boolean)
  );

  return BUNDLED_CHINESE_FONT_NAMES.some((name) => normalizedFontNames.has(name.toLowerCase()));
}

function buildBundledChineseFontFaces(bundledFontSrc: string): string {
  const bundledSource = `${BUNDLED_CHINESE_FONT_NAMES
    .map((name) => `local("${escapeFontName(name)}")`)
    .join(', ')}, url("${bundledFontSrc}") format("truetype")`;

  return BUNDLED_CHINESE_FONT_NAMES.map((fontName) => `
@font-face {
  font-family: "${escapeFontName(fontName)}";
  src: ${bundledSource};
  unicode-range:
    U+2E80-2EFF,
    U+2F00-2FDF,
    U+3000-303F,
    U+31C0-31EF,
    U+3400-4DBF,
    U+4E00-9FFF,
    U+F900-FAFF,
    U+FF00-FFEF;
  font-display: swap;
}
`.trim()).join('\n\n');
}

export function isLegacyDefaultChineseFontFamily(fontFamily: string): boolean {
  return normalizeFontFamily(fontFamily) === normalizeFontFamily(LEGACY_DEFAULT_CHINESE_FONT_FAMILY);
}

export function getResolvedEnglishFontFamily(settings: Pick<AppSettings, 'englishFontFamily'>): string {
  return settings.englishFontFamily?.trim() || DEFAULT_ENGLISH_FONT_FAMILY;
}

export function getResolvedChineseFontFamily(settings: Pick<AppSettings, 'chineseFontFamily'>): string {
  return settings.chineseFontFamily?.trim() || DEFAULT_CHINESE_FONT_FAMILY;
}

export function getCompositeFontFamily(
  settings: FontSettings
): string {
  const englishFontFamily = getResolvedEnglishFontFamily(settings);
  const chineseFontFamily = getResolvedChineseFontFamily(settings);

  return `"${LATIN_FONT_ALIAS}", ${chineseFontFamily}, ${englishFontFamily}, sans-serif`;
}

export function usesBundledChineseFont(settings: Pick<AppSettings, 'chineseFontFamily'>): boolean {
  return fontFamilyMentionsBundledChineseFont(getResolvedChineseFontFamily(settings));
}

export function getBundledChineseFontAssetUrl(): string {
  return bundledChineseFontUrl;
}

export function buildDynamicFontFaceCss(
  settings: FontSettings,
  options: {
    bundledChineseFontSrc?: string;
  } = {}
): string {
  const englishFontFamily = getResolvedEnglishFontFamily(settings);
  const bundledChineseFontSrc = options.bundledChineseFontSrc || bundledChineseFontUrl;

  return `
${buildBundledChineseFontFaces(bundledChineseFontSrc)}

@font-face {
  font-family: "${LATIN_FONT_ALIAS}";
  src: ${buildLocalFontSource(englishFontFamily)};
  unicode-range:
    U+0000-00FF,
    U+0100-024F,
    U+0259,
    U+1E00-1EFF,
    U+2000-206F;
  font-display: swap;
}
`.trim();
}

export function ensureDynamicFontFaces(
  settings: FontSettings
): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();

  const css = buildDynamicFontFaceCss(settings);

  let styleElement = document.getElementById(DYNAMIC_FONT_STYLE_ID) as HTMLStyleElement | null;
  const cssChanged = !styleElement || styleElement.textContent !== css;
  
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = DYNAMIC_FONT_STYLE_ID;
    document.head.appendChild(styleElement);
  }

  if (cssChanged) {
    styleElement.textContent = css;
  }

  // Wait for fonts to load if CSS changed or fonts not yet loaded
  if (cssChanged && typeof document !== 'undefined' && 'fonts' in document) {
    const pendingLoads: Promise<FontFace[]>[] = [
      document.fonts.load(`1em "${LATIN_FONT_ALIAS}"`, 'A'),
    ];

    const chineseFontFamily = getResolvedChineseFontFamily(settings);
    if (usesBundledChineseFont(settings)) {
      pendingLoads.push(document.fonts.load(`1em ${chineseFontFamily}`, '测'));
    }

    return Promise.all(pendingLoads).then(() => undefined);
  }
  
  return Promise.resolve();
}
