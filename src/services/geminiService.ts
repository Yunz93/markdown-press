import { GoogleGenAI, Type } from "@google/genai";
import type { AIAnalysisResult } from "../types";

// Singleton instance - API key is not stored in a Map to avoid memory caching issues
let aiInstance: GoogleGenAI | null = null;
let currentApiKey: string | null = null;

/**
 * Clear the cached AI instance and API key from memory
 * Call this when logging out or when API key changes
 */
export function clearAIInstance(): void {
  aiInstance = null;
  currentApiKey = null;
}

const getAIInstance = (apiKey: string): GoogleGenAI => {
  // Clear old instance if API key changed
  if (currentApiKey !== apiKey) {
    aiInstance = null;
    currentApiKey = null;
  }

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
    currentApiKey = apiKey;
  }
  return aiInstance;
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if the error is retryable (network errors, rate limits)
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() || '';
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('502')
  );
}

export const analyzeContent = async (
  content: string,
  apiKey: string,
  modelName: string = "gemini-2.0-flash-exp"
): Promise<AIAnalysisResult> => {
  if (!apiKey) {
    throw new Error("Gemini API key is required");
  }

  const ai = getAIInstance(apiKey);

  const prompt = `
    You are editing Markdown content for publication quality.
    Do all of the following:
    1. Fix spelling and obvious grammar issues.
    2. Improve Markdown structure and formatting without changing meaning.
    3. Keep code blocks, links, and technical terms intact.
    4. Generate a concise SEO summary (max 160 characters).
    5. Suggest 5 relevant SEO tags.
    6. Propose a better SEO title only if the current title is weak.

    Return strict JSON with these fields:
    - summary: string
    - suggestedTags: string[]
    - seoTitle: string
    - optimizedMarkdown: string

    Markdown content:
    ${content}
  `;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT);
      });

      const responsePromise = ai.models.generateContent({
        model: modelName || "gemini-2.0-flash-exp",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              suggestedTags: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              seoTitle: { type: Type.STRING },
              optimizedMarkdown: { type: Type.STRING }
            },
            required: ["summary", "suggestedTags", "seoTitle", "optimizedMarkdown"]
          }
        }
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);
      const text = response.text;

      if (!text) throw new Error("No response from AI");

      return JSON.parse(text) as AIAnalysisResult;

    } catch (error: any) {
      lastError = error;
      console.error(`Gemini analysis attempt ${attempt + 1} failed:`, error);

      // Check if we should retry
      if (attempt < MAX_RETRIES - 1 && isRetryableError(error)) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
        console.log(`Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        break;
      }
    }
  }

  // Clear instance on failure
  clearAIInstance();
  throw lastError || new Error("Failed to analyze content after multiple attempts");
};
