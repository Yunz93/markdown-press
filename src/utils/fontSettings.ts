import type { AppSettings } from '../types';
import bundledFontAssetUrl from '../assets/fonts/TsangerJinKai02-W04.ttf?url';
import { isTauriEnvironment, waitForTauri } from '../types/filesystem';
import { traceStartup } from './startupTrace';

const DYNAMIC_FONT_STYLE_ID = 'markdown-press-dynamic-font-faces';
const LATIN_FONT_ALIAS = 'MarkdownPressLatin';
const BUNDLED_FONT_ALIAS = 'MarkdownPressBundled';
const BUNDLED_FONT_FILE_NAME = 'TsangerJinKai02-W04.ttf';
const BUNDLED_FONT_PRIMARY_NAME = 'TsangerJinKai02 W04';
const BUNDLED_FONT_LOCAL_NAMES = [
  BUNDLED_FONT_PRIMARY_NAME,
  'TsangerJinKai02-W04',
  'TsangerJinKai02',
  '仓耳今楷02 W04',
  '仓耳今楷02',
];
const BUNDLED_FONT_FAMILY_NAMES = [BUNDLED_FONT_ALIAS, ...BUNDLED_FONT_LOCAL_NAMES];
export type FontSettings = Pick<AppSettings, 'englishFontFamily' | 'chineseFontFamily'>;

// Font URL cache
let cachedFontUrl: string | null = null;

