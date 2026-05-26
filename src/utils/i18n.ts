import type { AppLanguage } from "../types";
import zhCN from "./i18n/zh-CN";
import en from "./i18n/en";

type Params = Record<string, string | number>;

const translations = {
  "zh-CN": zhCN,
  en,
} as const;
export type TranslationKey = keyof (typeof translations)["zh-CN"];

export function formatMessage(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    String(params[key] ?? `{${key}}`),
  );
}

export function t(
  language: AppLanguage,
  key: TranslationKey,
  params?: Params,
): string {
  const locale = translations[language] ?? translations["zh-CN"];
  const template = locale[key] ?? translations["zh-CN"][key] ?? key;
  return formatMessage(template, params);
}

const knownErrorMessages: Record<string, TranslationKey> = {
  "Please configure OpenAI API Key in settings.": "notifications_aiConfigFirst",
  "Please configure Gemini API Key in settings.": "notifications_aiConfigFirst",
  "Please configure DeepSeek API Key in settings.":
    "notifications_aiConfigFirst",
  "Please configure AI settings first.": "notifications_aiConfigFirst",
  "Failed to create the wiki file.": "notifications_wikiCreateFailed",
  "Gemini API key is required": "notifications_aiConfigFirst",
};

export function localizeKnownError(
  language: AppLanguage,
  message: string,
): string {
  const normalizedMessage = message.trim();
  const exactKey = knownErrorMessages[normalizedMessage];
  if (exactKey) return t(language, exactKey);

  const isDeepSeekMessage = /deepseek/i.test(normalizedMessage);
  if (isDeepSeekMessage) {
    if (
      /model .*not found/i.test(normalizedMessage) ||
      /does not exist/i.test(normalizedMessage) ||
      /unsupported model/i.test(normalizedMessage) ||
      /model unavailable/i.test(normalizedMessage)
    ) {
      return t(language, "notifications_aiDeepSeekModelUnavailable");
    }

    if (
      /\b429\b/.test(normalizedMessage) ||
      /rate limit/i.test(normalizedMessage) ||
      /too many requests/i.test(normalizedMessage)
    ) {
      return t(language, "notifications_aiDeepSeekRateLimited");
    }

    if (
      /\b403\b/.test(normalizedMessage) ||
      /forbidden/i.test(normalizedMessage)
    ) {
      return t(language, "notifications_aiDeepSeekForbidden");
    }

    if (
      /incorrect api key/i.test(normalizedMessage) ||
      /invalid_api_key/i.test(normalizedMessage) ||
      /\b401\b/.test(normalizedMessage) ||
      /unauthorized/i.test(normalizedMessage)
    ) {
      return t(language, "notifications_aiDeepSeekUnauthorized");
    }
  }

  if (
    /exceeded your current quota/i.test(normalizedMessage) ||
    /insufficient_quota/i.test(normalizedMessage)
  ) {
    return t(language, "notifications_aiOpenAIQuotaExceeded");
  }

  if (
    /incorrect api key/i.test(normalizedMessage) ||
    /invalid_api_key/i.test(normalizedMessage) ||
    /\b401\b/.test(normalizedMessage) ||
    /unauthorized/i.test(normalizedMessage)
  ) {
    return t(language, "notifications_aiOpenAIUnauthorized");
  }

  if (
    /\b403\b/.test(normalizedMessage) ||
    /forbidden/i.test(normalizedMessage)
  ) {
    return t(language, "notifications_aiOpenAIForbidden");
  }

  if (
    /\b429\b/.test(normalizedMessage) ||
    /rate limit/i.test(normalizedMessage) ||
    /too many requests/i.test(normalizedMessage)
  ) {
    return t(language, "notifications_aiOpenAIRateLimited");
  }

  if (
    /model .*not found/i.test(normalizedMessage) ||
    /does not exist/i.test(normalizedMessage) ||
    /unsupported model/i.test(normalizedMessage) ||
    /model unavailable/i.test(normalizedMessage)
  ) {
    return t(language, "notifications_aiOpenAIModelUnavailable");
  }

  return normalizedMessage;
}
