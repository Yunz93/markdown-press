import type { FontSettings } from '../fontSettings';
import type { ShikiHighlighter } from '../../hooks/useShikiHighlighter';

export interface ExportOptions {
  title?: string;
  theme?: 'light' | 'dark';
  includeTOC?: boolean;
  fontFamily?: string;
  codeFontFamily?: string;
  fontSettings?: FontSettings;
  fontSize?: number;
  codeFontSize?: number;
  includeProperties?: boolean;
  highlighter?: ShikiHighlighter | null;
}

export interface SaveExportOptions {
  content: string | Uint8Array;
  filename: string;
  defaultExtension: string;
  mimeType: string;
  description: string;
}

export const PREVIEW_PANEL_WIDTH_PX = 768;
