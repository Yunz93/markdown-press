import { describe, expect, it } from "vitest";
import {
  BUILTIN_EMBEDDING_HUBS,
  listBuiltinEmbeddingHubsToTry,
} from "./builtinEmbedding";

describe("listBuiltinEmbeddingHubsToTry", () => {
  it("uses official then mirror for auto", () => {
    expect(listBuiltinEmbeddingHubsToTry("auto")).toEqual([
      BUILTIN_EMBEDDING_HUBS.huggingface,
      BUILTIN_EMBEDDING_HUBS["hf-mirror"],
    ]);
  });

  it("pins a single hub when preference is explicit", () => {
    expect(listBuiltinEmbeddingHubsToTry("hf-mirror")).toEqual([
      BUILTIN_EMBEDDING_HUBS["hf-mirror"],
    ]);
    expect(listBuiltinEmbeddingHubsToTry("huggingface")).toEqual([
      BUILTIN_EMBEDDING_HUBS.huggingface,
    ]);
  });
});
