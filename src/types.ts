export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  children?: FileNode[];
  path: string;
  isPublished?: boolean;
  isTrash?: boolean;
}

export interface Frontmatter {
  title?: string;
  date?: string;
  tags?: string[];
  description?: string;
  layout?: string;
  slug?: string;
  aliases?: string | string[];
  link?: string;
  [key: string]: string | string[] | number | boolean | null | undefined;
}

export interface ParsedMarkdown {
  frontmatter: Frontmatter | null;
  body: string;
}

export interface MarkdownFile {
  frontmatter: Frontmatter;
  body: string;
  raw: string;
}

export enum ViewMode {
  EDITOR = 'EDITOR',
  PREVIEW = 'PREVIEW',
  SPLIT = 'SPLIT'
}

export interface AIAnalysisResult {
  summary: string;
  suggestedTags: string[];
  seoTitle: string;
  optimizedMarkdown: string;
}

export interface AIWikiReference {
  title: string;
  url?: string;
  note?: string;
}

export interface AIWikiGenerationResult {
  title: string;
  summary: string;
  category: string;
  suggestedTags: string[];
  markdown: string;
  references: AIWikiReference[];
  citations: string[];
}

export type AIProvider = 'gemini' | 'codex';

export interface ShortcutConfig {
  save: string;
  toggleView: string;
  aiAnalyze: string;
  search: string;
  sidebarSearch: string;
  locateCurrentFile: string;
  settings: string;
  toggleOutline: string;
  toggleSidebar: string;
  toggleTheme: string;
  newNote: string;
  newFolder: string;
  closeTab: string;
  openKnowledgeBase: string;
  exportPdf: string;
}

export interface MetadataField {
  key: string;
  defaultValue: string;
}

export interface KnowledgeBaseMeta {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export type ThemeMode = 'light' | 'dark';
export type AppLanguage = 'zh-CN' | 'en';
export type AttachmentPasteFormat = 'markdown' | 'obsidian';
export type OrderedListMode = 'strict' | 'loose';

export type ImageHostingProvider = 'none' | 'github' | 's3' | 'aliyun_oss' | 'qiniu' | 'custom';
export type ImagePasteAction = 'local' | 'upload';

export interface ImageHostingGitHubConfig {
  repo: string;
  branch: string;
  path: string;
  customDomain: string;
}

export interface ImageHostingS3Config {
  endpoint: string;
  region: string;
  bucket: string;
  pathPrefix: string;
  accessKeyId: string;
  customDomain: string;
}

export interface ImageHostingAliyunOssConfig {
  endpoint: string;
  bucket: string;
  pathPrefix: string;
  accessKeyId: string;
  customDomain: string;
}

export interface ImageHostingQiniuConfig {
  bucket: string;
  zone: string;
  accessKey: string;
  pathPrefix: string;
  domain: string;
}

export interface ImageHostingCustomConfig {
  uploadUrl: string;
  method: 'POST' | 'PUT';
  headers: string;
  fileFieldName: string;
  responseUrlJsonPath: string;
}

export interface ImageHostingConfig {
  provider: ImageHostingProvider;
  pasteAction: ImagePasteAction;
  keepLocalCopy: boolean;
  github: ImageHostingGitHubConfig;
  s3: ImageHostingS3Config;
  aliyunOss: ImageHostingAliyunOssConfig;
  qiniu: ImageHostingQiniuConfig;
  custom: ImageHostingCustomConfig;
}

export interface AppSettings {
  language: AppLanguage;
  aiProvider: AIProvider;
  uiFontFamily: string;
  uiFontSize: number;
  editorFontFamily: string;
  previewFontFamily: string;
  codeFontFamily: string;
  fontSize: number;
  wordWrap: boolean;
  formatMarkdownOnManualSave: boolean;
  resourceFolder: string;
  wikiFolder: string;
  trashFolder: string;
  attachmentPasteFormat: AttachmentPasteFormat;
  orderedListMode: OrderedListMode;
  blogRepoUrl: string;
  blogSiteUrl: string;
  blogGithubToken?: string;
  wechatAppId: string;
  wechatAppSecret?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  codexApiBaseUrl?: string;
  codexApiKey?: string;
  codexModel?: string;
  aiSystemPrompt?: string;
  aiSystemPromptZh?: string;
  aiSystemPromptEn?: string;
  wikiPromptTemplate?: string;
  wikiPromptTemplateZh?: string;
  wikiPromptTemplateEn?: string;
  imageHosting: ImageHostingConfig;
  imageHostingGithubToken?: string;
  imageHostingS3SecretAccessKey?: string;
  imageHostingOssAccessKeySecret?: string;
  imageHostingQiniuSecretKey?: string;
  shortcuts: ShortcutConfig;
  knowledgeBases: KnowledgeBaseMeta[];
  lastKnowledgeBasePath?: string;
  lastOpenedFilePath?: string;
  themeMode: ThemeMode;
  metadataFields: MetadataField[];
  autoSaveInterval: number; // Auto-save interval in milliseconds
  autoCheckForUpdates: boolean;
  skippedUpdateVersion: string;
  lastUpdateCheckAt: string;
}

export interface Notification {
  msg: string;
  type: 'success' | 'error' | 'info';
}

export interface DragDropEvent {
  payload: {
    paths: string[];
  };
}
