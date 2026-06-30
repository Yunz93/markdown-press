/**
 * Environment detection and debugging utilities
 * Helps diagnose differences between dev and build modes
 */

import { isTauriEnvironment } from "../types/filesystem";
import { getWebKitCompatSummary } from "./webkitCompat";

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
  if (typeof window === "undefined") return;

  console.group("🚀 Environment Information");
  console.log("Build Mode:", buildMode);
  console.log("Is Development:", isDev);
  console.log("Is Production:", isProd);
  console.log("Is Tauri:", isTauriEnvironment());
  console.log("Window Location:", window.location.href);
  console.log("Document Base URI:", document.baseURI);
  console.log("User Agent:", navigator.userAgent);

  // Check for Tauri-specific globals
  console.log("Has __TAURI_INTERNALS__:", "__TAURI_INTERNALS__" in window);
  console.log("Has __TAURI__:", "__TAURI__" in window);

  // WKWebView compatibility flags
  console.log("WebKit Compat:", getWebKitCompatSummary());

  console.groupEnd();
}

/**
 * Safe wrapper for Tauri API calls with fallback
 * Use this when a feature should work in both Tauri and browser environments
 */
export async function withTauriFallback<T>(
  tauriFn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    if (!isTauriEnvironment()) {
      console.warn("[Tauri] API not available, using fallback");
      return fallback;
    }
    return await tauriFn();
  } catch (error) {
    console.error("[Tauri] API call failed:", error);
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
      `Feature "${featureName}" requires Tauri environment but running in browser`,
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
    location: typeof window !== "undefined" ? window.location.href : "N/A",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "N/A",
  };
}

/**
 * WKWebView（Tauri release 运行时）与浏览器 dev 模式已知差异点
 * 在 dev 模式下主动警告，避免开发时正常、release 崩溃的情况
 */
export function assertDevReleaseParity(): void {
  if (typeof window === "undefined") return;
  if (!isDev) return;

  const isTauri = isTauriEnvironment();
  const protocol = window.location.protocol;

  if (!isTauri) {
    console.group("⚠️ Dev/Release 环境差异提醒");
    console.warn(
      "当前在浏览器 dev 模式，以下行为与 Tauri WKWebView release 不同：",
    );
    console.info(
      "1. 字体加载 — 浏览器支持 CSS @font-face url()，WKWebView 需 FontFace API",
    );
    console.info(
      "2. innerHTML 往返 — 浏览器保留 inline style，WKWebView 可能剥离",
    );
    console.info(
      "3. CSS 变量 — html2canvas 在两种环境都无法解析 var()，需预处理",
    );
    console.info(
      "4. 本地文件协议 — 浏览器用 file://，Tauri 用 tauri://，附件路径不同",
    );
    console.info(
      "5. CSP — dev server 经 cspDevPlugin 注入与 release 一致的 CSP（额外放开 HMR 用的 ws:/inline）",
    );
    console.groupEnd();
    console.info("💡 涉及渲染/字体/导出/文件读写时请用 npm run tauri:dev 验证");
    return;
  }

  if (isTauri && protocol !== "tauri:") {
    console.warn(
      "[Dev/Release] Tauri 环境但协议非 tauri://（当前：%s），请检查是否在 Tauri WebView 中",
      protocol,
    );
  }
}
