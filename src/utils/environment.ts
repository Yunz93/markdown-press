/**
 * Environment detection and debugging utilities
 * Helps diagnose differences between dev and build modes
 */

import { isTauriEnvironment } from '../types/filesystem';

/**
 * Current build mode from Vite
 */
export const buildMode = import.meta.env.MODE;

/**
 * True if running in development mode
 */
export const isDev = import.meta.env.DEV;

/**
 * True if running in production mode
 */
export const isProd = import.meta.env.PROD;

/**
 * Log environment information for debugging
 * Call this early in app initialization to diagnose environment issues
 */
export function logEnvironment(): void {
  if (typeof window === 'undefined') return;

  console.group('🚀 Environment Information');
  console.log('Build Mode:', buildMode);
  console.log('Is Development:', isDev);
  console.log('Is Production:', isProd);
  console.log('Is Tauri:', isTauriEnvironment());
  console.log('Window Location:', window.location.href);
  console.log('Document Base URI:', document.baseURI);
  console.log('User Agent:', navigator.userAgent);
  
  // Check for Tauri-specific globals
  console.log('Has __TAURI_INTERNALS__:', '__TAURI_INTERNALS__' in window);
  console.log('Has __TAURI__:', '__TAURI__' in window);
  
  console.groupEnd();
}

/**
 * Safe wrapper for Tauri API calls with fallback
 * Use this when a feature should work in both Tauri and browser environments
 */
export async function withTauriFallback<T>(
  tauriFn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    if (!isTauriEnvironment()) {
      console.warn('[Tauri] API not available, using fallback');
      return fallback;
    }
    return await tauriFn();
  } catch (error) {
    console.error('[Tauri] API call failed:', error);
    return fallback;
  }
}

/**
 * Assert that we are running in Tauri environment
 * Throws an error if not in Tauri (useful for Tauri-only features)
 */
export function assertTauriEnvironment(featureName: string): void {
  if (!isTauriEnvironment()) {
    throw new Error(
      `Feature "${featureName}" requires Tauri environment but running in browser`
    );
  }
}

/**
 * Get a summary of the current environment for debugging
 */
export function getEnvironmentSummary(): Record<string, unknown> {
  return {
    mode: buildMode,
    isDev,
    isProd,
    isTauri: isTauriEnvironment(),
    location: typeof window !== 'undefined' ? window.location.href : 'N/A',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
  };
}
