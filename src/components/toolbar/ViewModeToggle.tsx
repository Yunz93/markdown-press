import React from "react";
import { ViewMode } from "../../types";
import { useI18n } from "../../hooks/useI18n";

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
        onClick={() => onViewModeChange(ViewMode.LIVE)}
        disabled={previewOnly}
        className={buttonClass(viewMode === ViewMode.LIVE, previewOnly)}
        title={t("view_livePreview")}
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          <path d="M4 13v3h3" opacity="0.35" />
        </svg>
      </button>

      <button
        onClick={() => onViewModeChange(ViewMode.EDITOR)}
        disabled={previewOnly}
        className={buttonClass(viewMode === ViewMode.EDITOR, previewOnly)}
        title={t("view_editorOnly")}
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>

      <button
        onClick={() => onViewModeChange(ViewMode.SPLIT)}
        disabled={previewOnly}
        className={buttonClass(viewMode === ViewMode.SPLIT, previewOnly)}
        title={t("view_split")}
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="12" y1="3" x2="12" y2="21" />
        </svg>
      </button>

      <button
        onClick={() => onViewModeChange(ViewMode.PREVIEW)}
        className={buttonClass(viewMode === ViewMode.PREVIEW)}
        title={t("view_preview")}
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  );
};
