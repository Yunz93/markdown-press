/**
 * Boundary-safe path remapping utilities.
 * Avoids naive `String.replace` prefix collisions (e.g. `/project/test` vs `/project/testing`).
 */

export function remapPathBoundarySafe(
  path: string,
  oldBase: string,
  nextBase: string,
): string {
  if (path === oldBase) {
    return nextBase;
  }
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedOld = oldBase.replace(/\\/g, "/");
  const prefix = normalizedOld.endsWith("/")
    ? normalizedOld
    : `${normalizedOld}/`;
  if (normalizedPath.startsWith(prefix)) {
    const suffix = normalizedPath.slice(prefix.length);
    const normalizedNext = nextBase.replace(/\\/g, "/");
    return suffix.length === 0 ? normalizedNext : `${normalizedNext}/${suffix}`;
  }
  return path;
}

export function remapRecordKeys<T>(
  record: Record<string, T>,
  remapPath: (path: string) => string,
): Record<string, T> {
  const nextRecord: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    nextRecord[remapPath(key)] = value;
  }
  return nextRecord;
}

export interface TabPathRemapSlice {
  openTabs: string[];
  activeTabId: string | null;
  currentFilePath: string | null;
  fileContents: Record<string, string>;
  lastSavedContent: Record<string, string>;
  fileHistories: Record<
    string,
    { past: string[]; future: string[]; maxHistory: number }
  >;
}

export function buildTabPathRemapState(
  state: TabPathRemapSlice,
  pathMap: Record<string, string>,
): Partial<TabPathRemapSlice> {
  const remapPath = (path: string): string => pathMap[path] ?? path;
  const remappedOpenTabs = state.openTabs.map(remapPath);
  const nextOpenTabs = remappedOpenTabs.filter(
    (tabId, index) => remappedOpenTabs.indexOf(tabId) === index,
  );
  const nextActiveTabId = state.activeTabId
    ? remapPath(state.activeTabId)
    : null;
  const validatedActiveTabId =
    nextActiveTabId && nextOpenTabs.includes(nextActiveTabId)
      ? nextActiveTabId
      : (nextOpenTabs[0] ?? null);

  return {
    openTabs: nextOpenTabs,
    activeTabId: validatedActiveTabId,
    currentFilePath: state.currentFilePath
      ? remapPath(state.currentFilePath)
      : null,
    fileContents: remapRecordKeys(state.fileContents, remapPath),
    lastSavedContent: remapRecordKeys(state.lastSavedContent, remapPath),
    fileHistories: remapRecordKeys(state.fileHistories, remapPath),
  };
}

export function migrateDraftBackupKeys(pathMap: Record<string, string>): void {
  if (typeof window === "undefined") return;
  for (const [oldPath, newPath] of Object.entries(pathMap)) {
    if (oldPath === newPath) continue;
    const oldKey = `draft_${oldPath}`;
    const newKey = `draft_${newPath}`;
    const value = window.localStorage.getItem(oldKey);
    if (value === null) continue;
    if (!window.localStorage.getItem(newKey)) {
      window.localStorage.setItem(newKey, value);
    }
    window.localStorage.removeItem(oldKey);
  }
}
