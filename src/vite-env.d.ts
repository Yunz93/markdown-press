/// <reference types="vite/client" />

declare const __DEV__: boolean;
declare const __PROD__: boolean;

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  readonly VITE_GEMINI_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css?inline' {
  const css: string;
  export default css;
}
