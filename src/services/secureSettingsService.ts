import { invoke, type InvokeArgs } from '@tauri-apps/api/core';
import type { AppSettings } from '../types';
import { isTauriEnvironment, waitForTauri } from '../types/filesystem';

const SETTINGS_STORAGE_KEY = 'markdown-press-settings';
const SECURE_SETTINGS_WAIT_MS = 5000;

export const SENSITIVE_SETTING_KEYS = ['blogGithubToken', 'geminiApiKey', 'codexApiKey'] as const;

export type SensitiveSettingKey = typeof SENSITIVE_SETTING_KEYS[number];
export type SensitiveSettings = Pick<AppSettings, SensitiveSettingKey>;

interface SecureSettingsPayload {
  blogGithubToken?: string | null;
  geminiApiKey?: string | null;
  codexApiKey?: string | null;
}

const secureWriteQueue = new Map<SensitiveSettingKey, Promise<void>>();

function normalizeSecretValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

function getSecurePayloadValue(
  payload: SecureSettingsPayload,
  key: SensitiveSettingKey
): string {
  return normalizeSecretValue(payload[key]);
}

async function ensureSecureSettingsBackendReady(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  if (isTauriEnvironment()) {
    return true;
  }

  return waitForTauri(SECURE_SETTINGS_WAIT_MS);
}

async function invokeSecureSettingsCommand<T>(command: string, args?: InvokeArgs): Promise<T> {
  const ready = await ensureSecureSettingsBackendReady();
  if (!ready) {
    throw new Error('Secure settings backend is unavailable.');
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Secure settings request failed: ${message}`);
  }
}

function scrubSensitiveSettingsInObject(target: unknown): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }

  let changed = false;
  const record = target as Record<string, unknown>;

  if (record.settings && typeof record.settings === 'object') {
    changed = scrubSensitiveSettingsInObject(record.settings) || changed;
  }

  if (record.state && typeof record.state === 'object') {
    changed = scrubSensitiveSettingsInObject(record.state) || changed;
  }

  SENSITIVE_SETTING_KEYS.forEach((key) => {
    if (key in record) {
      delete record[key];
      changed = true;
    }
  });

  return changed;
}

export function scrubSensitiveSettingsFromLocalStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!scrubSensitiveSettingsInObject(parsed)) {
      return;
    }
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.warn('Failed to scrub sensitive settings from localStorage:', error);
  }
}

export async function loadSecureSettings(): Promise<Partial<SensitiveSettings>> {
  scrubSensitiveSettingsFromLocalStorage();

  try {
    const payload = await invokeSecureSettingsCommand<SecureSettingsPayload>('get_secure_settings');
    return {
      blogGithubToken: normalizeSecretValue(payload.blogGithubToken),
      geminiApiKey: normalizeSecretValue(payload.geminiApiKey),
      codexApiKey: normalizeSecretValue(payload.codexApiKey),
    };
  } catch (error) {
    console.warn('Failed to load secure settings:', error);
    return {};
  }
}

export async function persistSecureSetting(key: SensitiveSettingKey, value: string): Promise<void> {
  scrubSensitiveSettingsFromLocalStorage();

  const previousWrite = secureWriteQueue.get(key) ?? Promise.resolve();
  const nextWrite = previousWrite
    .catch(() => {})
    .then(async () => {
      const trimmed = value.trim();
      await invokeSecureSettingsCommand('set_secure_secret', {
        key,
        value: trimmed ? trimmed : null,
      });

      const stored = await invokeSecureSettingsCommand<SecureSettingsPayload>('get_secure_settings');
      const persistedValue = getSecurePayloadValue(stored, key);
      if (persistedValue !== trimmed) {
        throw new Error(
          `Secure setting verification failed for ${key}: expected ${trimmed ? 'a stored value' : 'an empty value'}, got ${persistedValue ? 'a different stored value' : 'an empty value'}.`
        );
      }
    });

  secureWriteQueue.set(key, nextWrite);

  try {
    await nextWrite;
  } finally {
    if (secureWriteQueue.get(key) === nextWrite) {
      secureWriteQueue.delete(key);
    }
  }
}

export async function migrateLegacySensitiveSettings(
  settings: AppSettings
): Promise<Partial<SensitiveSettings>> {
  const secureBackendReady = await ensureSecureSettingsBackendReady();
  const loaded = secureBackendReady ? await loadSecureSettings() : {};
  const next: Partial<SensitiveSettings> = { ...loaded };

  for (const key of SENSITIVE_SETTING_KEYS) {
    const legacyValue = typeof settings[key] === 'string' ? settings[key] : '';
    const secureValue = typeof loaded[key] === 'string' ? loaded[key] : '';

    if (!secureValue && legacyValue.trim() && secureBackendReady) {
      await persistSecureSetting(key, legacyValue);
      next[key] = legacyValue;
      continue;
    }

    next[key] = secureValue || legacyValue || '';
  }

  scrubSensitiveSettingsFromLocalStorage();
  return next;
}
