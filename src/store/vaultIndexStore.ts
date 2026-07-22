import type { LinkIndexProgress, LinkIndexSnapshot } from "../types/vaultIndex";

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
  rightRailTab: "outline" | "links";
}

export interface VaultIndexActions {
  setLinkIndex: (snapshot: LinkIndexSnapshot | null) => void;
  setLinkIndexProgress: (progress: Partial<LinkIndexProgress>) => void;
  resetLinkIndexProgress: () => void;
  setRightRailTab: (tab: "outline" | "links") => void;
}

export type VaultIndexSlice = VaultIndexState & VaultIndexActions;

export const initialVaultIndexState: VaultIndexState = {
  linkIndex: null,
  linkIndexProgress: idleProgress,
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

    setRightRailTab: (tab) => set(() => ({ rightRailTab: tab })),
  };
}
