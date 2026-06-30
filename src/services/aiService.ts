import type {
  AIAnalysisResult,
  AIWikiGenerationResult,
  AppSettings,
} from "../types";
import { analyzeContent, generateGeminiWikiArticle } from "./geminiService";
import {
  analyzeContentWithCodex,
  generateCodexWikiArticle,
} from "./codexService";
import {
  analyzeContentWithDeepSeek,
  generateDeepSeekWikiArticle,
} from "./deepseekService";
import {
  buildWikiPrompt,
  resolveProviderSystemPrompt,
  resolveProviderWikiTemplate,
  type WikiPromptOptions,
} from "./ai/prompts";

export { buildWikiPrompt };

type AIProviderId = "gemini" | "codex" | "deepseek";

function resolveProviderId(settings: AppSettings): AIProviderId {
  if (settings.aiProvider === "codex") return "codex";
  if (settings.aiProvider === "deepseek") return "deepseek";
  return "gemini";
}

function looksLikeGeminiModel(modelName: string): boolean {
  return /^gemini(?:-|$)/i.test(modelName.trim());
}

function looksLikeCodexModel(modelName: string): boolean {
  return /^(gpt-|o[1-9]\b|o[1-9]-|codex\b|computer-use\b)/i.test(
    modelName.trim(),
  );
}

function looksLikeDeepSeekModel(modelName: string): boolean {
  return /^deepseek(?:-|$)/i.test(modelName.trim());
}

interface AIProvider {
  validateConfig(settings: AppSettings): void;
  analyze(content: string, settings: AppSettings): Promise<AIAnalysisResult>;
  generateWiki(
    prompt: string,
    settings: AppSettings,
  ): Promise<AIWikiGenerationResult>;
}

const PROVIDERS: Record<AIProviderId, AIProvider> = {
  gemini: {
    validateConfig(settings) {
      if (!settings.geminiApiKey?.trim()) {
        throw new Error("Please configure Gemini API Key in settings.");
      }
      if (
        settings.geminiModel?.trim() &&
        !looksLikeGeminiModel(settings.geminiModel)
      ) {
        throw new Error(
          "当前选择的是 Gemini provider，但模型名看起来不是 Gemini 模型。请从列表重新选择。",
        );
      }
    },
    analyze(content, settings) {
      return analyzeContent(
        content,
        settings.geminiApiKey || "",
        settings.geminiModel || "gemini-2.0-flash-exp",
        resolveProviderSystemPrompt(settings),
      );
    },
    generateWiki(prompt, settings) {
      return generateGeminiWikiArticle(
        prompt,
        settings.geminiApiKey || "",
        settings.geminiModel || "gemini-2.0-flash-exp",
        resolveProviderSystemPrompt(settings),
      );
    },
  },
  codex: {
    validateConfig(settings) {
      if (!settings.codexApiKey?.trim()) {
        throw new Error("Please configure OpenAI API Key in settings.");
      }
      if (
        settings.codexModel?.trim() &&
        !looksLikeCodexModel(settings.codexModel)
      ) {
        throw new Error(
          "当前选择的是 Codex provider，但模型名看起来不是 OpenAI/Codex 模型。请从列表重新选择。",
        );
      }
    },
    analyze: analyzeContentWithCodex,
    generateWiki: generateCodexWikiArticle,
  },
  deepseek: {
    validateConfig(settings) {
      if (!settings.deepseekApiKey?.trim()) {
        throw new Error("Please configure DeepSeek API Key in settings.");
      }
      if (
        settings.deepseekModel?.trim() &&
        !looksLikeDeepSeekModel(settings.deepseekModel)
      ) {
        throw new Error(
          "当前选择的是 DeepSeek provider，但模型名看起来不是 DeepSeek 模型。请从列表重新选择。",
        );
      }
    },
    analyze: analyzeContentWithDeepSeek,
    generateWiki: generateDeepSeekWikiArticle,
  },
};

export function ensureAIConfiguration(settings: AppSettings): { ok: true } {
  PROVIDERS[resolveProviderId(settings)].validateConfig(settings);
  return { ok: true };
}

export async function analyzeMarkdownWithProvider(
  content: string,
  settings: AppSettings,
): Promise<AIAnalysisResult> {
  return PROVIDERS[resolveProviderId(settings)].analyze(content, settings);
}

export async function generateWikiFromSelectionWithProvider(
  options: WikiPromptOptions,
  settings: AppSettings,
): Promise<AIWikiGenerationResult> {
  const prompt = buildWikiPrompt(
    options,
    resolveProviderWikiTemplate(settings),
  );
  return PROVIDERS[resolveProviderId(settings)].generateWiki(prompt, settings);
}
