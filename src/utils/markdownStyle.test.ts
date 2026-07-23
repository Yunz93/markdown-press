import { describe, expect, it } from 'vitest';
import type { MarkdownStylePreset, ThemeMode } from '../types';
import {
  DEFAULT_MARKDOWN_STYLE_PRESET,
  getMarkdownStyleCssVariables,
  getMarkdownStyleTokens,
  MARKDOWN_STYLE_PRESETS,
  normalizeMarkdownStylePreset,
} from './markdownStyle';
import { getMarkdownPressShikiTheme, MARKDOWN_PRESS_SHIKI_THEMES } from './shikiTheme';

const THEME_MODES: ThemeMode[] = ['light', 'dark'];

describe('markdownStyle', () => {
  it('uses nord as the default and normalizes legacy classic to nord', () => {
    expect(DEFAULT_MARKDOWN_STYLE_PRESET).toBe('nord');
    expect(normalizeMarkdownStylePreset('classic')).toBe('nord');
    expect(normalizeMarkdownStylePreset('unknown')).toBe('nord');
  });

  it('keeps all supported presets and exposes light/dark tokens', () => {
    expect(MARKDOWN_STYLE_PRESETS).toEqual([
      'nord',
      'topaz',
      'typewriter',
      'primary',
      'minimal',
      'things',
      'catppuccin',
      'solarized',
    ]);

    for (const preset of MARKDOWN_STYLE_PRESETS) {
      for (const themeMode of THEME_MODES) {
        const tokens = getMarkdownStyleTokens(preset, themeMode);
        expect(tokens.text).toBeTruthy();
        expect(tokens.link).toBeTruthy();
        expect(tokens.markBg).toBeTruthy();
        expect(tokens.tagText).toBeTruthy();
        expect(tokens.codeKeyword).toBeTruthy();
      }
    }
  });

  it('emits element-level css variables without markdown background ownership', () => {
    const variables = getMarkdownStyleCssVariables('primary', 'dark');
    expect(variables['--mp-doc-link']).toBeTruthy();
    expect(variables['--mp-doc-mark-bg']).toBeTruthy();
    expect(variables['--mp-doc-tag-text']).toBeTruthy();
    expect(variables['--mp-doc-task-checked']).toBeTruthy();
    expect(variables['--mp-doc-bg']).toBeUndefined();
    expect(variables['--mp-doc-surface']).toBeUndefined();
  });

  it('registers shiki themes for every preset and theme mode', () => {
    const themeNames = new Set(MARKDOWN_PRESS_SHIKI_THEMES.map((theme) => theme.name));

    for (const preset of MARKDOWN_STYLE_PRESETS) {
      for (const themeMode of THEME_MODES) {
        const themeName = getMarkdownPressShikiTheme(themeMode, preset as MarkdownStylePreset);
        expect(themeNames.has(themeName)).toBe(true);
      }
    }
  });
});
