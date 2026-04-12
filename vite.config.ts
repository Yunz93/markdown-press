import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Detect Tauri build environment
    const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined;
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      publicDir: 'public',
      plugins: [react()],
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        // Expose build mode to application
        __DEV__: mode === 'development',
        __PROD__: mode === 'production',
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      },
      // Tauri 构建配置
      build: {
        target: 'esnext',
        outDir: 'dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1600,
        // Generate source maps for debugging
        sourcemap: mode === 'development',
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) {
                return undefined;
              }

              if (
                id.includes('/@codemirror/')
                || id.includes('/@lezer/')
              ) {
                return 'editor-vendor';
              }

              if (
                id.includes('/markdown-it')
                || id.includes('/shiki/')
                || id.includes('/@shikijs/')
                || id.includes('/katex/')
                || id.includes('/dompurify/')
                || id.includes('/github-markdown-css/')
              ) {
                return 'markdown-vendor';
              }

              if (id.includes('/@tauri-apps/')) {
                return 'tauri-vendor';
              }

              if (
                id.includes('/react/')
                || id.includes('/react-dom/')
                || id.includes('/scheduler/')
              ) {
                return 'react-vendor';
              }

              return undefined;
            }
          }
        }
      },
      // Base path: absolute for production/Tauri (asset:// protocol), relative for web dev
      base: mode === 'production' ? '/' : './',
    };
});
