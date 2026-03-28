import type { ThemeMode } from '../types';

export const MARKDOWN_PRESS_LIGHT_THEME = 'markdown-press-light';
export const MARKDOWN_PRESS_DARK_THEME = 'markdown-press-dark';

type ShikiThemeRegistration = {
  name: string;
  displayName?: string;
  type: 'light' | 'dark';
  fg: string;
  bg: string;
  settings: Array<{
    scope?: string | string[];
    settings: {
      foreground?: string;
      fontStyle?: string;
    };
  }>;
  colors?: Record<string, string>;
};

const lightTheme: ShikiThemeRegistration = {
  name: MARKDOWN_PRESS_LIGHT_THEME,
  displayName: 'Markdown Press Light',
  type: 'light',
  fg: '#334155',
  bg: '#f8fafc',
  colors: {
    'editor.foreground': '#334155',
    'editor.background': '#f8fafc',
  },
  settings: [
    { settings: { foreground: '#334155' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#94a3b8', fontStyle: 'italic' } },
    { scope: ['keyword', 'storage', 'storage.modifier', 'storage.type', 'keyword.control'], settings: { foreground: '#c2410c' } },
    { scope: ['keyword.operator'], settings: { foreground: '#b45309' } },
    { scope: ['string', 'string.template', 'constant.other.symbol'], settings: { foreground: '#0f766e' } },
    { scope: ['constant.numeric'], settings: { foreground: '#0f766e' } },
    { scope: ['constant.language', 'constant.language.boolean', 'constant.character.escape'], settings: { foreground: '#b45309' } },
    { scope: ['entity.name.function', 'support.function', 'variable.function'], settings: { foreground: '#7c3aed' } },
    { scope: ['entity.name.type', 'support.type', 'support.class', 'entity.name.tag'], settings: { foreground: '#0f766e' } },
    { scope: ['variable', 'identifier'], settings: { foreground: '#334155' } },
    { scope: ['variable.other.property', 'meta.object-literal.key', 'entity.other.attribute-name'], settings: { foreground: '#2563eb' } },
    { scope: ['punctuation', 'meta.brace', 'meta.delimiter'], settings: { foreground: '#94a3b8' } },
  ],
};

const darkTheme: ShikiThemeRegistration = {
  name: MARKDOWN_PRESS_DARK_THEME,
  displayName: 'Markdown Press Dark',
  type: 'dark',
  fg: '#e2e8f0',
  bg: '#0f172a',
  colors: {
    'editor.foreground': '#e2e8f0',
    'editor.background': '#0f172a',
  },
  settings: [
    { settings: { foreground: '#e2e8f0' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#94a3b8', fontStyle: 'italic' } },
    { scope: ['keyword', 'storage', 'storage.modifier', 'storage.type', 'keyword.control'], settings: { foreground: '#fdba74' } },
    { scope: ['keyword.operator'], settings: { foreground: '#fbbf24' } },
    { scope: ['string', 'string.template', 'constant.other.symbol'], settings: { foreground: '#86efac' } },
    { scope: ['constant.numeric'], settings: { foreground: '#5eead4' } },
    { scope: ['constant.language', 'constant.language.boolean', 'constant.character.escape'], settings: { foreground: '#fbbf24' } },
    { scope: ['entity.name.function', 'support.function', 'variable.function'], settings: { foreground: '#c084fc' } },
    { scope: ['entity.name.type', 'support.type', 'support.class', 'entity.name.tag'], settings: { foreground: '#5eead4' } },
    { scope: ['variable', 'identifier'], settings: { foreground: '#e2e8f0' } },
    { scope: ['variable.other.property', 'meta.object-literal.key', 'entity.other.attribute-name'], settings: { foreground: '#93c5fd' } },
    { scope: ['punctuation', 'meta.brace', 'meta.delimiter'], settings: { foreground: '#64748b' } },
  ],
};

export const MARKDOWN_PRESS_SHIKI_THEMES = [lightTheme, darkTheme];

export function getMarkdownPressShikiTheme(themeMode: ThemeMode): string {
  return themeMode === 'dark' ? MARKDOWN_PRESS_DARK_THEME : MARKDOWN_PRESS_LIGHT_THEME;
}