function resolveBundledFontAssetUrlFromVite(): string | null {
  try {
    const fontUrl = bundledFontAssetUrl;
    if (!fontUrl || typeof window === 'undefined') {
      return null;
    }

    return fontUrl.startsWith('http') || fontUrl.startsWith('/')
      ? fontUrl
      : new URL(fontUrl, window.location.href).href;
  } catch (error) {
    console.warn('[fontSettings] Failed to resolve bundled asset font URL:', error);
    return null;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}

async function resolveBundledFontUrlFromTauriResource(): Promise<string | null> {
  try {
    const [{ join, resourceDir }, { readFile }] = await Promise.all([
      import('@tauri-apps/api/path'),
      import('@tauri-apps/plugin-fs'),
    ]);

    const resDir = await resourceDir();
    // Note: tauri.conf.json "resources": { "resources": "./resources" } copies
    // src-tauri/resources contents to the resource directory root, not a "resources" subfolder
    const fontPath = await join(resDir, 'fonts', BUNDLED_FONT_FILE_NAME);
    const fontBytes = await readFile(fontPath);
    const dataUrl = await blobToDataUrl(new Blob([fontBytes], { type: 'font/ttf' }));

    traceStartup('Bundled font blob URL resolved from Tauri resourceDir', {
      fontPath,
      byteLength: fontBytes.byteLength,
    });

    return dataUrl;
  } catch (error) {
    traceStartup(
      'Bundled font blob URL resolution from Tauri resourceDir failed',
      error instanceof Error ? error.message : String(error)
    );
    console.warn('[fontSettings] Failed to resolve Tauri font blob URL:', error);
    return null;
  }
}

/**
 * Get the bundled font URL - handles both web and Tauri environments
 * In Tauri production builds, resources are accessed via the resource:// protocol
 * or relative paths depending on the platform
 */
async function resolveBundledFontUrl(): Promise<string> {
  if (cachedFontUrl) return cachedFontUrl;

  // In production build mode, always wait for Tauri to be fully ready
  // to ensure all APIs are initialized before attempting to use them
  let tauriReady = isTauriEnvironment();
  if (tauriReady && import.meta.env.PROD) {
    tauriReady = await waitForTauri(3000);
  }

  if (tauriReady) {
    const tauriFontUrl = await resolveBundledFontUrlFromTauriResource();
    if (tauriFontUrl) {
      cachedFontUrl = tauriFontUrl;
      console.log('[fontSettings] Resolved bundled Tauri font blob URL:', cachedFontUrl);
      return cachedFontUrl;
    }
  }

  const viteFontUrl = resolveBundledFontAssetUrlFromVite();
  if (viteFontUrl) {
    cachedFontUrl = viteFontUrl;
    traceStartup('Bundled font URL resolved from Vite asset', {
      fontUrl: cachedFontUrl,
      tauri: tauriReady,
    });
    console.log('[fontSettings] Resolved bundled asset font URL:', cachedFontUrl);
    return cachedFontUrl;
  }

  cachedFontUrl = `/assets/${BUNDLED_FONT_FILE_NAME}`;
  traceStartup('Bundled font URL fell back to static asset path', {
    fontUrl: cachedFontUrl,
  });
  return cachedFontUrl;
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

export const LEGACY_DEFAULT_CHINESE_FONT_FAMILY = '"FZ XingHeiS-R-GB", "方正行黑简体", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';
export const UI_FONT_FALLBACK_FAMILY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const DEFAULT_ENGLISH_FONT_FAMILY = `"${BUNDLED_FONT_ALIAS}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
export const DEFAULT_CHINESE_FONT_FAMILY = `"${BUNDLED_FONT_ALIAS}", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif`;
export const DEFAULT_UI_FONT_FAMILY = `"${BUNDLED_FONT_ALIAS}", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

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
  const nonBundledLocalNames = localNames.filter((name) => (
    !BUNDLED_FONT_FAMILY_NAMES.some((candidate) => candidate.toLowerCase() === name.toLowerCase())
  ));

  if (nonBundledLocalNames.length === 0) {
    return '';
  }

  return Array.from(new Set(nonBundledLocalNames))
    .map((name) => `local("${escapeFontName(name)}")`)
    .join(', ');
}

function buildEnglishFontSource(fontFamily: string, bundledFontSrc: string): string {
  const localSource = buildLocalFontSource(fontFamily);
  if (!fontFamilyMentionsBundledChineseFont(fontFamily)) {
    return localSource || 'local("Arial")';
  }

  return localSource
    ? `url("${bundledFontSrc}") format("truetype"), ${localSource}`
    : `url("${bundledFontSrc}") format("truetype")`;
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

  return BUNDLED_FONT_FAMILY_NAMES.some((name) => normalizedFontNames.has(name.toLowerCase()));
}

function normalizeBundledFontAliases(fontFamily: string): string {
  return fontFamily
    .split(',')
    .map((item) => {
      const trimmed = item.trim();
      const unquoted = trimmed.replace(/^['"]|['"]$/g, '');
      if (!unquoted) return trimmed;
      if (BUNDLED_FONT_FAMILY_NAMES.some((name) => name.toLowerCase() === unquoted.toLowerCase())) {
        return `"${escapeFontName(BUNDLED_FONT_ALIAS)}"`;
      }
      return trimmed;
    })
    .filter(Boolean)
    .join(', ');
}

function buildBundledChineseFontFaces(bundledFontSrc: string): string {
  const bundledSource = `url("${bundledFontSrc}") format("truetype")`;

  return BUNDLED_FONT_FAMILY_NAMES.map((fontName) => `
@font-face {
  font-family: "${escapeFontName(fontName)}";
  src: ${bundledSource};
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}
`.trim()).join('\n\n');
}

export function isLegacyDefaultChineseFontFamily(fontFamily: string): boolean {
  return normalizeFontFamily(fontFamily) === normalizeFontFamily(LEGACY_DEFAULT_CHINESE_FONT_FAMILY);
}

export function getResolvedEnglishFontFamily(settings: Pick<AppSettings, 'englishFontFamily'>): string {
  return normalizeBundledFontAliases(settings.englishFontFamily?.trim() || DEFAULT_ENGLISH_FONT_FAMILY);
}

export function getResolvedChineseFontFamily(settings: Pick<AppSettings, 'chineseFontFamily'>): string {
  return normalizeBundledFontAliases(settings.chineseFontFamily?.trim() || DEFAULT_CHINESE_FONT_FAMILY);
}

export function buildUiFontFamily(primaryFontFamily: string): string {
  const normalized = normalizeBundledFontAliases(primaryFontFamily.trim());
  if (!normalized) {
    return DEFAULT_UI_FONT_FAMILY;
  }

  if (normalized.includes(',')) {
    return normalized;
  }

  if (GENERIC_FONT_FAMILIES.has(normalized.toLowerCase())) {
    return normalized;
  }

  return `"${escapeFontName(normalized)}", ${UI_FONT_FALLBACK_FAMILY}`;
}

export function getResolvedUiFontFamily(settings: Pick<AppSettings, 'uiFontFamily'>): string {
  return buildUiFontFamily(settings.uiFontFamily?.trim() || DEFAULT_UI_FONT_FAMILY);
}

export function traceFontDiagnostics(
  settings: Pick<AppSettings, 'uiFontFamily' | 'englishFontFamily' | 'chineseFontFamily'>
): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const styleElement = document.getElementById(DYNAMIC_FONT_STYLE_ID) as HTMLStyleElement | null;
  const rootElement = document.documentElement;
  const resolvedUiFontFamily = getResolvedUiFontFamily(settings);
  const resolvedEnglishFontFamily = getResolvedEnglishFontFamily(settings);
  const resolvedChineseFontFamily = getResolvedChineseFontFamily(settings);
  const rootComputedFontFamily = window.getComputedStyle(rootElement).fontFamily;
  const bodyComputedFontFamily = document.body
    ? window.getComputedStyle(document.body).fontFamily
    : '';
  const probeSelectors = [
    'app-shell',
    'onboarding-shell',
    'onboarding-title',
    'onboarding-button',
  ] as const;
  const probeComputedStyles = Object.fromEntries(
    probeSelectors.map((probe) => {
      const element = document.querySelector<HTMLElement>(`[data-font-probe="${probe}"]`);
      if (!element) {
        return [probe, null];
      }

      const computed = window.getComputedStyle(element);
      return [probe, {
        fontFamily: computed.fontFamily,
        fontWeight: computed.fontWeight,
        text: element.textContent?.trim().slice(0, 80) ?? '',
      }];
    })
  );
  const glyphCoverage = typeof document.fonts?.check === 'function'
    ? {
        bundledAliasLatin: document.fonts.check(`16px "${BUNDLED_FONT_ALIAS}"`, 'Markdown Press'),
        bundledAliasChinese: document.fonts.check(`16px "${BUNDLED_FONT_ALIAS}"`, '选择知识库'),
        latinAliasLatin: document.fonts.check(`16px "${LATIN_FONT_ALIAS}"`, 'Markdown Press'),
        latinAliasChinese: document.fonts.check(`16px "${LATIN_FONT_ALIAS}"`, '选择知识库'),
      }
    : null;
  const fontCheck = typeof document.fonts?.check === 'function'
    ? {
        bundledAlias: document.fonts.check(`16px "${BUNDLED_FONT_ALIAS}"`),
        latinAlias: document.fonts.check(`16px "${LATIN_FONT_ALIAS}"`),
        resolvedUiFontFamily: document.fonts.check(`16px ${resolvedUiFontFamily}`),
        resolvedChineseFontFamily: document.fonts.check(`16px ${resolvedChineseFontFamily}`),
      }
    : null;

  traceStartup('Font diagnostics snapshot', {
    mode: import.meta.env.MODE,
    isProd: import.meta.env.PROD,
    isTauri: isTauriEnvironment(),
    locationHref: window.location.href,
    documentBaseUri: document.baseURI,
    cachedFontUrl,
    configuredSettings: {
      uiFontFamily: settings.uiFontFamily,
      englishFontFamily: settings.englishFontFamily,
      chineseFontFamily: settings.chineseFontFamily,
    },
    resolvedSettings: {
      uiFontFamily: resolvedUiFontFamily,
      englishFontFamily: resolvedEnglishFontFamily,
      chineseFontFamily: resolvedChineseFontFamily,
    },
    dynamicFontStylePresent: Boolean(styleElement),
    dynamicFontStylePreview: styleElement?.textContent?.slice(0, 300) ?? '',
    fontCheck,
    computedFontFamily: {
      html: rootComputedFontFamily,
      body: bodyComputedFontFamily,
    },
    probeComputedStyles,
    glyphCoverage,
  });
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
  src: ${buildEnglishFontSource(englishFontFamily, bundledChineseFontSrc)};
  font-style: normal;
  font-weight: 100 900;
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
  traceStartup('Dynamic font CSS preparing', {
    fontUrl,
    englishFontFamily: getResolvedEnglishFontFamily(settings),
    chineseFontFamily: getResolvedChineseFontFamily(settings),
  });
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
    traceStartup('Dynamic font CSS injected', {
      cssLength: css.length,
      hasBundledFontUrl: css.includes(fontUrl),
    });
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
    traceStartup('Dynamic font CSS loaded via document.fonts.load', {
      pendingLoadCount: pendingLoads.length,
    });
  }
}
