import React, { useCallback, useEffect, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { useI18n } from "../../hooks/useI18n";
import {
  appendAskVaultHistory,
  askVault,
  estimateLineOffset,
  loadAskVaultHistory,
  type AskVaultHistoryItem,
} from "../../services/vault/askVaultService";
import { hydrateSensitiveSettingsIntoStore } from "../../services/secureSettingsService";
import { localizeKnownError } from "../../utils/i18n";
import { requestEditorRangeFocus } from "../../utils/editorSelectionBridge";
import { requestPreviewHeadingScroll } from "../../utils/previewNavigationBridge";
import type { AskVaultCitation } from "../../types/vaultIndex";
import type { FileNode } from "../../types";

interface AskVaultPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenFile: (file: FileNode) => Promise<void> | void;
  readFile: (file: FileNode) => Promise<string>;
}

type AskScope = "vault" | "folder" | "files";

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

  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState<AskScope>("vault");
  const [loading, setLoading] = useState(false);
  const [answerMarkdown, setAnswerMarkdown] = useState("");
  const [citations, setCitations] = useState<AskVaultCitation[]>([]);
  const [history, setHistory] = useState<AskVaultHistoryItem[]>([]);
  const [showSourcesPreview, setShowSourcesPreview] = useState(false);
  const [previewSnippets, setPreviewSnippets] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !rootFolderPath) return;
    void loadAskVaultHistory(rootFolderPath).then(setHistory);
  }, [open, rootFolderPath]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleAsk = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed || !rootFolderPath) return;

    setLoading(true);
    try {
      const hydrated = await hydrateSensitiveSettingsIntoStore();
      const activeSettings = { ...settings, ...hydrated };
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
        setSettingsOpen(true);
        return;
      }

      const folderPath =
        scope === "folder" && currentFilePath
          ? currentFilePath.replace(/[/\\][^/\\]+$/, "")
          : null;

      const result = await askVault({
        question: trimmed,
        settings: activeSettings,
        scope:
          scope === "files" ? "files" : scope === "folder" ? "folder" : "vault",
        folderPath,
        filePaths:
          scope === "files" && currentFilePath ? [currentFilePath] : undefined,
      });

      setAnswerMarkdown(result.answerMarkdown);
      setCitations(result.citations);
      setPreviewSnippets(result.citations.map((c) => c.snippet));

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
    } finally {
      setLoading(false);
    }
  }, [
    question,
    rootFolderPath,
    settings,
    language,
    scope,
    currentFilePath,
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
    if (!currentFilePath || !answerMarkdown.trim()) return;
    const previous = fileContents[currentFilePath] ?? "";
    const next = `${previous.trimEnd()}\n\n${answerMarkdown.trim()}\n`;
    setPendingAiResult({
      fileId: currentFilePath,
      previousContent: previous,
      newContent: next,
    });
  }, [answerMarkdown, currentFilePath, fileContents, setPendingAiResult]);

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

        <div className="ask-vault-controls">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as AskScope)}
            aria-label={t("askVault_scope")}
          >
            <option value="vault">{t("askVault_scopeVault")}</option>
            <option value="folder">{t("askVault_scopeFolder")}</option>
            <option value="files">{t("askVault_scopeCurrent")}</option>
          </select>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("askVault_placeholder")}
            rows={3}
          />
          <div className="ask-vault-actions">
            <button
              type="button"
              onClick={() => setShowSourcesPreview((v) => !v)}
              disabled={citations.length === 0}
            >
              {t("askVault_toggleSources")}
            </button>
            <button
              type="button"
              className="ask-vault-primary"
              disabled={loading || !question.trim()}
              onClick={() => void handleAsk()}
            >
              {loading ? t("askVault_asking") : t("askVault_ask")}
            </button>
          </div>
        </div>

        {showSourcesPreview && previewSnippets.length > 0 ? (
          <div className="ask-vault-sources-preview">
            <h3>{t("askVault_sourcesPreview")}</h3>
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
              <button type="button" onClick={handleInsertAnswer}>
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
                    item.answer.citations.map((c) => c.snippet),
                  );
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
