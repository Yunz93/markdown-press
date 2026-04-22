import { useCallback } from 'react';
import { useAppStore, selectContent } from '../store/appStore';
import { hydrateSensitiveSettingsIntoStore } from '../services/secureSettingsService';
import { generateFrontmatter, parseFrontmatter, updateFrontmatter } from '../utils/frontmatter';
import { exportToHtml, exportToPdf } from '../utils/export';
import { type Frontmatter } from '../types';
import { buildCodeExportFontFamily, buildPreviewExportFontFamily } from '../utils/fontSettings';
import { buildSimpleBlogPostUrl, prepareSimpleBlogPublish } from '../utils/simpleBlogPublish';
import { prepareWechatDraftPublish, type WechatDraftPublishInput } from '../utils/wechatPublish';
import { replaceLocalImagesWithHostingForPublish } from '../utils/publishLocalImagesToHosting';
import { getFileSystem, isTauriEnvironment } from '../types/filesystem';
import {
  isValidBlogRepoUrl,
  isValidBlogSiteUrl,
  normalizeBlogRepoUrl,
  normalizeBlogSiteUrl,
} from '../utils/blogRepo';
import { refreshDocumentUpdateTime } from '../utils/metadataFields';
import { localizeKnownError, t, type TranslationKey } from '../utils/i18n';
import type { ShikiHighlighter } from '../hooks/useShikiHighlighter';

const PUBLISH_TIMEOUT_MS = 45000;

