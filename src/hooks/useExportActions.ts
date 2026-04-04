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
  forceSave: (contentOverride?: string) => Promise<boolean>,
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
          'Publishing timed out. Check your GitHub network connection and token permissions, then try again.'
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
      return;
    }

    const linkedContent = updateFrontmatter(latestContent, { link: publishedUrl });
    if (linkedContent === latestContent) {
      return;
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
    } catch (error) {
      console.error('Failed to backfill published link:', error);
      useAppStore.getState().showNotification(
        'Published to blog, but failed to save the published link into the note.',
        'error'
      );
    }
  }, []);

  const handleExportToHtml = useCallback(async () => {
    if (!activeTabId || !content) {
      showNotification('No file to export', 'error');
      return;
    }

    const activeFile = findFileInTree(files, activeTabId);
    if (!activeFile) {
      showNotification('No file to export', 'error');
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
        showNotification('HTML exported', 'success');
      }
    } catch (error) {
      console.error('Failed to export HTML:', error);
      showNotification('Failed to export HTML', 'error');
    }
  }, [activeTabId, content, files, fontFamily, highlighter, settings.fontSize, settings.themeMode, showNotification]);

  const handlePublishBlog = useCallback(async () => {
    if (!activeTabId) {
      showNotification('No file to publish', 'error');
      return;
    }

    if (!isTauriEnvironment()) {
      showNotification('One-click publish is available in the desktop app.', 'error');
      return;
    }

    if (!settings.blogRepoUrl.trim()) {
      showNotification('Set your blog repository URL in Publishing settings first.', 'error');
      return;
    }

    if (!isValidBlogRepoUrl(settings.blogRepoUrl)) {
      showNotification('Enter a valid GitHub repository URL in Publishing settings first.', 'error');
      return;
    }

    if (!settings.blogSiteUrl.trim()) {
      showNotification('Set your blog site URL in Publishing settings first.', 'error');
      return;
    }

    if (!isValidBlogSiteUrl(settings.blogSiteUrl)) {
      showNotification('Enter a valid blog site URL in Publishing settings first.', 'error');
      return;
    }

    if (!settings.blogGithubToken?.trim()) {
      showNotification('Set your GitHub token in Publishing settings first.', 'error');
      return;
    }

    const currentContent = useAppStore.getState().fileContents[activeTabId];
    if (!currentContent) {
      showNotification('No content to publish', 'error');
      return;
    }

    const activeFile = findFileInTree(files, activeTabId);
    if (!activeFile) {
      showNotification('No file to publish', 'error');
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
        showNotification('Failed to save note before publishing.', 'error');
        return;
      }

      const prepared = await prepareSimpleBlogPublish({
        files,
        rootFolderPath,
        currentFilePath: activeFile.path,
        markdownContent: nextContent,
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
        nextContent,
        prepared.postRelativePath
      );

      if (!publishedUrl) {
        showNotification('Published to blog, but failed to build the published URL.', 'error');
        return;
      }

      void backfillPublishedLink(activeTabId, activeFile.path, publishedUrl);
      showNotification('Published to blog. Updating link in background.', 'success');
    } catch (error) {
      console.error('Failed to publish blog:', error);
      const message = error instanceof Error ? error.message : 'Failed to publish blog';
      showNotification(message, 'error');
    } finally {
      setPublishing(false);
    }
  }, [activeTabId, backfillPublishedLink, files, forceSave, invokePublishWithTimeout, rootFolderPath, setContent, setPublishing, settings.blogRepoUrl, settings.blogSiteUrl, showNotification]);

  return { handleExportToHtml, handlePublishBlog };
}
