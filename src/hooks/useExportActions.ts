import { useCallback } from 'react';
import { useAppStore, selectContent } from '../store/appStore';
import { parseFrontmatter } from '../utils/frontmatter';
import { exportToHtml, exportToPdf } from '../utils/export';
import { type Frontmatter } from '../types';
import * as yaml from 'js-yaml';

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
export function useExportActions(forceSave: () => Promise<boolean>) {
  const {
    files,
    activeTabId,
    settings,
    setContent,
    showNotification,
  } = useAppStore();
  const content = useAppStore(selectContent);

  const handleExportToPdf = useCallback(async () => {
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
        theme: settings.themeMode === 'dark' ? 'dark' : 'light',
        includeTOC: false,
      });
      exportToPdf(htmlContent, activeFile.name);
      showNotification('PDF export dialog opened', 'success');
    } catch (error) {
      console.error('Failed to export PDF:', error);
      showNotification('Failed to export PDF', 'error');
    }
  }, [activeTabId, content, files, settings.themeMode, showNotification]);

  const handlePublishBlog = useCallback(async () => {
    if (!activeTabId) {
      showNotification('No file to publish', 'error');
      return;
    }

    const currentContent = useAppStore.getState().fileContents[activeTabId];
    if (!currentContent) {
      showNotification('No content to publish', 'error');
      return;
    }

    try {
      const { frontmatter, body } = parseFrontmatter(currentContent);
      const merged: Frontmatter = {
        ...(frontmatter || {}),
        is_publish: true,
      };
      const nextContent = `---\n${yaml.dump(merged, { skipInvalid: true })}---\n\n${body}`;

      setContent(nextContent);
      await forceSave();
      showNotification('Marked as published and saved.', 'success');
    } catch (error) {
      console.error('Failed to publish blog:', error);
      showNotification('Failed to publish blog', 'error');
    }
  }, [activeTabId, forceSave, setContent, showNotification]);

  return { handleExportToPdf, handlePublishBlog };
}
