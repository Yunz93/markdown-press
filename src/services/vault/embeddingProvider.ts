import { normalizeBaseUrl } from "../ai/http";
import type { EmbeddingProviderId } from "../../types/vaultIndex";

export interface EmbeddingProvider {
  id: EmbeddingProviderId;
  dims: number | null;
  embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]>;
}

export class NoneEmbeddingProvider implements EmbeddingProvider {
  id: EmbeddingProviderId = "none";
  dims = null;

  async embed(_texts: string[]): Promise<Float32Array[]> {
    throw new Error("Embedding provider is not configured.");
  }
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  id: EmbeddingProviderId = "openai-compatible";
  dims: number | null = null;

  constructor(
    private readonly options: {
      apiBaseUrl: string;
      apiKey: string;
      model: string;
    },
  ) {}

  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const base = normalizeBaseUrl(
      this.options.apiBaseUrl,
      "http://127.0.0.1:11434/v1",
    );
    const response = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey || "ollama"}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        input: texts,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(
        `Embedding request failed with status ${response.status}.`,
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };
    const rows = [...(payload.data ?? [])].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );
    if (rows.length !== texts.length) {
      throw new Error("Embedding response size mismatch.");
    }

    return rows.map((row) => {
      const values = row.embedding ?? [];
      if (this.dims === null && values.length > 0) {
        this.dims = values.length;
      }
      return Float32Array.from(values);
    });
  }
}

export function createEmbeddingProvider(settings: {
  embeddingProvider?: EmbeddingProviderId;
  embeddingApiBaseUrl?: string;
  embeddingApiKey?: string;
  embeddingModel?: string;
  privacyMode?: boolean;
}): EmbeddingProvider {
  const provider = settings.embeddingProvider ?? "none";
  if (provider === "none") {
    return new NoneEmbeddingProvider();
  }

  const baseUrl =
    settings.embeddingApiBaseUrl?.trim() || "http://127.0.0.1:11434/v1";
  if (settings.privacyMode) {
    try {
      const host = new URL(baseUrl).hostname;
      if (host !== "127.0.0.1" && host !== "localhost") {
        throw new Error(
          "Privacy mode only allows local embedding endpoints (localhost).",
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Privacy mode")) {
        throw error;
      }
      throw new Error("Invalid embedding API base URL.");
    }
  }

  return new OpenAICompatibleEmbeddingProvider({
    apiBaseUrl: baseUrl,
    apiKey: settings.embeddingApiKey ?? "",
    model: settings.embeddingModel?.trim() || "nomic-embed-text",
  });
}
