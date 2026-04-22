import { isTauriEnvironment } from '../types/filesystem';

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriEnvironment()) {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
    return;
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
