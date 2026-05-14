import type { AIAnalysisResult, AIWikiGenerationResult, AppSettings } from '../types';
import { resolveAISystemPrompt } from './aiPrompts';

interface DeepSeekChatCompletionPayload {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  } | null;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

function normalizeBaseUrl(rawBaseUrl?: string): string {
  const trimmed = rawBaseUrl?.trim() || 'https://api.deepseek.com';
  return trimmed.replace(/\/+$/, '');
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function extractMessageContent(payload: DeepSeekChatCompletionPayload): string {
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (text) {
    return text;
  }

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  throw new Error('DeepSeek returned an empty response.');
}

function buildDeepSeekHttpErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return 'DeepSeek request failed with status 401.';
    case 403:
      return 'DeepSeek request failed with status 403.';
    case 429:
      return 'DeepSeek request failed with status 429.';
    default:
      return `DeepSeek request failed with status ${status}.`;
  }
}

export async function generateDeepSeekJson<T>(
  prompt: string,
  settings: AppSettings
): Promise<T> {
  const apiKey = settings.deepseekApiKey?.trim();
  if (!apiKey) {
    throw new Error('Please configure DeepSeek API Key in settings.');
  }

  const model = settings.deepseekModel?.trim() || 'deepseek-v4-flash';
  const baseUrl = normalizeBaseUrl(settings.deepseekApiBaseUrl);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: resolveAISystemPrompt({
            language: settings.language,
            zhCN: settings.aiSystemPromptZh,
            en: settings.aiSystemPromptEn,
            legacy: settings.aiSystemPrompt,
          }),
        },
        {
          role: 'user',
          content: `${prompt}\n\nReturn JSON only.`,
        },
      ],
      response_format: {
        type: 'json_object',
      },
      stream: false,
    }),
  });

  const payload = await response.json() as DeepSeekChatCompletionPayload;
  if (!response.ok) {
    console.error('DeepSeek chat completion request failed:', {
      status: response.status,
      error: payload.error ?? null,
      model,
      baseUrl,
    });
    throw new Error(payload.error?.message
      ? `DeepSeek request failed: ${payload.error.message}`
      : buildDeepSeekHttpErrorMessage(response.status));
  }

  const text = stripJsonFence(extractMessageContent(payload));

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error('Failed to parse DeepSeek JSON response:', text);
    throw new Error('DeepSeek returned invalid JSON.');
  }
}

export async function analyzeContentWithDeepSeek(
  content: string,
  settings: AppSettings
): Promise<AIAnalysisResult> {
  const prompt = `
You are editing Markdown content for publication quality.
Do all of the following:
1. Fix spelling and obvious grammar issues.
2. Improve Markdown structure and formatting without changing meaning.
3. Keep code blocks, links, and technical terms intact.
4. Generate a concise SEO summary (max 160 characters).
5. Suggest 5 relevant SEO tags.
6. Propose a better SEO title only if the current title is weak.

Return a JSON object with:
- summary: string
- suggestedTags: string[]
- seoTitle: string
- optimizedMarkdown: string

Markdown content:
${content}
  `.trim();

  return generateDeepSeekJson<AIAnalysisResult>(prompt, settings);
}

export async function generateDeepSeekWikiArticle(
  prompt: string,
  settings: AppSettings
): Promise<AIWikiGenerationResult> {
  return generateDeepSeekJson<AIWikiGenerationResult>(prompt, settings);
}
