import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_SYSTEM_PROMPT,
  DEFAULT_AI_SYSTEM_PROMPT_EN,
  DEFAULT_WIKI_PROMPT_TEMPLATE,
  DEFAULT_WIKI_PROMPT_TEMPLATE_EN,
} from '../services/aiPrompts';
import { resolveLocalizedPrompts, stripNonRuntimeSettings, useAppStore } from './appStore';

afterEach(() => {
  useAppStore.setState({
    openTabs: [],
    activeTabId: null,
    fileContents: {},
    lastSavedContent: {},
  });
});

describe('stripNonRuntimeSettings', () => {
  it('removes deleted export strikethrough setting from persisted settings', () => {
    const settings = stripNonRuntimeSettings({
      language: 'zh-CN',
      exportStrikethroughMode: 'raster-safe',
    });

    expect(settings).toEqual({ language: 'zh-CN' });
  });
});

describe('resolveLocalizedPrompts', () => {
  it('maps legacy built-in English prompts back to localized defaults', () => {
    const prompts = resolveLocalizedPrompts({
      aiSystemPrompt: DEFAULT_AI_SYSTEM_PROMPT_EN,
      wikiPromptTemplate: DEFAULT_WIKI_PROMPT_TEMPLATE_EN,
    });

    expect(prompts.aiSystemPromptZh).toBe(DEFAULT_AI_SYSTEM_PROMPT);
    expect(prompts.aiSystemPromptEn).toBe(DEFAULT_AI_SYSTEM_PROMPT_EN);
    expect(prompts.wikiPromptTemplateZh).toBe(DEFAULT_WIKI_PROMPT_TEMPLATE);
    expect(prompts.wikiPromptTemplateEn).toBe(DEFAULT_WIKI_PROMPT_TEMPLATE_EN);
  });

  it('preserves custom legacy prompts for both languages when no localized fields exist', () => {
    const prompts = resolveLocalizedPrompts({
      aiSystemPrompt: 'Custom shared prompt',
      wikiPromptTemplate: 'Custom shared wiki prompt',
    });

    expect(prompts.aiSystemPromptZh).toBe('Custom shared prompt');
    expect(prompts.aiSystemPromptEn).toBe('Custom shared prompt');
    expect(prompts.wikiPromptTemplateZh).toBe('Custom shared wiki prompt');
    expect(prompts.wikiPromptTemplateEn).toBe('Custom shared wiki prompt');
  });

  it('keeps explicit localized prompt overrides', () => {
    const prompts = resolveLocalizedPrompts({
      aiSystemPrompt: DEFAULT_AI_SYSTEM_PROMPT_EN,
      aiSystemPromptZh: '显式中文提示词',
      wikiPromptTemplate: DEFAULT_WIKI_PROMPT_TEMPLATE,
      wikiPromptTemplateEn: 'Explicit English wiki prompt',
    });

    expect(prompts.aiSystemPromptZh).toBe('显式中文提示词');
    expect(prompts.aiSystemPromptEn).toBe(DEFAULT_AI_SYSTEM_PROMPT_EN);
    expect(prompts.wikiPromptTemplateZh).toBe(DEFAULT_WIKI_PROMPT_TEMPLATE);
    expect(prompts.wikiPromptTemplateEn).toBe('Explicit English wiki prompt');
  });
});

describe('tab saved baseline', () => {
  it('treats content loaded from disk as saved when opening a tab', () => {
    const fileId = '/vault/note.md';

    useAppStore.getState().addTab(fileId, '# Loaded from disk\n');

    expect(useAppStore.getState().fileContents[fileId]).toBe('# Loaded from disk\n');
    expect(useAppStore.getState().lastSavedContent[fileId]).toBe('# Loaded from disk\n');
    expect(useAppStore.getState().hasUnsavedChanges(fileId)).toBe(false);
  });
});
