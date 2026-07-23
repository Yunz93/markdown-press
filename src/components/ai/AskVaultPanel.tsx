import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { useI18n } from "../../hooks/useI18n";
import {
  answerAskVaultFromHits,
  appendAskVaultHistory,
  estimateLineOffset,
  hitsToPreviewSnippets,
  loadAskVaultHistory,
  retrieveAskVaultHits,
  type AskVaultHistoryItem,
} from "../../services/vault/askVaultService";
import { hydrateSensitiveSettingsIntoStore } from "../../services/secureSettingsService";
import { localizeKnownError } from "../../utils/i18n";
import {
  getActiveEditorSelection,
  requestEditorRangeFocus,
} from "../../utils/editorSelectionBridge";
import { requestPreviewHeadingScroll } from "../../utils/previewNavigationBridge";
import { requestVaultLinkIndexRebuild } from "../../services/vault/linkIndexEvents";
import type { AskVaultCitation } from "../../types/vaultIndex";
import type { RetrieveHit } from "../../types/vaultIndex";
import type { FileNode } from "../../types";
import { AppSelect } from "../ui/AppSelect";

interface AskVaultPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenFile: (file: FileNode) => Promise<void> | void;
  readFile: (file: FileNode) => Promise<string>;
}

type AskScope = "vault" | "folder" | "files";

function isAiConfigured(settings: {
  aiProvider?: string;
  geminiApiKey?: string;
  codexApiKey?: string;
  deepseekApiKey?: string;
}): boolean {
  if (settings.aiProvider === "codex")
    return Boolean(settings.codexApiKey?.trim());
  if (settings.aiProvider === "deepseek")
    return Boolean(settings.deepseekApiKey?.trim());
  return Boolean(settings.geminiApiKey?.trim());
}

