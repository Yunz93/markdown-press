import React, { useMemo, useState } from "react";
import type { AppSettings, EmbeddingProviderId } from "../../../types";
import { useAppStore } from "../../../store/appStore";
import { useI18n } from "../../../hooks/useI18n";
import { requestVaultLinkIndexRebuild } from "../../../services/vault/linkIndexEvents";
import { useSecureSettings } from "../useSecureSettings";

interface IndexTabProps {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
}

export const IndexTab: React.FC<IndexTabProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t } = useI18n();
  const progress = useAppStore((s) => s.linkIndexProgress);
  const linkIndex = useAppStore((s) => s.linkIndex);
  const chunkIndex = useAppStore((s) => s.chunkIndex);
  const semanticReady = useAppStore((s) => s.semanticReady);
  const semanticVectorCount = useAppStore((s) => s.semanticVectorCount);
  const rootFolderPath = useAppStore((s) => s.rootFolderPath);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { handleSecureSettingChange, renderSecureSaveState } =
    useSecureSettings(onUpdateSettings);

  const noteCount = linkIndex ? Object.keys(linkIndex.outbounds).length : 0;
  const chunkCount = useMemo(
    () =>
      chunkIndex
        ? Object.values(chunkIndex.byPath).reduce(
            (sum, chunks) => sum + chunks.length,
            0,
          )
        : 0,
    [chunkIndex],
  );
  const isWorking =
    busy || progress.phase === "building" || progress.phase === "updating";

  const handleRebuild = async () => {
    if (!rootFolderPath) {
      setMessage(t("index_noVault"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await requestVaultLinkIndexRebuild();
      setMessage(t("index_rebuildDone"));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("index_rebuildFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const builtAtLabel = progress.builtAt
    ? new Date(progress.builtAt).toLocaleString()
    : t("index_neverBuilt");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {t("index_title")}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("index_desc")}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200/70 dark:border-white/10 p-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
        <div className="flex justify-between gap-3">
          <span>{t("index_status")}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {progress.phase === "building"
              ? t("index_statusBuilding", {
                  done: progress.done,
                  total: Math.max(progress.total, 1),
                })
              : progress.phase === "updating"
                ? t("index_statusUpdating")
                : progress.phase === "error"
                  ? t("index_statusError")
                  : t("index_statusReady")}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{t("index_notesIndexed")}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {noteCount}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{t("index_chunksIndexed")}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {chunkCount}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{t("index_vectors")}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {semanticReady
              ? t("index_vectorsReady", { count: semanticVectorCount })
              : t("index_vectorsOff")}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{t("index_lastBuilt")}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {builtAtLabel}
          </span>
        </div>
        {progress.error ? (
          <p className="text-rose-500 text-xs pt-1">{progress.error}</p>
        ) : null}
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t("index_embeddingTitle")}
        </h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("index_embeddingDesc")}
        </p>
        <label className="block text-sm">
          <span className="text-gray-600 dark:text-gray-300">
            {t("index_embeddingProvider")}
          </span>
          <select
            className="mt-1 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2"
            value={settings.embeddingProvider ?? "none"}
            onChange={(event) =>
              onUpdateSettings({
                embeddingProvider: event.target.value as EmbeddingProviderId,
              })
            }
          >
            <option value="none">{t("index_embeddingNone")}</option>
            <option value="openai-compatible">
              {t("index_embeddingOpenAICompatible")}
            </option>
          </select>
        </label>
        {(settings.embeddingProvider ?? "none") !== "none" ? (
          <>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">
                {t("index_embeddingBaseUrl")}
              </span>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2"
                value={settings.embeddingApiBaseUrl ?? ""}
                onChange={(event) =>
                  onUpdateSettings({ embeddingApiBaseUrl: event.target.value })
                }
                placeholder="http://127.0.0.1:11434/v1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">
                {t("index_embeddingModel")}
              </span>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2"
                value={settings.embeddingModel ?? ""}
                onChange={(event) =>
                  onUpdateSettings({ embeddingModel: event.target.value })
                }
                placeholder="nomic-embed-text"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">
                {t("index_embeddingApiKey")}
              </span>
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2"
                value={settings.embeddingApiKey ?? ""}
                onChange={(event) =>
                  handleSecureSettingChange(
                    "embeddingApiKey",
                    event.target.value,
                  )
                }
                placeholder="ollama"
              />
              {renderSecureSaveState("embeddingApiKey")}
            </label>
          </>
        ) : null}

        <label className="block text-sm">
          <span className="text-gray-600 dark:text-gray-300">
            {t("index_searchModeDefault")}
          </span>
          <select
            className="mt-1 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2"
            value={settings.searchModeDefault ?? "keyword"}
            onChange={(event) =>
              onUpdateSettings({
                searchModeDefault: event.target
                  .value as AppSettings["searchModeDefault"],
              })
            }
          >
            <option value="keyword">{t("search_mode_keyword")}</option>
            <option value="semantic">{t("search_mode_semantic")}</option>
            <option value="hybrid">{t("search_mode_hybrid")}</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={settings.privacyMode === true}
            onChange={(event) =>
              onUpdateSettings({ privacyMode: event.target.checked })
            }
          />
          {t("index_privacyMode")}
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("index_privacyModeDesc")}
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleRebuild()}
        disabled={isWorking || !rootFolderPath}
        className="inline-flex items-center justify-center rounded-xl bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {isWorking ? t("index_rebuilding") : t("index_rebuild")}
      </button>

      {message ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
      ) : null}
    </div>
  );
};
