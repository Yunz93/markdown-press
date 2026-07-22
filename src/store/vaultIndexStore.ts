import type {
  ChunkIndexSnapshot,
  LinkIndexProgress,
  LinkIndexSnapshot,
} from "../types/vaultIndex";

const idleProgress: LinkIndexProgress = {
  phase: "idle",
  done: 0,
  total: 0,
  currentPath: null,
  error: null,
  builtAt: null,
};

export interface VaultIndexState {
  linkIndex: LinkIndexSnapshot | null;
  linkIndexProgress: LinkIndexProgress;
  chunkIndex: ChunkIndexSnapshot | null;
  semanticReady: boolean;
  semanticVectorCount: number;
  rightRailTab: "outline" | "links" | "related";
}

export interface VaultIndexActions {
  setLinkIndex: (snapshot: LinkIndexSnapshot | null) => void;
  setLinkIndexProgress: (progress: Partial<LinkIndexProgress>) => void;
  resetLinkIndexProgress: () => void;
  setChunkIndex: (snapshot: ChunkIndexSnapshot | null) => void;
  setSemanticStatus: (ready: boolean, vectorCount: number) => void;
  setRightRailTab: (tab: "outline" | "links" | "related") => void;
}

export type VaultIndexSlice = VaultIndexState & VaultIndexActions;

export const initialVaultIndexState: VaultIndexState = {
  linkIndex: null,
  linkIndexProgress: idleProgress,
  chunkIndex: null,
  semanticReady: false,
  semanticVectorCount: 0,
  rightRailTab: "outline",
};

export function createVaultIndexSlice(
  set: (fn: (state: VaultIndexState) => Partial<VaultIndexState>) => void,
  _get: () => VaultIndexSlice,
): VaultIndexSlice {
  return {
    ...initialVaultIndexState,

    setLinkIndex: (snapshot) =>
      set(() => ({
        linkIndex: snapshot,
        linkIndexProgress: {
          ...idleProgress,
          phase: "idle",
          builtAt: snapshot?.builtAt ?? null,
        },
      })),

    setLinkIndexProgress: (progress) =>
      set((state) => ({
        linkIndexProgress: { ...state.linkIndexProgress, ...progress },
      })),

    resetLinkIndexProgress: () =>
      set(() => ({ linkIndexProgress: idleProgress })),

    setChunkIndex: (snapshot) => set(() => ({ chunkIndex: snapshot })),

    setSemanticStatus: (ready, vectorCount) =>
      set(() => ({
        semanticReady: ready,
        semanticVectorCount: vectorCount,
      })),

    setRightRailTab: (tab) => set(() => ({ rightRailTab: tab })),
  };
}
