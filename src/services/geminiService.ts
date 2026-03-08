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

/**
 * Split content into chunks if too long
 */
function chunkContent(content: string, maxLength: number = 4000): string[] {
  if (content.length <= maxLength) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good breaking point (paragraph or sentence)
    let breakPoint = remaining.lastIndexOf('\n\n', maxLength);
    if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
      breakPoint = remaining.lastIndexOf('\n', maxLength);
    }
    if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
      breakPoint = remaining.lastIndexOf('. ', maxLength);
    }
    if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
      breakPoint = maxLength;
    }

    chunks.push(remaining.substring(0, breakPoint + 1));
    remaining = remaining.substring(breakPoint + 1);
  }

  return chunks;
}

export const analyzeContent = async (content: string, apiKey: string): Promise<AIAnalysisResult> => {
  if (!apiKey) {
    throw new Error("Gemini API key is required");
  }

  const ai = getAIInstance(apiKey);

  // Handle long content by analyzing the first chunk
  const chunks = chunkContent(content, 4000);
  const contentToAnalyze = chunks.length > 1
    ? chunks[0] + '\n\n[Content truncated for analysis...]'
    : chunks[0];

  const prompt = `
    Analyze the following Markdown blog post content.
    1. Generate a concise SEO-friendly summary (max 160 characters).
    2. Suggest 5 relevant SEO tags.
    3. Create a catchy title if the current one is weak, otherwise return the likely title.

    Content:
    ${contentToAnalyze}
  `;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT);
      });

      const responsePromise = ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
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
              seoTitle: { type: Type.STRING }
            },
            required: ["summary", "suggestedTags", "seoTitle"]
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