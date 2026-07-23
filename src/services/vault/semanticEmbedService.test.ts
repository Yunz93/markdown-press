import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../types";
import type { ChunkIndexSnapshot, TextChunk } from "../../types/vaultIndex";
import { VectorStore } from "./vectorStore";
import {
  embedChunkIndex,
  isCompatibleVectorSnapshot,
  resolveEmbeddingModelId,
} from "./semanticEmbedService";

vi.mock("./embeddingProvider", () => {
  return {
    createEmbeddingProvider: (settings: {
      embeddingProvider?: string;
      embeddingModel?: string;
    }) => {
      const provider = settings.embeddingProvider ?? "builtin";
      if (provider === "none") {
        return {
          id: "none",
          dims: null,
          embed: async () => [],
        };
      }
      const dims = provider === "builtin" ? 4 : 3;
      return {
        id: provider,
        dims,
        embed: async (texts: string[]) =>
          texts.map(
            (_, index) =>
              new Float32Array(
                Array.from({ length: dims }, (__, d) => index + d + 1),
              ),
          ),
      };
    },
  };
});

function chunk(id: string, path: string, text: string): TextChunk {
  return {
    id,
    path,
    relPath: path,
    titlePath: [],
    headingAnchor: null,
    startLine: 1,
    endLine: 1,
    text,
    contentHash: `hash:${text}`,
  };
}

function chunkIndex(byPath: Record<string, TextChunk[]>): ChunkIndexSnapshot {
  return {
    version: 1,
    vaultRoot: "/vault",
    builtAt: Date.now(),
    byPath,
  };
}

describe("resolveEmbeddingModelId / isCompatibleVectorSnapshot", () => {
  it("builds stable model ids per provider", () => {
    expect(resolveEmbeddingModelId({ embeddingProvider: "builtin" })).toContain(
      "builtin:",
    );
    expect(
      resolveEmbeddingModelId({
        embeddingProvider: "openai-compatible",
        embeddingModel: "nomic-embed-text",
      }),
    ).toBe("openai-compatible:nomic-embed-text");
  });

  it("rejects snapshots from a different model", () => {
    expect(
      isCompatibleVectorSnapshot(
        {
          version: 1,
          vaultRoot: "/vault",
          model: "openai-compatible:old-model",
          dims: 3,
          builtAt: 1,
          records: [],
        },
        {
          embeddingProvider: "openai-compatible",
          embeddingModel: "new-model",
        },
      ),
    ).toBe(false);
  });
});

describe("embedChunkIndex model switch", () => {
  it("clears old vectors and re-embeds when the model id changes", async () => {
    const store = new VectorStore();
    store.vaultRoot = "/vault";
    store.model = "openai-compatible:old-model";
    store.upsert([
      {
        id: "a#0",
        contentHash: "hash:hello",
        values: new Float32Array([9, 9, 9]),
      },
    ]);

    const chunks = {
      "a.md": [chunk("a#0", "a.md", "hello")],
    };
    const settings = {
      embeddingProvider: "openai-compatible",
      embeddingModel: "new-model",
    } as AppSettings;

    await embedChunkIndex({
      chunkIndex: chunkIndex(chunks),
      vectorStore: store,
      settings,
      // Same content hashes — would be skipped without the model-change reset.
      previousByPath: chunks,
    });

    expect(store.model).toBe("openai-compatible:new-model");
    expect(store.get("a#0")?.values).toEqual([1, 2, 3]);
    expect(store.dims).toBe(3);
  });

  it("forceFullReembed re-embeds even when model and hashes match", async () => {
    const store = new VectorStore();
    store.vaultRoot = "/vault";
    store.model = "openai-compatible:nomic-embed-text";
    store.upsert([
      {
        id: "a#0",
        contentHash: "hash:hello",
        values: new Float32Array([9, 9, 9]),
      },
    ]);

    const chunks = {
      "a.md": [chunk("a#0", "a.md", "hello")],
    };
    const settings = {
      embeddingProvider: "openai-compatible",
      embeddingModel: "nomic-embed-text",
    } as AppSettings;

    await embedChunkIndex({
      chunkIndex: chunkIndex(chunks),
      vectorStore: store,
      settings,
      previousByPath: chunks,
      forceFullReembed: true,
    });

    expect(store.get("a#0")?.values).toEqual([1, 2, 3]);
  });

  it("rejects snapshots whose dims disagree with vector length", () => {
    expect(
      isCompatibleVectorSnapshot(
        {
          version: 1,
          vaultRoot: "/vault",
          model: "openai-compatible:nomic-embed-text",
          dims: 8,
          builtAt: 1,
          records: [{ id: "a", contentHash: "h", values: [1, 2, 3] }],
        },
        {
          embeddingProvider: "openai-compatible",
          embeddingModel: "nomic-embed-text",
        },
      ),
    ).toBe(false);
  });
});
