import React from 'react';
import { ViewMode, type ThemeMode } from '../../types';
import { ViewModeToggle } from '../toolbar/ViewModeToggle';
import { AIButton } from '../toolbar/AIButton';
import { useI18n } from '../../hooks/useI18n';

interface ToolbarProps {
  fileName: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onAIAnalyze: () => void;
  isAnalyzing: boolean;
  isSaving: boolean;
  isPublishing?: boolean;
  isSidebarOpen: boolean;
  onMenuClick: () => void;
  onToggleTheme: () => void;
  themeMode: ThemeMode;
  onPublishBlog?: () => void;
  onExportPdf?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = React.memo(({
  fileName,
  viewMode,
  onViewModeChange,
  onAIAnalyze,
  isAnalyzing,
  isSaving,
  isPublishing = false,
  isSidebarOpen,
  onMenuClick,
  onToggleTheme,
  themeMode,
  onPublishBlog,
  onExportPdf,
}) => {
  const { t } = useI18n();
  const isDark = themeMode === 'dark';
  const displayFileName = fileName.replace(/\.md$/i, '');

  return (
    <div className="ui-scaled sticky top-0 z-20 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-transparent bg-gray-50 dark:bg-black px-4 py-3 transition-colors md:px-6 md:py-2">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden md:gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-8 w-8 items-center justify-center -ml-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
          title={isSidebarOpen ? t('toolbar_hideSidebar') : t('toolbar_showSidebar')}
          aria-label={isSidebarOpen ? t('toolbar_hideSidebar') : t('toolbar_showSidebar')}
          aria-expanded={isSidebarOpen}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1={isSidebarOpen ? 9 : 6} y1="4" x2={isSidebarOpen ? 9 : 6} y2="20" />
          </svg>
        </button>

        <div className="flex flex-col min-w-0">
          {fileName ? (
            <>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm md:text-base">
                  {displayFileName}
                </span>
                {isSaving && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium animate-pulse">
                    <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {t('toolbar_saving')}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="text-gray-400 text-sm font-medium">{t('toolbar_noFileSelected')}</span>
          )}
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
        <button
          onClick={onToggleTheme}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-white/[0.03] text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          title={isDark ? t('toolbar_switchToLight') : t('toolbar_switchToDark')}
        >
          {isDark ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <div className="flex items-center gap-1.5 rounded-2xl border border-gray-200/70 dark:border-white/10 bg-gray-100/80 dark:bg-white/[0.05] px-2 py-1 shadow-sm shadow-black/5">
          <AIButton
            onClick={onAIAnalyze}
            isLoading={isAnalyzing}
            disabled={!fileName}
          />

          <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
        </div>

        {(onPublishBlog || onExportPdf) && (
          <div className="flex items-center gap-1.5 rounded-2xl border border-gray-200/70 dark:border-white/10 bg-gray-100/80 dark:bg-white/[0.05] px-2 py-1 shadow-sm shadow-black/5">
            {onPublishBlog && (
              <button
                onClick={onPublishBlog}
                disabled={isPublishing}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-white/[0.03] text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                title={isPublishing ? t('toolbar_publishingBlog') : t('toolbar_publishBlog')}
              >
                {isPublishing ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                )}
              </button>
            )}

            {onExportPdf && (
              <button
                onClick={onExportPdf}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-white/[0.03] text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                title={t('toolbar_exportPdf')}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
