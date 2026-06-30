import { useCallback } from "react";
import { useAppStore, selectContent } from "../store/appStore";
import { exportToHtml, exportToPdf } from "../utils/export";
import type { LongImageSharePayload } from "../components/share/longImageSharePayload";
import {
  buildCodeExportFontFamily,
  buildPreviewExportFontFamily,
} from "../utils/fontSettings";
import { getFileSystem } from "../types/filesystem";
import { t } from "../utils/i18n";
import type { ShikiHighlighter } from "../hooks/useShikiHighlighter";
import { findFileInTree } from "../utils/fileTree";

/**
 * Encapsulates export actions (PDF + long-image share payload).
 * Publish actions live in usePublishActions.
 */
export function useExportActions(highlighter?: ShikiHighlighter | null) {
  const { files, activeTabId, rootFolderPath, settings, showNotification } =
    useAppStore();
  const content = useAppStore(selectContent);
  const previewFontFamily = buildPreviewExportFontFamily(settings);
  const codeFontFamily = buildCodeExportFontFamily(settings);

  const handleExportToPdf = useCallback(async () => {
    if (!activeTabId || !content) {
      showNotification(
        t(settings.language, "notifications_noFileToExport"),
        "error",
      );
      return;
    }

    const activeFile = findFileInTree(files, activeTabId);
    if (!activeFile) {
      showNotification(
        t(settings.language, "notifications_noFileToExport"),
        "error",
      );
      return;
    }

    try {
      const htmlContent = await exportToHtml(content, {
        title: activeFile.name.replace(".md", ""),
        theme: settings.themeMode,
        includeTOC: false,
        fontFamily: previewFontFamily,
        codeFontFamily,
        fontSettings: settings,
        fontSize: settings.fontSize,
        codeFontSize: Math.max(12, settings.fontSize - 2),
        includeProperties: false,
        highlighter,
        markdownStylePreset: settings.markdownStylePreset,
      });
      const savedPath = await exportToPdf(
        htmlContent,
        activeFile.name,
        activeFile.path,
        {
          files,
          rootFolderPath,
        },
      );
      if (savedPath !== null) {
        showNotification(
          t(settings.language, "notifications_pdfExported"),
          "success",
        );
        if (savedPath) {
          try {
            const fs = await getFileSystem();
            await fs.revealInExplorer?.(savedPath);
          } catch {
            /* best-effort */
          }
        }
      }
    } catch (error) {
      console.error("Failed to export PDF:", error);
      showNotification(
        t(settings.language, "notifications_exportPdfFailed"),
        "error",
      );
    }
  }, [
    activeTabId,
    content,
    files,
    rootFolderPath,
    previewFontFamily,
    codeFontFamily,
    highlighter,
    settings.fontSize,
    settings.markdownStylePreset,
    settings.themeMode,
    showNotification,
  ]);

  const buildLongImageSharePayload =
    useCallback(async (): Promise<LongImageSharePayload | null> => {
      if (!activeTabId || !content) {
        showNotification(
          t(settings.language, "notifications_noFileToExport"),
          "error",
        );
        return null;
      }

      const activeFile = findFileInTree(files, activeTabId);
      if (!activeFile) {
        showNotification(
          t(settings.language, "notifications_noFileToExport"),
          "error",
        );
        return null;
      }

      const htmlContent = await exportToHtml(content, {
        title: activeFile.name.replace(".md", ""),
        theme: settings.themeMode,
        includeTOC: false,
        fontFamily: previewFontFamily,
        codeFontFamily,
        fontSettings: settings,
        fontSize: settings.fontSize,
        codeFontSize: Math.max(12, settings.fontSize - 2),
        includeProperties: false,
        highlighter,
        markdownStylePreset: settings.markdownStylePreset,
      });

      return {
        html: htmlContent,
        filenameBase: activeFile.name.replace(/\.md$/i, ""),
        sourceFilePath: activeFile.path,
      };
    }, [
      activeTabId,
      codeFontFamily,
      content,
      files,
      highlighter,
      previewFontFamily,
      settings.fontSize,
      settings.language,
      settings.markdownStylePreset,
      settings.themeMode,
      showNotification,
    ]);

  return {
    handleExportToPdf,
    buildLongImageSharePayload,
  };
}
