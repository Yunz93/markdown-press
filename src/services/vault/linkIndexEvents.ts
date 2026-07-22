type FileSavedHandler = (path: string, content: string) => void;
type RebuildHandler = () => Promise<void>;

let fileSavedHandler: FileSavedHandler | null = null;
let rebuildHandler: RebuildHandler | null = null;

export function setVaultFileSavedHandler(
  handler: FileSavedHandler | null,
): void {
  fileSavedHandler = handler;
}

export function notifyVaultFileSaved(path: string, content: string): void {
  try {
    fileSavedHandler?.(path, content);
  } catch (error) {
    console.warn("Vault file-saved handler failed:", error);
  }
}

export function setVaultRebuildHandler(handler: RebuildHandler | null): void {
  rebuildHandler = handler;
}

export async function requestVaultLinkIndexRebuild(): Promise<void> {
  if (!rebuildHandler) {
    throw new Error("Link index rebuild is not available yet.");
  }
  await rebuildHandler();
}
