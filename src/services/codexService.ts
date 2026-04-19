import type { AIAnalysisResult, AIWikiGenerationResult, AppSettings } from '../types';
import { resolveAISystemPrompt } from './aiPrompts';

interface CodexResponseContent {
  type?: string;
  text?: string;
}

interface CodexResponseMessage {
  type?: string;
  content?: CodexResponseContent[];
}

interface CodexResponsePayload {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  } | null;
  output?: CodexResponseMessage[];
}

function normalizeBaseUrl(rawBaseUrl?: string): string {
  const trimmed = rawBaseUrl?.trim() || 'https://api.openai.com/v1';
  return trimmed.replace(/\/+$/, '');
}

function extractOutputText(payload: CodexResponsePayload): string {
  const text = payload.output
    ?.flatMap((message) => message.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text?.trim() || '')
    .filter(Boolean)
    .join('\n')
    .trim();

  if (text) {
    return text;
  }

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  throw new Error('Codex returned an empty response.');
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

function buildOpenAIHttpErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return 'OpenAI request failed with status 401.';
    case 403:
      return 'OpenAI request failed with status 403.';
    case 429:
      return 'OpenAI request failed with status 429.';
    default:
      return `OpenAI request failed with status ${status}.`;
  }
}

export async function generateCodexJson<T>(
  prompt: string,
  settings: AppSettings
): Promise<T> {
  const apiKey = settings.codexApiKey?.trim();
  if (!apiKey) {
    throw new Error('Please configure an OpenAI API key in settings.');
  }

  const response = await fetch(`${normalizeBaseUrl(settings.codexApiBaseUrl)}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: settings.codexModel?.trim() || 'gpt-5.2-codex',
      instructions: resolveAISystemPrompt({
        language: settings.language,
        zhCN: settings.aiSystemPromptZh,
        en: settings.aiSystemPromptEn,
        legacy: settings.aiSystemPrompt,
      }),
      input: `${prompt}\n\nReturn JSON only.`,
      reasoning: {
        effort: 'medium',
      },
      text: {
        format: {
          type: 'json_object',
        },
      },
      store: false,
    }),
  });

  const payload = await response.json() as CodexResponsePayload;
  if (!response.ok) {
    console.error('OpenAI responses request failed:', {
      status: response.status,
      error: payload.error ?? null,
      model: settings.codexModel?.trim() || 'gpt-5.2-codex',
      baseUrl: normalizeBaseUrl(settings.codexApiBaseUrl),
    });
    throw new Error(payload.error?.message || buildOpenAIHttpErrorMessage(response.status));
  }

  const text = stripJsonFence(extractOutputText(payload));

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error('Failed to parse Codex JSON response:', text);
    throw new Error('Codex returned invalid JSON.');
  }
}

export async function analyzeContentWithCodex(
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

  return generateCodexJson<AIAnalysisResult>(prompt, settings);
}

export async function generateCodexWikiArticle(
  prompt: string,
  settings: AppSettings
): Promise<AIWikiGenerationResult> {
  return generateCodexJson<AIWikiGenerationResult>(prompt, settings);
}
