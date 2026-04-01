import type { AppSettings } from '../types';

const DYNAMIC_FONT_STYLE_ID = 'markdown-press-dynamic-font-faces';
const LATIN_FONT_ALIAS = 'MarkdownPressLatin';
const BUNDLED_CHINESE_FONT_NAMES = ['LXGW WenKai', '霞鹜文楷'];
export type FontSettings = Pick<AppSettings, 'englishFontFamily' | 'chineseFontFamily'>;

// Font URL cache
let cachedFontUrl: string | null = null;

/**
 * Get the bundled font URL - handles both web and Tauri environments
 * In Tauri production builds, resources are accessed via the resource:// protocol
 * or relative paths depending on the platform
 */
async function resolveBundledFontUrl(): Promise<string> {
  if (cachedFontUrl) return cachedFontUrl;
  
  // Check if running in Tauri
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__;
  
  if (isTauri) {
    try {
      // Dynamically import Tauri APIs
      const { resourceDir } = await import('@tauri-apps/api/path');
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      
      const resDir = await resourceDir();
      const fontPath = `${resDir}fonts/LXGWWenKai-Regular.ttf`;
      
      // Convert to a URL that can be loaded in the webview
      cachedFontUrl = convertFileSrc(fontPath);
      console.log('[fontSettings] Resolved Tauri font URL:', cachedFontUrl);
      return cachedFontUrl;
    } catch (error) {
      console.warn('[fontSettings] Failed to resolve Tauri font path:', error);
      // Fallback to relative path for resources
      cachedFontUrl = './resources/fonts/LXGWWenKai-Regular.ttf';
      return cachedFontUrl;
    }
  }
  
  // For web build, use Vite's asset handling
  try {
    // Import the font with ?url to get the processed URL
    const fontUrl = await import('../assets/fonts/LXGWWenKai-Regular.ttf?url').then(m => m.default);
    cachedFontUrl = fontUrl;
    return cachedFontUrl;
  } catch {
    // Fallback to relative path
    cachedFontUrl = './assets/LXGWWenKai-Regular.ttf';
    return cachedFontUrl;
  }
}

/**
 * Synchronous version - returns cached URL or default
 */
function getBundledFontUrl(): string {
  if (cachedFontUrl) return cachedFontUrl;
  
  // Return a placeholder that will be resolved asynchronously
  // The actual URL will be resolved by ensureDynamicFontFaces
  return '';
}

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

export function getBundledChineseFontAssetUrl(): Promise<string> {
  return resolveBundledFontUrl();
}

export function buildDynamicFontFaceCss(
  settings: FontSettings,
  options: {
    bundledChineseFontSrc?: string;
  } = {}
): string {
  const englishFontFamily = getResolvedEnglishFontFamily(settings);
  const bundledChineseFontSrc = options.bundledChineseFontSrc || getBundledFontUrl();

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

export async function ensureDynamicFontFaces(
  settings: FontSettings
): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();

  // Resolve the font URL first
  const fontUrl = await resolveBundledFontUrl();
  console.log('[fontSettings] Using bundled font URL:', fontUrl);

  const css = buildDynamicFontFaceCss(settings, { bundledChineseFontSrc: fontUrl });

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

    await Promise.all(pendingLoads);
  }
}
