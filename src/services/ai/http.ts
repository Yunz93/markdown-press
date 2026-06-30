/**
 * Shared HTTP/JSON helpers for OpenAI-compatible AI providers
 * (Codex `/responses` and DeepSeek `/chat/completions`).
 */

export function normalizeBaseUrl(
  rawBaseUrl: string | undefined,
  fallback: string,
): string {
  const trimmed = rawBaseUrl?.trim() || fallback;
  return trimmed.replace(/\/+$/, "");
}

/**
 * Strip a leading/trailing ```json fenced code block from a model response.
 */
export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Build a generic HTTP error message for a provider response.
 */
export function buildProviderHttpErrorMessage(
  providerLabel: string,
  status: number,
): string {
  return `${providerLabel} request failed with status ${status}.`;
}

/**
 * Parse a JSON model response after stripping any code fence, throwing a
 * provider-labelled error on failure.
 */
export function parseProviderJson<T>(text: string, providerLabel: string): T {
  const stripped = stripJsonFence(text);
  try {
    return JSON.parse(stripped) as T;
  } catch {
    console.error(`Failed to parse ${providerLabel} JSON response:`, stripped);
    throw new Error(`${providerLabel} returned invalid JSON.`);
  }
}
