import React, { useState, useCallback } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { exportToHtml, downloadHtml, exportToPlainText, downloadPlainText } from '../../utils/export';
import type { FileNode } from '../../types';
import { getCompositeFontFamily } from '../../utils/fontSettings';

interface ExportMenuProps {
  onClose?: () => void;
}

export type ExportFormat = 'html' | 'plaintext';

function findFileInTree(nodes: FileNode[], id: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFileInTree(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ onClose }) => {
  const content = useAppStore(selectContent);
  const { activeTabId, files, settings, showNotification } = useAppStore();
  const activeFile = activeTabId ? findFileInTree(files, activeTabId) : undefined;
  const fontFamily = getCompositeFontFamily(settings);
  const [isExporting, setIsExporting] = useState(false);
  const [format, setFormat] = useState<ExportFormat | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [includeTOC, setIncludeTOC] = useState(false);

  const handleExport = useCallback(async (exportFormat: ExportFormat) => {
    if (!content) return;

    setIsExporting(true);
    setFormat(exportFormat);

    try {
      const filename = activeFile?.name?.replace('.md', '') || 'export';

      if (exportFormat === 'html') {
        const html = exportToHtml(content, {
          theme,
          includeTOC,
          fontFamily,
          fontSize: settings.fontSize,
        });
        const saved = await downloadHtml(html, filename, activeFile?.path);
        if (saved) {
          showNotification('HTML exported', 'success');
        }
      } else if (exportFormat === 'plaintext') {
        const text = exportToPlainText(content);
        const saved = await downloadPlainText(text, filename);
        if (saved) {
          showNotification('Plain text exported', 'success');
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      showNotification('Export failed', 'error');
    } finally {
      setIsExporting(false);
      setFormat(null);
      onClose?.();
    }
  }, [content, activeFile, theme, includeTOC, onClose, fontFamily, settings.fontSize, showNotification]);

  const fileName = activeFile?.name?.replace('.md', '') || 'document';

  return (
    <div className="export-menu glass rounded-xl shadow-2xl p-4 min-w-[280px] border border-gray-200 dark:border-white/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Export</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        {/* Format selection */}
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
            Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleExport('html')}
              disabled={isExporting}
              className={`export-btn flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                format === 'html'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-gray-200 dark:border-white/10 hover:border-accent/50'
              } disabled:opacity-50`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span className="text-xs">HTML</span>
            </button>

            <button
              onClick={() => handleExport('plaintext')}
              disabled={isExporting}
              className={`export-btn flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                format === 'plaintext'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-gray-200 dark:border-white/10 hover:border-accent/50'
              } disabled:opacity-50`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span className="text-xs">Plain Text</span>
            </button>
          </div>
        </div>

        {/* HTML options */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block">
            Options
          </label>

          <label className="export-option flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTOC}
              onChange={(e) => setIncludeTOC(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent"
            />
            <span className="text-sm">Include table of contents</span>
          </label>

          <label className="export-option flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="theme"
              checked={theme === 'light'}
              onChange={() => setTheme('light')}
              className="w-4 h-4 text-accent focus:ring-accent"
            />
            <span className="text-sm">Light theme</span>
          </label>

          <label className="export-option flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="theme"
              checked={theme === 'dark'}
              onChange={() => setTheme('dark')}
              className="w-4 h-4 text-accent focus:ring-accent"
            />
            <span className="text-sm">Dark theme</span>
          </label>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/10">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Exporting: <span className="font-medium text-gray-700 dark:text-gray-300">{fileName}.md</span>
        </p>
      </div>

      {isExporting && (
        <div className="exporting-overlay absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <div className="flex items-center gap-3 text-accent">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="font-medium">Exporting...</span>
          </div>
        </div>
      )}
    </div>
  );
};
