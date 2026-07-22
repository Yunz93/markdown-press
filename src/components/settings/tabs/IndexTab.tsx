import React, { useState } from "react";
import { useAppStore } from "../../../store/appStore";
import { useI18n } from "../../../hooks/useI18n";
import { requestVaultLinkIndexRebuild } from "../../../services/vault/linkIndexEvents";

export const IndexTab: React.FC = () => {
  const { t } = useI18n();
  const progress = useAppStore((s) => s.linkIndexProgress);
  const linkIndex = useAppStore((s) => s.linkIndex);
  const rootFolderPath = useAppStore((s) => s.rootFolderPath);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const noteCount = linkIndex ? Object.keys(linkIndex.outbounds).length : 0;
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
          <span>{t("index_lastBuilt")}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {builtAtLabel}
          </span>
        </div>
        {progress.error ? (
          <p className="text-rose-500 text-xs pt-1">{progress.error}</p>
        ) : null}
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
