import type { EmbeddingProviderId } from "../../types/vaultIndex";

/** Multilingual MiniLM — works in Transformers.js without e5 tokenizer hacks. */
export const BUILTIN_EMBEDDING_MODEL =
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const BUILTIN_EMBEDDING_DIMS = 384;

export type BuiltinEmbeddingHub = "auto" | "huggingface" | "hf-mirror";

export const BUILTIN_EMBEDDING_HUBS: Record<
  Exclude<BuiltinEmbeddingHub, "auto">,
  string
> = {
  huggingface: "https://huggingface.co/",
  "hf-mirror": "https://hf-mirror.com/",
};

export type BuiltinEmbeddingPhase = "idle" | "loading" | "ready" | "error";

export interface BuiltinEmbeddingStatus {
  phase: BuiltinEmbeddingPhase;
  /** 0–1 while downloading / initializing */
  progress: number;
  model: string;
  hub: string | null;
  error: string | null;
}

type StatusListener = (status: BuiltinEmbeddingStatus) => void;

let status: BuiltinEmbeddingStatus = {
  phase: "idle",
  progress: 0,
  model: BUILTIN_EMBEDDING_MODEL,
  hub: null,
  error: null,
};

const listeners = new Set<StatusListener>();

type FeaturePipeline = (
  texts: string | string[],
  options?: any,
) => Promise<any>;

let pipelinePromise: Promise<FeaturePipeline> | null = null;
let extractor: FeaturePipeline | null = null;
let loadedHub: string | null = null;

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

/** Drop cached pipeline so the next call re-downloads / switches hub. */
export function resetBuiltinEmbeddingPipeline(): void {
  pipelinePromise = null;
  extractor = null;
  loadedHub = null;
  setStatus({
    phase: "idle",
    progress: 0,
    hub: null,
    error: null,
  });
}

function resolveHubPreference(
  preference: BuiltinEmbeddingHub | undefined,
): BuiltinEmbeddingHub {
  return preference ?? "auto";
}

/** Ordered hubs to attempt for a preference. Exported for unit tests. */
export function listBuiltinEmbeddingHubsToTry(
  preference: BuiltinEmbeddingHub,
): string[] {
  if (preference === "huggingface") {
    return [BUILTIN_EMBEDDING_HUBS.huggingface];
  }
  if (preference === "hf-mirror") {
    return [BUILTIN_EMBEDDING_HUBS["hf-mirror"]];
  }
  // auto: official first, then China-friendly mirror
  return [
    BUILTIN_EMBEDDING_HUBS.huggingface,
    BUILTIN_EMBEDDING_HUBS["hf-mirror"],
  ];
}

function isLikelyNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : String(error ?? "");
  return /network|fetch|failed to fetch|econnreset|enotfound|etimedout|abort|cors|load failed|unreachable|ssl|certificate|403|429|502|503|504/i.test(
    message,
  );
}

function formatLoadError(error: unknown, triedHubs: string[]): string {
  const detail =
    error instanceof Error ? error.message : "Failed to load builtin model";
  const hubs = triedHubs.join(" → ");
  return `${detail} (tried: ${hubs}). If Hugging Face is unreachable, switch Index → model hub to hf-mirror. / 若无法访问 Hugging Face，请在「索引」设置将模型下载源改为「国内镜像」。`;
}

/**
 * Quick reachability check before pulling multi‑MB weights.
 * Avoids hanging for minutes on a blocked huggingface.co in auto mode.
 */
