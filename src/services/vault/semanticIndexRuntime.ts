import type { ChunkIndexSnapshot } from "../../types/vaultIndex";
import { VectorStore } from "./vectorStore";

let activeVaultRoot: string | null = null;
let activeChunkIndex: ChunkIndexSnapshot | null = null;
let activeVectorStore: VectorStore | null = null;

export function getActiveChunkIndex(): ChunkIndexSnapshot | null {
  return activeChunkIndex;
}

export function setActiveChunkIndex(snapshot: ChunkIndexSnapshot | null): void {
  activeChunkIndex = snapshot;
  activeVaultRoot = snapshot?.vaultRoot ?? activeVaultRoot;
}

export function getActiveVectorStore(): VectorStore | null {
  return activeVectorStore;
}

export function ensureActiveVectorStore(vaultRoot: string): VectorStore {
  if (
    !activeVectorStore ||
    activeVectorStore.vaultRoot !== vaultRoot.replace(/\\/g, "/")
  ) {
    activeVectorStore = new VectorStore();
    activeVectorStore.vaultRoot = vaultRoot.replace(/\\/g, "/");
  }
  return activeVectorStore;
}

export function clearSemanticRuntime(): void {
  activeVaultRoot = null;
  activeChunkIndex = null;
  activeVectorStore = null;
}

export function getActiveSemanticVaultRoot(): string | null {
  return activeVaultRoot;
}
