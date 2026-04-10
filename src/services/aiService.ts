import type { AIAnalysisResult, AIWikiGenerationResult, AppSettings } from '../types';
import { analyzeContent, generateGeminiWikiArticle } from './geminiService';
import { analyzeContentWithCodex, generateCodexWikiArticle } from './codexService';

function looksLikeGeminiModel(modelName: string): boolean {
  return /^gemini(?:-|$)/i.test(modelName.trim());
}

function looksLikeCodexModel(modelName: string): boolean {
  return /^(gpt-|o[1-9]\b|o[1-9]-|codex\b|computer-use\b)/i.test(modelName.trim());
}

function buildWikiPrompt(options: {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  documentTitle: string;
  currentFileName: string;
  isFrontmatterSelection: boolean;
}) {
  const {
    selectedText,
    contextBefore,
    contextAfter,
    documentTitle,
    currentFileName,
    isFrontmatterSelection,
  } = options;

  return `
You are helping maintain a markdown-based knowledge base.
Write a standalone explainer wiki article for the selected text.

Requirements:
1. Keep the article in the main language used by the selected text and surrounding context. If ambiguous, prefer Simplified Chinese.
2. Explain the concept, why it matters in the current article, key points, and common misunderstandings.
3. Use Markdown headings and concise paragraphs.
4. The first heading in markdown must be "# {title}" using the same title you return in JSON.
5. Do not mention that you are an AI model.
6. Keep the article practical and suitable for an internal wiki.

Return a JSON object with:
- title: string
- summary: string
- suggestedTags: string[]
- markdown: string

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
    settings.aiSystemPrompt
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
  const prompt = buildWikiPrompt(options);

  if (settings.aiProvider === 'codex') {
    return generateCodexWikiArticle(prompt, settings);
  }

  return generateGeminiWikiArticle(
    prompt,
    settings.geminiApiKey || '',
    settings.geminiModel || 'gemini-2.0-flash-exp',
    settings.aiSystemPrompt
  );
}
