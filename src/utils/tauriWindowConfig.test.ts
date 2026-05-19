import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type TauriWindowConfig = {
  label?: string;
  title?: string;
};

type TauriConfig = {
  productName?: string;
  app?: {
    windows?: TauriWindowConfig[];
  };
};

type TauriCapabilityConfig = {
  windows?: string[];
};

function readTauriConfig(path: string): TauriConfig {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as TauriConfig;
}

function readTauriCapabilityConfig(path: string): TauriCapabilityConfig {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as TauriCapabilityConfig;
}

function getMainWindowTitle(config: TauriConfig): string | undefined {
  return config.app?.windows?.find((windowConfig) => windowConfig.label === 'main')?.title;
}

describe('Tauri window config', () => {
  it('keeps the release main window discoverable by macOS window listing', () => {
    const config = readTauriConfig('src-tauri/tauri.conf.json');

    expect(getMainWindowTitle(config)).toBe(config.productName);
  });

  it('keeps the dev main window discoverable by macOS window listing', () => {
    const releaseConfig = readTauriConfig('src-tauri/tauri.conf.json');
    const devConfig = readTauriConfig('src-tauri/tauri.dev.conf.json');

    expect(getMainWindowTitle(devConfig)).toBe(releaseConfig.productName);
  });

  it('grants the default desktop permissions to file document windows', () => {
    const capability = readTauriCapabilityConfig('src-tauri/capabilities/default.json');

    expect(capability.windows).toContain('main');
    expect(capability.windows).toContain('file-*');
  });
});
