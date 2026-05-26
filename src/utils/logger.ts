type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  if (typeof window !== "undefined" && (window as any).__LOG_LEVEL__) {
    return (window as any).__LOG_LEVEL__;
  }
  return __DEV__ ? "debug" : "warn";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getMinLevel()];
}

function createLogger(namespace: string) {
  return {
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog("debug")) console.debug(`[${namespace}]`, message, ...args);
    },
    info: (message: string, ...args: unknown[]) => {
      if (shouldLog("info")) console.info(`[${namespace}]`, message, ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog("warn")) console.warn(`[${namespace}]`, message, ...args);
    },
    error: (message: string, ...args: unknown[]) => {
      if (shouldLog("error")) console.error(`[${namespace}]`, message, ...args);
    },
  };
}

export { createLogger };
export type { LogLevel };
