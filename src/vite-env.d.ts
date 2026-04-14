/// <reference types="vite/client" />

declare const __DEV__: boolean;
declare const __PROD__: boolean;

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  const taskLists: MarkdownIt.PluginSimple;
  export default taskLists;
}

declare module '*.css?inline' {
  const css: string;
  export default css;
}
