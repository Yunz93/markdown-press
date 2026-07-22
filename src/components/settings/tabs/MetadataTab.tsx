import React, { useState } from "react";
import type { MetadataField } from "../../../types";
import { useI18n } from "../../../hooks/useI18n";
import type { SettingsTabProps } from "../types";

export const MetadataTab: React.FC<SettingsTabProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t } = useI18n();
  const [draggingMetadataIndex, setDraggingMetadataIndex] = useState<
    number | null
  >(null);

  const handleUpdateMetadata = (idx: number, field: Partial<MetadataField>) => {
    if (idx < 0 || idx >= settings.metadataFields.length) return;
    const newFields = settings.metadataFields.map((f, i) =>
      i === idx ? { ...f, ...field } : f,
    );
    onUpdateSettings({ metadataFields: newFields });
  };

  const handleAddMetadata = () => {
    onUpdateSettings({
      metadataFields: [
        ...settings.metadataFields,
        { key: "new_prop", defaultValue: "", description: "" },
      ],
    });
  };

  const handleRemoveMetadata = (idx: number) => {
    if (idx < 0 || idx >= settings.metadataFields.length) return;
    onUpdateSettings({
      metadataFields: settings.metadataFields.filter((_, i) => i !== idx),
    });
  };

  const handleMoveMetadata = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= settings.metadataFields.length ||
      toIndex >= settings.metadataFields.length ||
      fromIndex === toIndex
    )
      return;

    const newFields = [...settings.metadataFields];
    const [movedField] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, movedField);
    onUpdateSettings({ metadataFields: newFields });
  };

  return (
    <div className="space-y-6 animate-fade-in-02s">
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t("settings_metadataTemplate")}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {t("settings_metadataTemplateDesc")}
            </p>
          </div>
          <button
            onClick={handleAddMetadata}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t("settings_addField")}
          </button>
        </div>

        <div className="mb-2 hidden gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 sm:flex">
          <span className="w-8 shrink-0" aria-hidden />
          <span className="w-28 shrink-0">
            {t("settings_metadataKeyLabel")}
          </span>
          <span className="w-3 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {t("settings_metadataValueLabel")}
          </span>
          <span className="min-w-0 flex-[1.15]">
            {t("settings_metadataDescriptionLabel")}
          </span>
          <span className="w-8 shrink-0" aria-hidden />
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {settings.metadataFields.map((field, idx) => (
            <div
              key={`${field.key}-${idx}`}
              draggable
              onDragStart={() => setDraggingMetadataIndex(idx)}
              onDragEnd={() => setDraggingMetadataIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggingMetadataIndex === null) return;
                handleMoveMetadata(draggingMetadataIndex, idx);
                setDraggingMetadataIndex(null);
              }}
              className={`flex gap-2 items-center bg-gray-50 dark:bg-white/5 p-2 rounded-xl border transition-colors group ${
                draggingMetadataIndex === idx
                  ? "border-accent-DEFAULT/50 bg-accent-DEFAULT/5"
                  : "border-gray-100 dark:border-white/5"
              }`}
            >
              <button
                type="button"
                title={t("settings_dragToReorder")}
                className="p-2 text-gray-400 cursor-grab active:cursor-grabbing hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="9" cy="6" r="1" />
                  <circle cx="15" cy="6" r="1" />
                  <circle cx="9" cy="12" r="1" />
                  <circle cx="15" cy="12" r="1" />
                  <circle cx="9" cy="18" r="1" />
                  <circle cx="15" cy="18" r="1" />
                </svg>
              </button>
              <input
                type="text"
                value={field.key}
                onChange={(e) =>
                  handleUpdateMetadata(idx, { key: e.target.value })
                }
                placeholder={t("settings_metadataKeyPlaceholder")}
                aria-label={t("settings_metadataKeyLabel")}
                className="w-28 shrink-0 bg-white dark:bg-black/20 px-3 py-2 rounded-lg text-sm border border-transparent focus:border-accent-DEFAULT focus:outline-none transition-colors"
              />
              <span className="text-gray-400">:</span>
              <input
                type="text"
                value={field.defaultValue}
                onChange={(e) =>
                  handleUpdateMetadata(idx, { defaultValue: e.target.value })
                }
                placeholder={t("settings_metadataValuePlaceholder")}
                aria-label={t("settings_metadataValueLabel")}
                className="min-w-0 flex-1 bg-white dark:bg-black/20 px-3 py-2 rounded-lg text-sm border border-transparent focus:border-accent-DEFAULT focus:outline-none transition-colors"
                title={t("settings_metadataNowHint")}
              />
              <input
                type="text"
                value={field.description ?? ""}
                onChange={(e) =>
                  handleUpdateMetadata(idx, { description: e.target.value })
                }
                placeholder={t("settings_metadataDescriptionPlaceholder")}
                aria-label={t("settings_metadataDescriptionLabel")}
                className="min-w-0 flex-[1.15] bg-white dark:bg-black/20 px-3 py-2 rounded-lg text-sm border border-transparent focus:border-accent-DEFAULT focus:outline-none transition-colors"
              />
              <button
                onClick={() => handleRemoveMetadata(idx)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                aria-label={`Remove ${field.key}`}
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-gray-400 flex items-center gap-1">
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          <span>
            {t("settings_metadataTip", {
              now: "{now}",
              nowDatetime: "{now:datetime}",
            })}
          </span>
        </div>
      </div>
    </div>
  );
};
