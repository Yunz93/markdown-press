import type { AppSettings } from '../types';

const DYNAMIC_FONT_STYLE_ID = 'markdown-press-dynamic-font-faces';
const LATIN_FONT_ALIAS = 'MarkdownPressLatin';
const CJK_FONT_ALIAS = 'MarkdownPressCJK';

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
export const DEFAULT_CHINESE_FONT_FAMILY = '"FZ XingHeiS-R-GB", "方正行黑简体", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';

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

export function getResolvedEnglishFontFamily(settings: Pick<AppSettings, 'englishFontFamily'>): string {
  return settings.englishFontFamily?.trim() || DEFAULT_ENGLISH_FONT_FAMILY;
}

export function getResolvedChineseFontFamily(settings: Pick<AppSettings, 'chineseFontFamily'>): string {
  return settings.chineseFontFamily?.trim() || DEFAULT_CHINESE_FONT_FAMILY;
}

export function getCompositeFontFamily(
  settings: Pick<AppSettings, 'englishFontFamily' | 'chineseFontFamily'>
): string {
  const englishFontFamily = getResolvedEnglishFontFamily(settings);
  const chineseFontFamily = getResolvedChineseFontFamily(settings);

  return `"${LATIN_FONT_ALIAS}", "${CJK_FONT_ALIAS}", ${englishFontFamily}, ${chineseFontFamily}, sans-serif`;
}

export function ensureDynamicFontFaces(
  settings: Pick<AppSettings, 'englishFontFamily' | 'chineseFontFamily'>
): void {
  if (typeof document === 'undefined') return;

  const englishFontFamily = getResolvedEnglishFontFamily(settings);
  const chineseFontFamily = getResolvedChineseFontFamily(settings);
  const css = `
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

@font-face {
  font-family: "${CJK_FONT_ALIAS}";
  src: ${buildLocalFontSource(chineseFontFamily)};
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
`.trim();

  let styleElement = document.getElementById(DYNAMIC_FONT_STYLE_ID) as HTMLStyleElement | null;
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = DYNAMIC_FONT_STYLE_ID;
    document.head.appendChild(styleElement);
  }

  if (styleElement.textContent !== css) {
    styleElement.textContent = css;
  }
}