export const AskVaultPanel: React.FC<AskVaultPanelProps> = ({
  open,
  onClose,
  onOpenFile,
  readFile,
}) => {
  const { t, language } = useI18n();
  const settings = useAppStore((s) => s.settings);
  const rootFolderPath = useAppStore((s) => s.rootFolderPath);
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const setPendingAiResult = useAppStore((s) => s.setPendingAiResult);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const showNotification = useAppStore((s) => s.showNotification);
  const fileContents = useAppStore((s) => s.fileContents);
  const linkIndexProgress = useAppStore((s) => s.linkIndexProgress);
  const chunkIndex = useAppStore((s) => s.chunkIndex);
  const semanticReady = useAppStore((s) => s.semanticReady);

  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState<AskScope>("vault");
  const [retrieving, setRetrieving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pendingHits, setPendingHits] = useState<RetrieveHit[]>([]);
  const [previewSnippets, setPreviewSnippets] = useState<string[]>([]);
  const [showSourcesPreview, setShowSourcesPreview] = useState(true);
  const [answerMarkdown, setAnswerMarkdown] = useState("");
  const [citations, setCitations] = useState<AskVaultCitation[]>([]);
  const [history, setHistory] = useState<AskVaultHistoryItem[]>([]);

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

  const indexBuilding =
    linkIndexProgress.phase === "building" ||
    linkIndexProgress.phase === "updating";
  const keywordOnly = (settings.embeddingProvider ?? "builtin") === "none";
  const aiReady = isAiConfigured(settings);
  const canAsk =
    Boolean(rootFolderPath) &&
    aiReady &&
    !indexBuilding &&
    chunkCount > 0 &&
    !retrieving &&
    !generating;

  const scopeNeedsFile = scope === "folder" || scope === "files";
  const scopeBlocked = scopeNeedsFile && !currentFilePath;

  useEffect(() => {
    if (!open || !rootFolderPath) return;
    void loadAskVaultHistory(rootFolderPath).then(setHistory);
  }, [open, rootFolderPath]);

  useEffect(() => {
    if (!open) return;
    void hydrateSensitiveSettingsIntoStore();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const resolveHydratedSettings = useCallback(async () => {
    const hydrated = await hydrateSensitiveSettingsIntoStore();
    return { ...settings, ...hydrated };
  }, [settings]);

  const buildRequest = useCallback(
    (activeSettings: typeof settings) => {
      const folderPath =
        scope === "folder" && currentFilePath
          ? currentFilePath.replace(/[/\\][^/\\]+$/, "")
          : null;
      return {
        question: question.trim(),
        settings: activeSettings,
        scope:
          scope === "files"
            ? ("files" as const)
            : scope === "folder"
              ? ("folder" as const)
              : ("vault" as const),
        folderPath,
        filePaths:
          scope === "files" && currentFilePath ? [currentFilePath] : undefined,
      };
    },
    [question, scope, currentFilePath],
  );

  const handleRetrieve = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed || !rootFolderPath || !canAsk || scopeBlocked) return;

    setRetrieving(true);
    setAnswerMarkdown("");
    setCitations([]);
    try {
      const activeSettings = await resolveHydratedSettings();
      try {
        const { ensureAIConfiguration } =
          await import("../../services/aiService");
        ensureAIConfiguration(activeSettings);
      } catch (error) {
        showNotification(
          error instanceof Error
            ? localizeKnownError(language, error.message)
            : t("notifications_aiConfigFirst"),
          "error",
        );
        setSettingsOpen(true, "ai");
        return;
      }

      const hits = await retrieveAskVaultHits(buildRequest(activeSettings));
      setPendingHits(hits);
      setPreviewSnippets(hitsToPreviewSnippets(hits));
      setShowSourcesPreview(true);
      if (hits.length === 0) {
        showNotification(t("askVault_noHits"), "info");
      }
    } catch (error) {
      showNotification(
        error instanceof Error
          ? localizeKnownError(language, error.message)
          : t("askVault_failed"),
        "error",
      );
      setSettingsOpen(true, "ai");
    } finally {
      setRetrieving(false);
    }
  }, [
    question,
    rootFolderPath,
    canAsk,
    scopeBlocked,
    resolveHydratedSettings,
    buildRequest,
    language,
    showNotification,
    setSettingsOpen,
    t,
  ]);

  const handleGenerate = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed || !rootFolderPath || pendingHits.length === 0) return;

    setGenerating(true);
    try {
      const activeSettings = await resolveHydratedSettings();
      const result = await answerAskVaultFromHits(
        trimmed,
        pendingHits,
        activeSettings,
      );
      setAnswerMarkdown(result.answerMarkdown);
      setCitations(result.citations);

      const historyItem: AskVaultHistoryItem = {
        id: `${Date.now()}`,
        question: trimmed,
        answer: result,
        at: Date.now(),
      };
      await appendAskVaultHistory(rootFolderPath, historyItem);
      setHistory((prev) => [historyItem, ...prev].slice(0, 50));
    } catch (error) {
      showNotification(
        error instanceof Error
          ? localizeKnownError(language, error.message)
          : t("askVault_failed"),
        "error",
      );
      setSettingsOpen(true, "ai");
    } finally {
      setGenerating(false);
    }
  }, [
    question,
    rootFolderPath,
    pendingHits,
    resolveHydratedSettings,
    language,
    showNotification,
    setSettingsOpen,
    t,
  ]);

  const handleOpenCitation = useCallback(
    async (citation: AskVaultCitation) => {
      const file: FileNode = {
        id: citation.path,
        name: citation.path.split(/[/\\]/).pop() || citation.path,
        type: "file",
        path: citation.path,
      };
      await onOpenFile(file);
      try {
        const content = fileContents[citation.path] ?? (await readFile(file));
        const start = estimateLineOffset(content, citation.startLine);
        const end = estimateLineOffset(content, citation.endLine + 1);
        requestEditorRangeFocus(
          citation.path,
          start,
          Math.max(start + 1, end),
          {
            alignTopRatio: 0.25,
          },
        );
        if (citation.headingAnchor) {
          requestPreviewHeadingScroll(citation.path, citation.headingAnchor);
        }
      } catch {
        // Opening the file is still useful even if focus fails.
      }
    },
    [fileContents, onOpenFile, readFile],
  );

  const handleInsertAnswer = useCallback(() => {
    if (!currentFilePath || !answerMarkdown.trim()) {
      showNotification(t("askVault_insertNeedsNote"), "info");
      return;
    }
    const previous = fileContents[currentFilePath] ?? "";
    const selection = getActiveEditorSelection();
    let next: string;
    if (
      selection &&
      selection.tabId === currentFilePath &&
      selection.from !== selection.to
    ) {
      next =
        previous.slice(0, selection.from) +
        answerMarkdown.trim() +
        previous.slice(selection.to);
    } else if (selection && selection.tabId === currentFilePath) {
      next =
        previous.slice(0, selection.from) +
        `\n\n${answerMarkdown.trim()}\n` +
        previous.slice(selection.from);
    } else {
      next = `${previous.trimEnd()}\n\n${answerMarkdown.trim()}\n`;
    }
    setPendingAiResult({
      fileId: currentFilePath,
      previousContent: previous,
      newContent: next,
    });
  }, [
    answerMarkdown,
    currentFilePath,
    fileContents,
    setPendingAiResult,
    showNotification,
    t,
  ]);

  if (!open) return null;

  return (
    <div
      className="ask-vault-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="ask-vault-panel">
        <div className="ask-vault-header">
          <h2>{t("askVault_title")}</h2>
          <button type="button" onClick={onClose} className="ask-vault-close">
            ×
          </button>
        </div>

        <div className="ask-vault-readiness">
          {!rootFolderPath ? (
            <p>{t("askVault_needVault")}</p>
          ) : !aiReady ? (
            <p>
              {t("askVault_needAi")}{" "}
              <button type="button" onClick={() => setSettingsOpen(true, "ai")}>
                {t("askVault_openAiSettings")}
              </button>
            </p>
          ) : indexBuilding ? (
            <p>
              {t("askVault_indexBuilding", {
                done: linkIndexProgress.done,
                total: Math.max(linkIndexProgress.total, 1),
              })}
            </p>
          ) : chunkCount === 0 ? (
            <p>
              {t("askVault_indexEmpty")}{" "}
              <button
                type="button"
                onClick={() => {
                  void requestVaultLinkIndexRebuild().catch(() => {
                    setSettingsOpen(true, "index");
                  });
                }}
              >
                {t("askVault_rebuildIndex")}
              </button>
            </p>
          ) : keywordOnly ? (
            <p>
              {t("askVault_keywordOnly")}{" "}
              <button
                type="button"
                onClick={() => setSettingsOpen(true, "index")}
              >
                {t("askVault_openIndexSettings")}
              </button>
            </p>
          ) : semanticReady ? (
            <p className="ask-vault-ready">{t("askVault_ready")}</p>
          ) : (
            <p>{t("askVault_readyKeyword")}</p>
          )}
        </div>

        <div className="ask-vault-controls">
          <AppSelect
            value={scope}
            aria-label={t("askVault_scope")}
            options={[
              { value: "vault", label: t("askVault_scopeVault") },
              {
                value: "folder",
                label: t("askVault_scopeFolder"),
                disabled: !currentFilePath,
              },
              {
                value: "files",
                label: t("askVault_scopeCurrent"),
                disabled: !currentFilePath,
              },
            ]}
            onChange={(next) => setScope(next as AskScope)}
          />
          {scopeBlocked ? (
            <p className="ask-vault-scope-hint">
              {t("askVault_scopeNeedsNote")}
            </p>
          ) : null}
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("askVault_placeholder")}
            rows={3}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void handleRetrieve();
              }
            }}
          />
          <div className="ask-vault-actions">
            <button
              type="button"
              onClick={() => setShowSourcesPreview((v) => !v)}
              disabled={previewSnippets.length === 0}
            >
              {t("askVault_toggleSources")}
            </button>
            <button
              type="button"
              className="ask-vault-primary"
              disabled={!canAsk || !question.trim() || scopeBlocked}
              onClick={() => void handleRetrieve()}
            >
              {retrieving ? t("askVault_retrieving") : t("askVault_retrieve")}
            </button>
            <button
              type="button"
              className="ask-vault-primary"
              disabled={
                generating || retrieving || pendingHits.length === 0 || !aiReady
              }
              onClick={() => void handleGenerate()}
            >
              {generating ? t("askVault_asking") : t("askVault_ask")}
            </button>
          </div>
        </div>

        {showSourcesPreview && previewSnippets.length > 0 ? (
          <div className="ask-vault-sources-preview">
            <h3>{t("askVault_sourcesPreview")}</h3>
            <p className="ask-vault-sources-hint">
              {t("askVault_sourcesHint")}
            </p>
            {previewSnippets.map((snippet, index) => (
              <pre key={`${index}-${snippet.slice(0, 12)}`}>{snippet}</pre>
            ))}
          </div>
        ) : null}

        {answerMarkdown ? (
          <div className="ask-vault-answer">
            <h3>{t("askVault_answer")}</h3>
            <div className="ask-vault-answer-body whitespace-pre-wrap">
              {answerMarkdown}
            </div>
            <div className="ask-vault-actions">
              <button
                type="button"
                onClick={handleInsertAnswer}
                disabled={!currentFilePath}
                title={
                  !currentFilePath ? t("askVault_insertNeedsNote") : undefined
                }
              >
                {t("askVault_insert")}
              </button>
            </div>
            {citations.length > 0 ? (
              <div className="ask-vault-citations">
                <h4>{t("askVault_citations")}</h4>
                {citations.map((citation) => (
                  <button
                    key={`${citation.index}-${citation.path}`}
                    type="button"
                    className="ask-vault-citation"
                    onClick={() => void handleOpenCitation(citation)}
                  >
                    <strong>[{citation.index}]</strong> {citation.relPath}
                    <span>{citation.snippet}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {history.length > 0 ? (
          <div className="ask-vault-history">
            <h3>{t("askVault_history")}</h3>
            {history.slice(0, 8).map((item) => (
              <button
                key={item.id}
                type="button"
                className="ask-vault-history-item"
                onClick={() => {
                  setQuestion(item.question);
                  setAnswerMarkdown(item.answer.answerMarkdown);
                  setCitations(item.answer.citations);
                  setPreviewSnippets(
                    item.answer.citations.map(
                      (c) => `[${c.index}] ${c.relPath}\n${c.snippet}`,
                    ),
                  );
                  setPendingHits([]);
                  setShowSourcesPreview(true);
                }}
              >
                {item.question}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
