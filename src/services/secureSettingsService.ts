import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../types';
import { isTauriEnvironment } from '../types/filesystem';

const SETTINGS_STORAGE_KEY = 'markdown-press-settings';

export const SENSITIVE_SETTING_KEYS = ['blogGithubToken', 'geminiApiKey', 'codexApiKey'] as const;

export type SensitiveSettingKey = typeof SENSITIVE_SETTING_KEYS[number];
export type SensitiveSettings = Pick<AppSettings, SensitiveSettingKey>;

interface SecureSettingsPayload {
  blogGithubToken?: string | null;
  geminiApiKey?: string | null;
  codexApiKey?: string | null;
}

function normalizeSecretValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
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

  if (!isTauriEnvironment()) {
    return {};
  }

  const payload = await invoke<SecureSettingsPayload>('get_secure_settings');
  return {
    blogGithubToken: normalizeSecretValue(payload.blogGithubToken),
    geminiApiKey: normalizeSecretValue(payload.geminiApiKey),
    codexApiKey: normalizeSecretValue(payload.codexApiKey),
  };
}

export async function persistSecureSetting(key: SensitiveSettingKey, value: string): Promise<void> {
  scrubSensitiveSettingsFromLocalStorage();

  if (!isTauriEnvironment()) {
    return;
  }

  const trimmed = value.trim();
  await invoke('set_secure_secret', {
    key,
    value: trimmed ? trimmed : null,
  });
}

export async function migrateLegacySensitiveSettings(
  settings: AppSettings
): Promise<Partial<SensitiveSettings>> {
  const loaded = await loadSecureSettings();
  const next: Partial<SensitiveSettings> = { ...loaded };

  for (const key of SENSITIVE_SETTING_KEYS) {
    const legacyValue = typeof settings[key] === 'string' ? settings[key] : '';
    const secureValue = typeof loaded[key] === 'string' ? loaded[key] : '';

    if (!secureValue && legacyValue.trim() && isTauriEnvironment()) {
      await persistSecureSetting(key, legacyValue);
      next[key] = legacyValue;
      continue;
    }

    next[key] = secureValue || legacyValue || '';
  }

  scrubSensitiveSettingsFromLocalStorage();
  return next;
}
