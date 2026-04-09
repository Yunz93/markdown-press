import { useCallback } from 'react';
import { useAppStore, selectContent } from '../store/appStore';
import { generateFrontmatter, parseFrontmatter, updateFrontmatter } from '../utils/frontmatter';
import { downloadHtml, exportToHtml } from '../utils/export';
import { type Frontmatter } from '../types';
import { getCompositeFontFamily } from '../utils/fontSettings';
import { buildSimpleBlogPostUrl, prepareSimpleBlogPublish } from '../utils/simpleBlogPublish';
import { getFileSystem, isTauriEnvironment } from '../types/filesystem';
import {
  isValidBlogRepoUrl,
  isValidBlogSiteUrl,
  normalizeBlogRepoUrl,
  normalizeBlogSiteUrl,
} from '../utils/blogRepo';
import { refreshDocumentUpdateTime } from '../utils/metadataFields';
import { localizeKnownError, t } from '../utils/i18n';

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
 * Encapsulates PDF export and blog publish actions.
 * Extracted from App.tsx.
 */
export function useExportActions(
  forceSave: (contentOverride?: string, options?: { formatBeforeSave?: boolean }) => Promise<boolean>,
  highlighter?: any | null
) {
  const {
    files,
    activeTabId,
    rootFolderPath,
    settings,
    setContent,
    setPublishing,
    showNotification,
  } = useAppStore();
  const content = useAppStore(selectContent);
  const fontFamily = getCompositeFontFamily(settings);

  const invokePublishWithTimeout = useCallback(async (payload: Record<string, unknown>) => {
    const { invoke } = await import('@tauri-apps/api/core');

    let timeoutId: number | null = null;
    const publishPromise = invoke<{ deploymentUrl?: string | null }>('publish_simple_blog', payload);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(
          t(settings.language, 'notifications_publishTimeout')
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

  const backfillPublishedLink = useCallback(async (fileId: string, filePath: string, publishedUrl: string) => {
    const stateBeforeWrite = useAppStore.getState();
    const latestContent = stateBeforeWrite.fileContents[fileId];
    if (!latestContent) {
      return false;
    }

    const linkedContent = refreshDocumentUpdateTime(updateFrontmatter(latestContent, { link: publishedUrl }));
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
      console.error('Failed to backfill published link:', error);
      useAppStore.getState().showNotification(
        t(settings.language, 'notifications_publishBackfillFailed'),
        'error'
      );
      return false;
    }
  }, []);

  const handleExportToHtml = useCallback(async () => {
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
        fontFamily,
        fontSettings: settings,
        fontSize: settings.fontSize,
        includeProperties: false,
        highlighter,
      });
      const saved = await downloadHtml(htmlContent, activeFile.name, activeFile.path);
      if (saved) {
        showNotification(t(settings.language, 'notifications_htmlExported'), 'success');
      }
    } catch (error) {
      console.error('Failed to export HTML:', error);
      showNotification(t(settings.language, 'notifications_exportHtmlFailed'), 'error');
    }
  }, [activeTabId, content, files, fontFamily, highlighter, settings.fontSize, settings.themeMode, showNotification]);

  const handlePublishBlog = useCallback(async () => {
    if (!activeTabId) {
      showNotification(t(settings.language, 'notifications_noFileToPublish'), 'error');
      return;
    }

    if (!isTauriEnvironment()) {
      showNotification(t(settings.language, 'notifications_desktopPublishOnly'), 'error');
      return;
    }

    if (!settings.blogRepoUrl.trim()) {
      showNotification(t(settings.language, 'notifications_setBlogRepoFirst'), 'error');
      return;
    }

    if (!isValidBlogRepoUrl(settings.blogRepoUrl)) {
      showNotification(t(settings.language, 'notifications_setValidBlogRepoFirst'), 'error');
      return;
    }

    if (!settings.blogSiteUrl.trim()) {
      showNotification(t(settings.language, 'notifications_setBlogSiteFirst'), 'error');
      return;
    }

    if (!isValidBlogSiteUrl(settings.blogSiteUrl)) {
      showNotification(t(settings.language, 'notifications_setValidBlogSiteFirst'), 'error');
      return;
    }

    if (!settings.blogGithubToken?.trim()) {
      showNotification(t(settings.language, 'notifications_setGithubTokenFirst'), 'error');
      return;
    }

    const currentContent = useAppStore.getState().fileContents[activeTabId];
    if (!currentContent) {
      showNotification(t(settings.language, 'notifications_noContentToPublish'), 'error');
      return;
    }

    const activeFile = findFileInTree(files, activeTabId);
    if (!activeFile) {
      showNotification(t(settings.language, 'notifications_noFileToPublish'), 'error');
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

      setContent(nextContent);
      const saved = await forceSave(nextContent);
      if (!saved) {
        showNotification(t(settings.language, 'notifications_saveBeforePublishFailed'), 'error');
        return;
      }

      const contentToPublish = useAppStore.getState().fileContents[activeTabId] ?? nextContent;

      const prepared = await prepareSimpleBlogPublish({
        files,
        blogSiteUrl: normalizeBlogSiteUrl(settings.blogSiteUrl),
        rootFolderPath,
        currentFilePath: activeFile.path,
        markdownContent: contentToPublish,
      });

      await invokePublishWithTimeout({
        request: {
          blogRepoUrl: normalizeBlogRepoUrl(settings.blogRepoUrl),
          blogGithubToken: settings.blogGithubToken?.trim() || null,
          postRelativePath: prepared.postRelativePath,
          assetDirectoryRelativePath: prepared.assetDirectoryRelativePath,
          markdownContent: prepared.markdownContent,
          assets: prepared.assets,
        }
      });

      const publishedUrl = buildSimpleBlogPostUrl(
        normalizeBlogSiteUrl(settings.blogSiteUrl),
        contentToPublish,
        prepared.postRelativePath
      );

      if (!publishedUrl) {
        showNotification(t(settings.language, 'notifications_publishUrlBuildFailed'), 'error');
        return;
      }

      const linkUpdated = await backfillPublishedLink(activeTabId, activeFile.path, publishedUrl);
      if (!linkUpdated) {
        return;
      }

      showNotification(t(settings.language, 'notifications_publishSuccess'), 'success');
    } catch (error) {
      console.error('Failed to publish blog:', error);
      const message = error instanceof Error
        ? localizeKnownError(settings.language, error.message)
        : t(settings.language, 'notifications_publishFailed');
      showNotification(message, 'error');
    } finally {
      setPublishing(false);
    }
  }, [activeTabId, backfillPublishedLink, files, forceSave, invokePublishWithTimeout, rootFolderPath, setContent, setPublishing, settings.blogGithubToken, settings.blogRepoUrl, settings.blogSiteUrl, showNotification]);

  return { handleExportToHtml, handlePublishBlog };
}
