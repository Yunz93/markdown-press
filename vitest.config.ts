import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environmentMatchGlobs: [
      ["src/components/**", "happy-dom"],
      ["src/hooks/**", "happy-dom"],
      ["src/app/**", "happy-dom"],
      ["src/store/**", "happy-dom"],
      ["src/styles/**", "happy-dom"],
      ["src/**", "node"],
    ],
  },
});
