import type { FontSettings } from '../fontSettings';
import type { ShikiHighlighter } from '../../hooks/useShikiHighlighter';
import type { ExportStrikethroughMode, MarkdownStylePreset } from '../../types';

export function normalizeExportStrikethroughMode(mode: unknown): ExportStrikethroughMode {
  return mode === 'raster-safe' ? 'raster-safe' : 'preview-native';
}

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
  markdownStylePreset?: MarkdownStylePreset;
  /** Defaults to `preview-native` when omitted (see `exportToHtml`). */
  exportStrikethroughMode?: ExportStrikethroughMode;
}

export interface SaveExportOptions {
  content: string | Uint8Array;
  filename: string;
  defaultExtension: string;
  mimeType: string;
  description: string;
}

export const PREVIEW_PANEL_WIDTH_PX = 768;
