import type { EmbeddingProviderId } from "../../types/vaultIndex";

/** Multilingual MiniLM — works in Transformers.js without e5 tokenizer hacks. */
export const BUILTIN_EMBEDDING_MODEL =
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const BUILTIN_EMBEDDING_DIMS = 384;

export type BuiltinEmbeddingPhase = "idle" | "loading" | "ready" | "error";

export interface BuiltinEmbeddingStatus {
  phase: BuiltinEmbeddingPhase;
  /** 0–1 while downloading / initializing */
  progress: number;
  model: string;
  error: string | null;
}

type StatusListener = (status: BuiltinEmbeddingStatus) => void;

let status: BuiltinEmbeddingStatus = {
  phase: "idle",
  progress: 0,
  model: BUILTIN_EMBEDDING_MODEL,
  error: null,
};

const listeners = new Set<StatusListener>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeaturePipeline = (
  texts: string | string[],
  options?: any,
) => Promise<any>;

let pipelinePromise: Promise<FeaturePipeline> | null = null;
let extractor: FeaturePipeline | null = null;

function setStatus(patch: Partial<BuiltinEmbeddingStatus>): void {
  status = { ...status, ...patch };
  for (const listener of listeners) {
    try {
      listener(status);
    } catch {
      // ignore subscriber errors
    }
  }
}

export function getBuiltinEmbeddingStatus(): BuiltinEmbeddingStatus {
  return status;
}

export function subscribeBuiltinEmbeddingStatus(
  listener: StatusListener,
): () => void {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

async function loadPipeline(): Promise<FeaturePipeline> {
  if (extractor) return extractor;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    setStatus({
      phase: "loading",
      progress: 0.02,
      error: null,
      model: BUILTIN_EMBEDDING_MODEL,
    });

    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    const loaded = await pipeline(
      "feature-extraction",
      BUILTIN_EMBEDDING_MODEL,
      {
        dtype: "q8",
        progress_callback: (progress: {
          status?: string;
          progress?: number;
          loaded?: number;
          total?: number;
        }) => {
          if (
            typeof progress.progress === "number" &&
            Number.isFinite(progress.progress)
          ) {
            setStatus({
              phase: "loading",
              progress: Math.min(0.99, Math.max(0.02, progress.progress / 100)),
            });
            return;
          }
          if (
            typeof progress.loaded === "number" &&
            typeof progress.total === "number" &&
            progress.total > 0
          ) {
            setStatus({
              phase: "loading",
              progress: Math.min(
                0.99,
                Math.max(0.02, progress.loaded / progress.total),
              ),
            });
          }
        },
      },
    );

    extractor = loaded as unknown as FeaturePipeline;
    setStatus({ phase: "ready", progress: 1, error: null });
    return extractor;
  })().catch((error: unknown) => {
    pipelinePromise = null;
    extractor = null;
    const message =
      error instanceof Error ? error.message : "Failed to load builtin model";
    setStatus({ phase: "error", progress: 0, error: message });
    throw error;
  });

  return pipelinePromise;
}

/** Warm the model (download + init). Safe to call from settings UI. */
export async function ensureBuiltinEmbeddingReady(): Promise<void> {
  await loadPipeline();
}

function tensorToVector(output: {
  data?: ArrayLike<number>;
  tolist?: () => number[] | number[][];
}): Float32Array {
  if (output?.data) {
    return Float32Array.from(output.data as ArrayLike<number>);
  }
  if (typeof output?.tolist === "function") {
    const list = output.tolist();
    const flat = Array.isArray(list[0])
      ? (list as number[][]).flat()
      : (list as number[]);
    return Float32Array.from(flat);
  }
  throw new Error("Unexpected embedding tensor shape from builtin model.");
}

export class BuiltinEmbeddingProvider {
  id: EmbeddingProviderId = "builtin";
  dims: number | null = BUILTIN_EMBEDDING_DIMS;

  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    if (signal?.aborted) {
      throw new DOMException("Embedding aborted", "AbortError");
    }

    const pipe = await loadPipeline();
    if (signal?.aborted) {
      throw new DOMException("Embedding aborted", "AbortError");
    }

    const vectors: Float32Array[] = [];
    // Keep batches small — WASM/CPU path is memory sensitive.
    const batchSize = 4;
    for (let i = 0; i < texts.length; i += batchSize) {
      if (signal?.aborted) {
        throw new DOMException("Embedding aborted", "AbortError");
      }
      const batch = texts.slice(i, i + batchSize);
      const output = await pipe(batch, {
        pooling: "mean",
        normalize: true,
      });

      // pipeline may return a single tensor [batch, dims] or per-item.
      if (
        output?.dims &&
        Array.isArray(output.dims) &&
        output.dims.length === 2
      ) {
        const [rows, cols] = output.dims as [number, number];
        const data = output.data as Float32Array;
        for (let row = 0; row < rows; row += 1) {
          vectors.push(data.slice(row * cols, row * cols + cols));
        }
      } else if (Array.isArray(output)) {
        for (const item of output) {
          vectors.push(tensorToVector(item));
        }
      } else {
        // Single text path
        vectors.push(tensorToVector(output));
      }
    }

    if (vectors.length !== texts.length) {
      throw new Error("Builtin embedding response size mismatch.");
    }
    return vectors;
  }
}
