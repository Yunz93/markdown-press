import React from 'react';
import { ViewMode } from '../../types';
import { ViewModeToggle } from '../toolbar/ViewModeToggle';
import { AIButton } from '../toolbar/AIButton';

interface ToolbarProps {
  fileName: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onAIAnalyze: () => void;
  isAnalyzing: boolean;
  isSaving: boolean;
  onMenuClick: () => void;
  onToggleTheme: () => void;
  themeMode: 'light' | 'dark' | 'solarized-light' | 'solarized-dark' | 'custom';
  onToggleOutline: () => void;
  isOutlineOpen: boolean;
  onToggleSearch: () => void;
  onToggleExport: () => void;
  onExportPdf?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  fileName,
  viewMode,
  onViewModeChange,
  onAIAnalyze,
  isAnalyzing,
  isSaving,
  onMenuClick,
  onToggleTheme,
  themeMode,
  onToggleOutline,
  isOutlineOpen,
  onToggleSearch,
  onToggleExport,
  onExportPdf
}) => {
  const isDark = themeMode === 'dark' || themeMode === 'solarized-dark';

  return (
    <div className="h-16 border-b border-gray-200/50 dark:border-white/5 bg-white/80 dark:bg-black/50 backdrop-blur-md flex items-center px-4 md:px-6 justify-between shrink-0 z-20 sticky top-0 transition-colors">
      <div className="flex items-center gap-4 overflow-hidden">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="flex flex-col min-w-0">
          {fileName ? (
            <>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm md:text-base">
                  {fileName}
                </span>
                {isSaving && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium animate-pulse">
                    <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </span>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-medium">Markdown</span>
            </>
          ) : (
            <span className="text-gray-400 text-sm font-medium">No file selected</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <AIButton
          onClick={onAIAnalyze}
          isLoading={isAnalyzing}
          disabled={!fileName}
        />

        {/* View Mode Toggle - positioned prominently */}
        <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />

        {/* PDF Export Button - right after view mode */}
        {onExportPdf && (
          <button
            onClick={onExportPdf}
            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
            title="Export to PDF"
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </button>
        )}

        {/* Theme Toggle - right after view mode */}
        <button
          onClick={onToggleTheme}
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDark ? (
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

        <button
          onClick={onToggleExport}
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          title="Export (HTML/PDF/Txt)"
        >
          <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>

        <button
          onClick={onToggleSearch}
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          title="Search (Ctrl+F)"
        >
          <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        <button
          onClick={onToggleOutline}
          className={`p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors rounded-lg hover:bg-black/5 dark:hover:bg-white/10 ${
            isOutlineOpen ? 'bg-accent-DEFAULT/10 text-accent-DEFAULT' : ''
          }`}
          title="Toggle Outline (Ctrl+O)"
        >
          <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="4" cy="6" r="2" fill="currentColor" />
            <circle cx="4" cy="12" r="2" fill="currentColor" />
            <circle cx="4" cy="18" r="2" fill="currentColor" />
          </svg>
        </button>

      </div>
    </div>
  );
};