export async function probeBuiltinEmbeddingHub(
  remoteHost: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const base = remoteHost.endsWith("/") ? remoteHost.slice(0, -1) : remoteHost;
  const url = `${base}/${BUILTIN_EMBEDDING_MODEL}/resolve/main/config.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function orderHubsByReachability(hubs: string[]): Promise<string[]> {
  if (hubs.length <= 1) return hubs;
  const reachable: string[] = [];
  const unreachable: string[] = [];
  for (const hub of hubs) {
    setStatus({
      phase: "loading",
      progress: 0.01,
      hub,
      error: null,
    });

    const ok = await probeBuiltinEmbeddingHub(hub);
    if (ok) reachable.push(hub);
    else unreachable.push(hub);
  }
  // Prefer reachable hubs; keep unreachable as last resort (probe false-negatives).
  return reachable.length > 0 ? [...reachable, ...unreachable] : hubs;
}

function readProgressRatio(progress: {
  status?: string;
  progress?: number;
  progress_total?: number;
  loaded?: number;
  total?: number;
}): number | null {
  if (
    typeof progress.progress_total === "number" &&
    Number.isFinite(progress.progress_total)
  ) {
    return Math.min(0.99, Math.max(0.02, progress.progress_total / 100));
  }
  if (
    typeof progress.progress === "number" &&
    Number.isFinite(progress.progress)
  ) {
    // Some callbacks report 0–1, others 0–100.
    const value =
      progress.progress <= 1 ? progress.progress * 100 : progress.progress;
    return Math.min(0.99, Math.max(0.02, value / 100));
  }
  if (
    typeof progress.loaded === "number" &&
    typeof progress.total === "number" &&
    progress.total > 0
  ) {
    return Math.min(0.99, Math.max(0.02, progress.loaded / progress.total));
  }
  return null;
}

async function loadPipelineFromHub(
  remoteHost: string,
): Promise<FeaturePipeline> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  env.remoteHost = remoteHost.endsWith("/") ? remoteHost : `${remoteHost}/`;

  setStatus({
    phase: "loading",
    progress: 0.02,
    error: null,
    model: BUILTIN_EMBEDDING_MODEL,
    hub: env.remoteHost,
  });

  const loaded = await pipeline("feature-extraction", BUILTIN_EMBEDDING_MODEL, {
    dtype: "q8",
    progress_callback: (progress: {
      status?: string;
      progress?: number;
      progress_total?: number;
      loaded?: number;
      total?: number;
    }) => {
      const ratio = readProgressRatio(progress);
      if (ratio !== null) {
        setStatus({ phase: "loading", progress: ratio, hub: env.remoteHost });
      }
    },
  });

  return loaded as unknown as FeaturePipeline;
}

async function loadPipeline(
  hubPreference?: BuiltinEmbeddingHub,
): Promise<FeaturePipeline> {
  if (extractor) return extractor;
  if (pipelinePromise) return pipelinePromise;

  const preference = resolveHubPreference(hubPreference);

  pipelinePromise = (async () => {
    let tried = listBuiltinEmbeddingHubsToTry(preference);
    if (preference === "auto") {
      tried = await orderHubsByReachability(tried);
    }

    let lastError: unknown = null;
    for (let index = 0; index < tried.length; index += 1) {
      const hub = tried[index]!;
      try {
        const loaded = await loadPipelineFromHub(hub);
        extractor = loaded;
        loadedHub = hub;
        setStatus({
          phase: "ready",
          progress: 1,
          error: null,
          hub,
        });
        return extractor;
      } catch (error) {
        lastError = error;
        extractor = null;
        loadedHub = null;
        const canRetry =
          index < tried.length - 1 && isLikelyNetworkError(error);
        if (!canRetry) break;
        setStatus({
          phase: "loading",
          progress: 0.02,
          hub: tried[index + 1] ?? null,
          error: null,
        });
      }
    }

    pipelinePromise = null;
    const message = formatLoadError(lastError, tried);
    setStatus({ phase: "error", progress: 0, error: message, hub: null });
    throw new Error(message);
  })();

  return pipelinePromise;
}

/** Warm the model (download + init). Safe to call from settings UI. */
export async function ensureBuiltinEmbeddingReady(
  hubPreference?: BuiltinEmbeddingHub,
): Promise<void> {
  // If preference changed since last success, force reload.
  if (
    extractor &&
    hubPreference &&
    hubPreference !== "auto" &&
    loadedHub &&
    BUILTIN_EMBEDDING_HUBS[hubPreference] !== loadedHub
  ) {
    resetBuiltinEmbeddingPipeline();
  }
  await loadPipeline(hubPreference);
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

  constructor(
    private readonly options: {
      hub?: BuiltinEmbeddingHub;
    } = {},
  ) {}

  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    if (signal?.aborted) {
      throw new DOMException("Embedding aborted", "AbortError");
    }

    const pipe = await loadPipeline(this.options.hub);
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
