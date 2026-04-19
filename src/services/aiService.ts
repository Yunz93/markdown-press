import type { AIAnalysisResult, AIWikiGenerationResult, AppSettings } from '../types';
import { analyzeContent, generateGeminiWikiArticle } from './geminiService';
import { analyzeContentWithCodex, generateCodexWikiArticle } from './codexService';
import { resolveAISystemPrompt, resolveWikiPromptTemplate } from './aiPrompts';

function looksLikeGeminiModel(modelName: string): boolean {
  return /^gemini(?:-|$)/i.test(modelName.trim());
}

function looksLikeCodexModel(modelName: string): boolean {
  return /^(gpt-|o[1-9]\b|o[1-9]-|codex\b|computer-use\b)/i.test(modelName.trim());
}

export function buildWikiPrompt(
  options: {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  documentTitle: string;
  currentFileName: string;
  isFrontmatterSelection: boolean;
},
  customTemplate?: string | {
    language?: AppSettings['language'];
    zhCN?: string;
    en?: string;
    legacy?: string;
  }
) {
  const {
    selectedText,
    contextBefore,
    contextAfter,
    documentTitle,
    currentFileName,
    isFrontmatterSelection,
  } = options;
  const wikiPromptTemplate = resolveWikiPromptTemplate(customTemplate);

  return `
You are helping maintain a markdown-based knowledge base.
${wikiPromptTemplate}

Return a JSON object with:
- title: string
- summary: string
- category: string
- suggestedTags: string[]
- markdown: string
- references: Array<{ title: string; url?: string; note?: string }>
- citations: string[]

Current note title: ${documentTitle || currentFileName || 'Untitled'}
Current file name: ${currentFileName || 'Untitled'}
Selection source: ${isFrontmatterSelection ? 'frontmatter' : 'body'}
Selected text:
${selectedText}

Context before:
${contextBefore || '(empty)'}

Context after:
${contextAfter || '(empty)'}
  `.trim();
}

export function ensureAIConfiguration(settings: AppSettings): { ok: true } {
  if (settings.aiProvider === 'codex') {
    if (!settings.codexApiKey?.trim()) {
      throw new Error('Please configure OpenAI API Key in settings.');
    }
    if (settings.codexModel?.trim() && !looksLikeCodexModel(settings.codexModel)) {
      throw new Error('当前选择的是 Codex provider，但模型名看起来不是 OpenAI/Codex 模型。请从列表重新选择。');
    }
    return { ok: true };
  }

  if (!settings.geminiApiKey?.trim()) {
    throw new Error('Please configure Gemini API Key in settings.');
  }
  if (settings.geminiModel?.trim() && !looksLikeGeminiModel(settings.geminiModel)) {
    throw new Error('当前选择的是 Gemini provider，但模型名看起来不是 Gemini 模型。请从列表重新选择。');
  }

  return { ok: true };
}

export async function analyzeMarkdownWithProvider(
  content: string,
  settings: AppSettings
): Promise<AIAnalysisResult> {
  if (settings.aiProvider === 'codex') {
    return analyzeContentWithCodex(content, settings);
  }

  return analyzeContent(
    content,
    settings.geminiApiKey || '',
    settings.geminiModel || 'gemini-2.0-flash-exp',
    resolveAISystemPrompt({
      language: settings.language,
      zhCN: settings.aiSystemPromptZh,
      en: settings.aiSystemPromptEn,
      legacy: settings.aiSystemPrompt,
    })
  );
}

export async function generateWikiFromSelectionWithProvider(
  options: {
    selectedText: string;
    contextBefore: string;
    contextAfter: string;
    documentTitle: string;
    currentFileName: string;
    isFrontmatterSelection: boolean;
  },
  settings: AppSettings
): Promise<AIWikiGenerationResult> {
  const prompt = buildWikiPrompt(options, {
    language: settings.language,
    zhCN: settings.wikiPromptTemplateZh,
    en: settings.wikiPromptTemplateEn,
    legacy: settings.wikiPromptTemplate,
  });

  if (settings.aiProvider === 'codex') {
    return generateCodexWikiArticle(prompt, settings);
  }

  return generateGeminiWikiArticle(
    prompt,
    settings.geminiApiKey || '',
    settings.geminiModel || 'gemini-2.0-flash-exp',
    resolveAISystemPrompt({
      language: settings.language,
      zhCN: settings.aiSystemPromptZh,
      en: settings.aiSystemPromptEn,
      legacy: settings.aiSystemPrompt,
    })
  );
}
