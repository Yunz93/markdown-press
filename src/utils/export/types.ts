import type { FontSettings } from '../fontSettings';

export interface ExportOptions {
  title?: string;
  theme?: 'light' | 'dark';
  includeTOC?: boolean;
  fontFamily?: string;
  fontSettings?: FontSettings;
  fontSize?: number;
  includeProperties?: boolean;
  highlighter?: any | null;
}

export interface SaveExportOptions {
  content: string | Uint8Array;
  filename: string;
  defaultExtension: string;
  mimeType: string;
  description: string;
}

export const PREVIEW_PANEL_WIDTH_PX = 768;
