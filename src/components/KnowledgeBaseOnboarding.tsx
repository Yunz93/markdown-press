import React from "react";
import { useI18n } from "../hooks/useI18n";

export const KnowledgeBaseOnboarding: React.FC<{
  uiScaleStyle: React.CSSProperties;
  uiFontFamily: string;
  onOpen: () => void;
}> = ({ uiScaleStyle, uiFontFamily, onOpen }) => {
  const { t } = useI18n();
  return (
    <div
      className="ui-scaled min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 flex items-center justify-center p-6"
      style={{ ...uiScaleStyle, fontFamily: uiFontFamily }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/90 dark:bg-gray-900/80 backdrop-blur-md shadow-xl p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold tracking-tight">
            M
          </div>
          <div>
            <h1 className="text-xl font-semibold">
              {t("app_chooseKnowledgeBase")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("app_chooseKnowledgeBaseDesc")}
            </p>
          </div>
        </div>
        <button
          onClick={onOpen}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black font-medium hover:opacity-90 transition-opacity"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          {t("app_openKnowledgeBase")}
        </button>
      </div>
    </div>
  );
};
