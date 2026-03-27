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

export interface ShortcutConfig {
  save: string;
  toggleView: string;
  aiAnalyze: string;
  search: string;
  sidebarSearch: string;
  settings: string;
  toggleOutline: string;
  toggleSidebar: string;
  toggleTheme: string;
  newNote: string;
  newFolder: string;
  closeTab: string;
  openKnowledgeBase: string;
  exportHtml: string;
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
export type AttachmentPasteFormat = 'markdown' | 'obsidian';

export interface AppSettings {
  fontSize: number;
  wordWrap: boolean;
  englishFontFamily: string;
  chineseFontFamily: string;
  resourceFolder: string;
  attachmentPasteFormat: AttachmentPasteFormat;
  githubRepo: string;
  geminiApiKey?: string;
  geminiModel?: string;
  shortcuts: ShortcutConfig;
  knowledgeBases: KnowledgeBaseMeta[];
  lastKnowledgeBasePath?: string;
  themeMode: ThemeMode;
  metadataFields: MetadataField[];
  autoSaveInterval: number; // Auto-save interval in milliseconds
}

export interface Notification {
  msg: string;
  type: 'success' | 'error';
}

export interface DragDropEvent {
  payload: {
    paths: string[];
  };
}
