/**
 * Toolbar toggle: Source (edit) / Live Preview / Reading.
 */

import React from "react";
import { ViewMode } from "../../types";
import { useI18n } from "../../hooks/useI18n";
import { normalizeSessionViewMode } from "../../utils/viewMode";

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  previewOnly?: boolean;
}

export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({
  viewMode,
  onViewModeChange,
  previewOnly = false,
}) => {
  const { t } = useI18n();
  const mode = normalizeSessionViewMode(viewMode);

  const inactiveClass =
    "text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-white/5";
  const disabledClass = "text-gray-200 dark:text-gray-700 cursor-not-allowed";
  const activeClass =
    "bg-white dark:bg-gray-800 shadow-sm text-black dark:text-white";

  const buttonClass = (active: boolean, disabled = false) =>
    `inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
      active ? activeClass : disabled ? disabledClass : inactiveClass
    }`;

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onViewModeChange(ViewMode.EDITOR)}
        disabled={previewOnly}
        className={buttonClass(mode === ViewMode.EDITOR, previewOnly)}
        title={t("view_editorOnly")}
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>

      <button
        onClick={() => onViewModeChange(ViewMode.LIVE)}
        disabled={previewOnly}
        className={buttonClass(mode === ViewMode.LIVE, previewOnly)}
        title={t("view_livePreview")}
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>

      <button
        onClick={() => onViewModeChange(ViewMode.PREVIEW)}
        className={buttonClass(mode === ViewMode.PREVIEW)}
        title={t("view_preview")}
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </button>
    </div>
  );
};
