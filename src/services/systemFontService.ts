import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment, waitForTauri } from '../types/filesystem';

const MACOS_FALLBACK_FONTS = [
  'PingFang SC',
  'SF Pro Text',
  'SF Pro Display',
  'Helvetica Neue',
  'Hiragino Sans GB',
  'Songti SC',
];

const WINDOWS_FALLBACK_FONTS = [
  'Segoe UI',
  'Microsoft YaHei',
  'DengXian',
  'SimHei',
  'SimSun',
  'KaiTi',
];

const LINUX_FALLBACK_FONTS = [
  'Noto Sans CJK SC',
  'Noto Sans',
  'Source Han Sans SC',
  'WenQuanYi Micro Hei',
  'Ubuntu',
  'DejaVu Sans',
];

let cachedSystemFontFamiliesPromise: Promise<string[]> | null = null;

function normalizeFontFamilies(fontFamilies: string[]): string[] {
  return Array.from(
    new Set(
      fontFamilies
        .map((fontFamily) => fontFamily.trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function getFallbackFontFamilies(): string[] {
  if (typeof navigator === 'undefined') {
    return normalizeFontFamilies([...MACOS_FALLBACK_FONTS, ...WINDOWS_FALLBACK_FONTS, ...LINUX_FALLBACK_FONTS]);
  }

  const platform = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();

  if (platform.includes('mac')) {
    return normalizeFontFamilies(MACOS_FALLBACK_FONTS);
  }

  if (platform.includes('win')) {
    return normalizeFontFamilies(WINDOWS_FALLBACK_FONTS);
  }

  return normalizeFontFamilies(LINUX_FALLBACK_FONTS);
}

async function listBrowserSystemFonts(): Promise<string[]> {
  const queryLocalFonts = (window as Window & {
    queryLocalFonts?: () => Promise<Array<{ family: string }>>;
  }).queryLocalFonts;

  if (typeof queryLocalFonts !== 'function') {
    return [];
  }

  try {
    const fonts = await queryLocalFonts();
    return normalizeFontFamilies(fonts.map((font) => font.family));
  } catch (error) {
    console.warn('[systemFontService] Failed to query local fonts from browser API:', error);
    return [];
  }
}

async function listTauriSystemFonts(): Promise<string[]> {
  const tauriReady = await waitForTauri(5000);
  if (!tauriReady) {
    return [];
  }

  try {
    const fonts = await invoke<string[]>('list_system_fonts');
    return normalizeFontFamilies(Array.isArray(fonts) ? fonts : []);
  } catch (error) {
    console.warn('[systemFontService] Failed to load system fonts from Tauri:', error);
    return [];
  }
}

export async function listAvailableSystemFontFamilies(): Promise<string[]> {
  if (!cachedSystemFontFamiliesPromise) {
    cachedSystemFontFamiliesPromise = (async () => {
      const discoveredFonts = isTauriEnvironment()
        ? await listTauriSystemFonts()
        : await listBrowserSystemFonts();

      return normalizeFontFamilies([
        ...discoveredFonts,
        ...getFallbackFontFamilies(),
      ]);
    })();
  }

  return cachedSystemFontFamiliesPromise;
}
