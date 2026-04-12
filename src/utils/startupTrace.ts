import { isTauriEnvironment } from '../types/filesystem';

declare global {
  interface Window {
    __MP_STARTUP_TRACE__?: string[];
  }
}

const traceStart =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

let traceSequence = 0;
let tauriTraceUnavailable = false;

function formatDetail(detail?: unknown): string {
  if (detail === undefined) {
    return '';
  }

  if (typeof detail === 'string') {
    return detail;
  }

  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function buildTraceLine(event: string, detail?: unknown): string {
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const elapsedMs = Math.round(now - traceStart);
  const sequence = ++traceSequence;
  const suffix = formatDetail(detail);
  return suffix
    ? `[startup][${sequence}][+${elapsedMs}ms] ${event} | ${suffix}`
    : `[startup][${sequence}][+${elapsedMs}ms] ${event}`;
}

function storeTrace(line: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const existing = window.__MP_STARTUP_TRACE__ ?? [];
  existing.push(line);
  if (existing.length > 200) {
    existing.splice(0, existing.length - 200);
  }
  window.__MP_STARTUP_TRACE__ = existing;
}

async function forwardTraceToTauri(line: string): Promise<void> {
  if (tauriTraceUnavailable || !isTauriEnvironment()) {
    return;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('trace_startup', { event: line });
  } catch (error) {
    tauriTraceUnavailable = true;
    console.warn('[startup] Failed to forward trace to Tauri:', error);
  }
}

export function traceStartup(event: string, detail?: unknown): void {
  const line = buildTraceLine(event, detail);
  storeTrace(line);
  console.info(line);
  void forwardTraceToTauri(line);
}
