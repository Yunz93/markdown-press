/**
 * Draft backups are written to localStorage when saving a file to disk fails
 * (see useAutoSave). These helpers close the loop: reading a backup back when
 * the file is reopened, and clearing it once a save succeeds or the user
 * discards it.
 */

export function draftBackupKey(fileId: string): string {
  return `draft_${fileId}`;
}

export function readDraftBackup(fileId: string): string | null {
  try {
    return localStorage.getItem(draftBackupKey(fileId));
  } catch {
    return null;
  }
}

export function writeDraftBackup(fileId: string, content: string): boolean {
  try {
    localStorage.setItem(draftBackupKey(fileId), content);
    return true;
  } catch {
    return false;
  }
}

export function clearDraftBackup(fileId: string): void {
  try {
    localStorage.removeItem(draftBackupKey(fileId));
  } catch {
    // Ignore storage errors.
  }
}
