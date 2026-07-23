import { describe, expect, it } from "vitest";
import {
  createEmbeddingProvider,
  NoneEmbeddingProvider,
  OpenAICompatibleEmbeddingProvider,
} from "./embeddingProvider";
import { BuiltinEmbeddingProvider } from "./builtinEmbedding";

describe("createEmbeddingProvider", () => {
  it("returns none provider when disabled", () => {
    const provider = createEmbeddingProvider({ embeddingProvider: "none" });
    expect(provider).toBeInstanceOf(NoneEmbeddingProvider);
    expect(provider.id).toBe("none");
  });

  it("returns builtin provider without requiring a local server", () => {
    const provider = createEmbeddingProvider({
      embeddingProvider: "builtin",
      privacyMode: true,
    });
    expect(provider).toBeInstanceOf(BuiltinEmbeddingProvider);
    expect(provider.id).toBe("builtin");
  });

  it("returns openai-compatible provider for custom endpoints", () => {
    const provider = createEmbeddingProvider({
      embeddingProvider: "openai-compatible",
      embeddingApiBaseUrl: "http://127.0.0.1:11434/v1",
      embeddingModel: "nomic-embed-text",
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleEmbeddingProvider);
    expect(provider.id).toBe("openai-compatible");
  });

  it("blocks non-local endpoints in privacy mode for openai-compatible", () => {
    expect(() =>
      createEmbeddingProvider({
        embeddingProvider: "openai-compatible",
        embeddingApiBaseUrl: "https://api.openai.com/v1",
        privacyMode: true,
      }),
    ).toThrow(/Privacy mode/);
  });
});