function findFileInTree(nodes: import('../types').FileNode[], id: string): import('../types').FileNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFileInTree(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Encapsulates export and blog publish actions.
 * Extracted from App.tsx.
 */
export function useExportActions(
  forceSave: (
    contentOverride?: string,
    options?: { formatBeforeSave?: boolean; trigger?: 'auto' | 'manual' | 'system' }
  ) => Promise<boolean>,
  highlighter?: ShikiHighlighter | null
) {
  const {
    files,
    activeTabId,
    rootFolderPath,
    settings,
    setContentForFile,
    setPublishing,
    showNotification,
  } = useAppStore();
  const content = useAppStore(selectContent);
  const previewFontFamily = buildPreviewExportFontFamily(settings);
  const codeFontFamily = buildCodeExportFontFamily(settings);

  const invokePublishWithTimeout = useCallback(async <T,>(
    command: string,
    payload: Record<string, unknown>,
    timeoutTranslationKey: TranslationKey = 'notifications_publishTimeout',
  ): Promise<T> => {
    const { invoke } = await import('@tauri-apps/api/core');

    let timeoutId: number | null = null;
    const publishPromise = invoke<T>(command, payload);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(
          t(settings.language, timeoutTranslationKey)
        ));
      }, PUBLISH_TIMEOUT_MS);
    });

    try {
      return await Promise.race([publishPromise, timeoutPromise]);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }, []);

  const backfillFrontmatter = useCallback(async (
    fileId: string,
    filePath: string,
    updates: Frontmatter,
    backfillFailedKey: TranslationKey,
  ) => {
    const stateBeforeWrite = useAppStore.getState();
    const latestContent = stateBeforeWrite.fileContents[fileId];
    if (!latestContent) {
      return false;
    }

    const linkedContent = refreshDocumentUpdateTime(updateFrontmatter(latestContent, updates));
    if (linkedContent === latestContent) {
      return true;
    }

    stateBeforeWrite.updateTabContent(fileId, linkedContent);
    stateBeforeWrite.updateFileContent(fileId, linkedContent);

    try {
      const fs = await getFileSystem();
      await fs.writeFile(filePath, linkedContent);

      const stateAfterWrite = useAppStore.getState();
      if (stateAfterWrite.fileContents[fileId] === linkedContent) {
        stateAfterWrite.markAsSaved(fileId);
      }
      return true;
    } catch (error) {
      console.error('Failed to backfill publish metadata:', error);
      useAppStore.getState().showNotification(
        t(settings.language, backfillFailedKey),
        'error'
      );
      return false;
    }
  }, []);

  const handleExportToPdf = useCallback(async () => {
    if (!activeTabId || !content) {
      showNotification(t(settings.language, 'notifications_noFileToExport'), 'error');
      return;
    }

    const activeFile = findFileInTree(files, activeTabId);
    if (!activeFile) {
      showNotification(t(settings.language, 'notifications_noFileToExport'), 'error');
      return;
    }

    try {
      const htmlContent = await exportToHtml(content, {
        title: activeFile.name.replace('.md', ''),
        theme: settings.themeMode,
        includeTOC: false,
        fontFamily: previewFontFamily,
        codeFontFamily,
        fontSettings: settings,
        fontSize: settings.fontSize,
        codeFontSize: Math.max(12, settings.fontSize - 2),
        includeProperties: false,
        highlighter,
      });
      const savedPath = await exportToPdf(htmlContent, activeFile.name, activeFile.path);
      if (savedPath !== null) {
        showNotification(t(settings.language, 'notifications_pdfExported'), 'success');
        if (savedPath) {
          try {
            const fs = await getFileSystem();
            await fs.revealInExplorer?.(savedPath);
          } catch { /* best-effort */ }
        }
      }
    } catch (error) {
      console.error('Failed to export PDF:', error);
      showNotification(t(settings.language, 'notifications_exportPdfFailed'), 'error');
    }
  }, [activeTabId, content, files, previewFontFamily, codeFontFamily, highlighter, settings.fontSize, settings.themeMode, showNotification]);

  const handlePublishSimpleBlog = useCallback(async () => {
    const hydratedSettings = await hydrateSensitiveSettingsIntoStore();

    if (!activeTabId) {
      showNotification(t(hydratedSettings.language, 'notifications_noFileToPublish'), 'error');
      return;
    }

    if (!isTauriEnvironment()) {
      showNotification(t(hydratedSettings.language, 'notifications_desktopPublishOnly'), 'error');
      return;
    }

    if (!hydratedSettings.blogRepoUrl.trim()) {
      showNotification(t(hydratedSettings.language, 'notifications_setBlogRepoFirst'), 'error');
      return;
    }

    if (!isValidBlogRepoUrl(hydratedSettings.blogRepoUrl)) {
      showNotification(t(hydratedSettings.language, 'notifications_setValidBlogRepoFirst'), 'error');
      return;
    }

    if (!hydratedSettings.blogSiteUrl.trim()) {
      showNotification(t(hydratedSettings.language, 'notifications_setBlogSiteFirst'), 'error');
      return;
    }

    if (!isValidBlogSiteUrl(hydratedSettings.blogSiteUrl)) {
      showNotification(t(hydratedSettings.language, 'notifications_setValidBlogSiteFirst'), 'error');
      return;
    }

    if (!hydratedSettings.blogGithubToken?.trim()) {
      showNotification(t(hydratedSettings.language, 'notifications_setGithubTokenFirst'), 'error');
      return;
    }

    const currentContent = useAppStore.getState().fileContents[activeTabId];
    if (!currentContent) {
      showNotification(t(hydratedSettings.language, 'notifications_noContentToPublish'), 'error');
      return;
    }

    const activeFile = findFileInTree(files, activeTabId);
    if (!activeFile) {
      showNotification(t(hydratedSettings.language, 'notifications_noFileToPublish'), 'error');
      return;
    }

    setPublishing(true);
    try {
      const { frontmatter, body } = parseFrontmatter(currentContent);
      const merged: Frontmatter = {
        ...(frontmatter || {}),
        is_publish: true,
      };
      const nextContent = `${generateFrontmatter(merged)}${body}`;

      setContentForFile(activeTabId, nextContent);
      const saved = await forceSave(nextContent);
      if (!saved) {
        showNotification(t(hydratedSettings.language, 'notifications_saveBeforePublishFailed'), 'error');
        return;
      }

      const storeState = useAppStore.getState();
      const contentToPublish = storeState.fileContents[activeTabId] ?? nextContent;
      const latestFiles = storeState.files;
      const latestRootFolderPath = storeState.rootFolderPath;

      console.log('[publish] rootFolderPath:', latestRootFolderPath);
      console.log('[publish] currentFilePath:', activeFile.path);
      console.log('[publish] file tree entries:', latestFiles.length);

      const hostingResult = await replaceLocalImagesWithHostingForPublish(contentToPublish, {
        files: latestFiles,
        rootFolderPath: latestRootFolderPath,
        currentFilePath: activeFile.path,
        settings: hydratedSettings,
      });

      if (!hostingResult.ok) {
        if (hostingResult.reason === 'hosting_not_configured') {
          showNotification(t(hydratedSettings.language, 'notifications_imageHostingNotConfigured'), 'error');
        } else {
          showNotification(
            t(hydratedSettings.language, 'notifications_imageUploadFailed', { error: hostingResult.message }),
            'error',
          );
        }
        return;
      }

      let markdownForPublish = hostingResult.markdown;
      if (markdownForPublish !== contentToPublish) {
        setContentForFile(activeTabId, markdownForPublish);
        const savedHosting = await forceSave(markdownForPublish);
        if (!savedHosting) {
          showNotification(t(hydratedSettings.language, 'notifications_saveBeforePublishFailed'), 'error');
          return;
        }
        markdownForPublish = useAppStore.getState().fileContents[activeTabId] ?? markdownForPublish;
      }

      const prepared = await prepareSimpleBlogPublish({
        files: latestFiles,
        blogSiteUrl: normalizeBlogSiteUrl(hydratedSettings.blogSiteUrl),
        rootFolderPath: latestRootFolderPath,
        currentFilePath: activeFile.path,
        markdownContent: markdownForPublish,
      });

      if (prepared.unresolvedImages.length > 0) {
        console.warn('[publish] unresolved local images:', prepared.unresolvedImages);
      }

      await invokePublishWithTimeout<{ deploymentUrl?: string | null }>('publish_simple_blog', {
        request: {
          blogRepoUrl: normalizeBlogRepoUrl(hydratedSettings.blogRepoUrl),
          blogGithubToken: hydratedSettings.blogGithubToken?.trim() || null,
          postRelativePath: prepared.postRelativePath,
          assetDirectoryRelativePath: prepared.assetDirectoryRelativePath,
          markdownContent: prepared.markdownContent,
          assets: prepared.assets,
        }
      });

      const publishedUrl = buildSimpleBlogPostUrl(
        normalizeBlogSiteUrl(hydratedSettings.blogSiteUrl),
        contentToPublish,
        prepared.postRelativePath
      );

      if (!publishedUrl) {
        showNotification(t(hydratedSettings.language, 'notifications_publishUrlBuildFailed'), 'error');
        return;
      }

      const linkUpdated = await backfillFrontmatter(
        activeTabId,
        activeFile.path,
        { link: publishedUrl },
        'notifications_publishBackfillFailed',
      );
      if (!linkUpdated) {
        return;
      }

      if (prepared.unresolvedImages.length > 0) {
        showNotification(
          t(hydratedSettings.language, 'notifications_unresolvedImages', {
            count: String(prepared.unresolvedImages.length),
          }),
          'error',
        );
      } else {
        showNotification(t(hydratedSettings.language, 'notifications_publishSuccess'), 'success');
      }
    } catch (error) {
      console.error('Failed to publish blog:', error);
      const message = error instanceof Error
        ? localizeKnownError(hydratedSettings.language, error.message)
        : t(hydratedSettings.language, 'notifications_publishFailed');
      showNotification(message, 'error');
    } finally {
      setPublishing(false);
    }
  }, [activeTabId, backfillFrontmatter, files, forceSave, invokePublishWithTimeout, rootFolderPath, setContentForFile, setPublishing, showNotification]);

  const handlePublishWechatDraft = useCallback(async (input: WechatDraftPublishInput) => {
    const hydratedSettings = await hydrateSensitiveSettingsIntoStore();

    if (!activeTabId) {
      showNotification(t(hydratedSettings.language, 'notifications_noFileToPublish'), 'error');
      return false;
    }

    if (!isTauriEnvironment()) {
      showNotification(t(hydratedSettings.language, 'notifications_desktopPublishOnly'), 'error');
      return false;
    }

    if (!hydratedSettings.wechatAppId.trim()) {
      showNotification(t(hydratedSettings.language, 'notifications_setWechatAppIdFirst'), 'error');
      return false;
    }

    if (!hydratedSettings.wechatAppSecret?.trim()) {
      showNotification(t(hydratedSettings.language, 'notifications_setWechatAppSecretFirst'), 'error');
      return false;
    }

    if (!input.coverImagePath.trim()) {
      showNotification(t(hydratedSettings.language, 'notifications_setWechatCoverFirst'), 'error');
      return false;
    }

    const currentContent = useAppStore.getState().fileContents[activeTabId];
    if (!currentContent) {
      showNotification(t(hydratedSettings.language, 'notifications_noContentToPublish'), 'error');
      return false;
    }

    const activeFile = findFileInTree(files, activeTabId);
    if (!activeFile) {
      showNotification(t(hydratedSettings.language, 'notifications_noFileToPublish'), 'error');
      return false;
    }

    setPublishing(true);
    try {
      const saved = await forceSave();
      if (!saved) {
        showNotification(t(hydratedSettings.language, 'notifications_saveBeforePublishFailed'), 'error');
        return false;
      }

      const storeState = useAppStore.getState();
      const latestContent = storeState.fileContents[activeTabId] ?? currentContent;
      const prepared = await prepareWechatDraftPublish({
        files: storeState.files,
        rootFolderPath: storeState.rootFolderPath,
        currentFilePath: activeFile.path,
        markdownContent: latestContent,
        settings: storeState.settings,
      });

      if (prepared.unresolvedImages.length > 0) {
        showNotification(
          t(hydratedSettings.language, 'notifications_unresolvedImages', {
            count: String(prepared.unresolvedImages.length),
          }),
          'error',
        );
        return false;
      }

      const result = await invokePublishWithTimeout<{ mediaId: string }>('publish_wechat_draft', {
        request: {
          wechatAppId: hydratedSettings.wechatAppId.trim(),
          wechatAppSecret: hydratedSettings.wechatAppSecret?.trim() || null,
          draftMediaId: input.existingDraftMediaId?.trim() || null,
          title: input.title.trim(),
          author: input.author.trim() || null,
          digest: input.digest.trim() || null,
          contentSourceUrl: input.contentSourceUrl.trim() || null,
          showCoverPic: input.showCoverPic,
          coverImagePath: input.coverImagePath.trim(),
          contentHtml: prepared.contentHtml,
          imageAssets: prepared.imageAssets,
        },
      });

      const backfilled = await backfillFrontmatter(
        activeTabId,
        activeFile.path,
        {
          wechat_draft_media_id: result.mediaId,
          wechat_draft_updated_at: new Date().toISOString(),
        },
        'notifications_wechatDraftBackfillFailed',
      );
      if (!backfilled) {
        return false;
      }

      showNotification(t(hydratedSettings.language, 'notifications_wechatDraftSuccess'), 'success');
      return true;
    } catch (error) {
      console.error('Failed to publish WeChat draft:', error);
      const message = error instanceof Error
        ? localizeKnownError(hydratedSettings.language, error.message)
        : t(hydratedSettings.language, 'notifications_wechatPublishFailed');
      showNotification(message, 'error');
      return false;
    } finally {
      setPublishing(false);
    }
  }, [activeTabId, backfillFrontmatter, files, forceSave, invokePublishWithTimeout, setPublishing, showNotification]);

  return { handleExportToPdf, handlePublishSimpleBlog, handlePublishWechatDraft };
}
