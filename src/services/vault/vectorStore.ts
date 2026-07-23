export interface VectorRecord {
  id: string;
  contentHash: string;
  values: number[];
}

export interface VectorStoreSnapshot {
  version: 1;
  vaultRoot: string;
  model: string;
  dims: number;
  builtAt: number;
  records: VectorRecord[];
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class VectorStore {
  private records = new Map<string, VectorRecord>();
  dims = 0;
  model = "";
  vaultRoot = "";
  builtAt = 0;

  load(snapshot: VectorStoreSnapshot | null): void {
    this.records.clear();
    if (!snapshot) {
      this.dims = 0;
      this.model = "";
      this.vaultRoot = "";
      this.builtAt = 0;
      return;
    }
    this.dims = snapshot.dims;
    this.model = snapshot.model;
    this.vaultRoot = snapshot.vaultRoot;
    this.builtAt = snapshot.builtAt;
    for (const record of snapshot.records) {
      this.records.set(record.id, record);
    }
  }

  toSnapshot(): VectorStoreSnapshot {
    return {
      version: 1,
      vaultRoot: this.vaultRoot,
      model: this.model,
      dims: this.dims,
      builtAt: this.builtAt || Date.now(),
      records: [...this.records.values()],
    };
  }

  upsert(
    entries: Array<{ id: string; contentHash: string; values: Float32Array }>,
  ): void {
    for (const entry of entries) {
      if (this.dims === 0) this.dims = entry.values.length;
      this.records.set(entry.id, {
        id: entry.id,
        contentHash: entry.contentHash,
        values: Array.from(entry.values),
      });
    }
    this.builtAt = Date.now();
  }

  remove(ids: string[]): void {
    for (const id of ids) {
      this.records.delete(id);
    }
    this.builtAt = Date.now();
  }

  /** Remap vector record ids (e.g. after note rename changes `relPath#n`). */
  remapIds(idMap: Record<string, string>): void {
    const entries = Object.entries(idMap);
    if (entries.length === 0) return;
    for (const [from, to] of entries) {
      if (!to || from === to) continue;
      const record = this.records.get(from);
      if (!record) continue;
      this.records.delete(from);
      this.records.set(to, { ...record, id: to });
    }
    this.builtAt = Date.now();
  }

  get(id: string): VectorRecord | undefined {
    return this.records.get(id);
  }

  size(): number {
    return this.records.size;
  }

  search(
    query: Float32Array,
    topK: number,
  ): Array<{ id: string; score: number }> {
    const scored: Array<{ id: string; score: number }> = [];
    for (const record of this.records.values()) {
      const score = cosineSimilarity(query, Float32Array.from(record.values));
      if (score <= 0) continue;
      scored.push({ id: record.id, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, topK));
  }
}
