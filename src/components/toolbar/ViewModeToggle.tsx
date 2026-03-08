import React from 'react';
import { ViewMode } from '../../types';

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({
  viewMode,
  onViewModeChange
}) => {
  return (
    <div className="flex items-center bg-gray-100/50 dark:bg-white/5 rounded-lg p-1 border border-gray-200/50 dark:border-white/5">
      <button
        onClick={() => onViewModeChange(ViewMode.EDITOR)}
        className={`p-1.5 rounded-md transition-all ${
          viewMode === ViewMode.EDITOR
            ? 'bg-white dark:bg-gray-800 shadow-sm text-black dark:text-white'
            : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
        title="Editor Only"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>

      <button
        onClick={() => onViewModeChange(ViewMode.SPLIT)}
        className={`p-1.5 rounded-md transition-all ${
          viewMode === ViewMode.SPLIT
            ? 'bg-white dark:bg-gray-800 shadow-sm text-black dark:text-white'
            : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
        title="Split View"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="12" y1="3" x2="12" y2="21" />
        </svg>
      </button>

      <button
        onClick={() => onViewModeChange(ViewMode.PREVIEW)}
        className={`p-1.5 rounded-md transition-all ${
          viewMode === ViewMode.PREVIEW
            ? 'bg-white dark:bg-gray-800 shadow-sm text-black dark:text-white'
            : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
        title="Preview"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  );
};
