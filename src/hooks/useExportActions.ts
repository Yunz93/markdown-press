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
      const htmlContent = exportToHtml(content, {
        title: activeFile.name.replace('.md', ''),
        theme: 'light',
        includeTOC: false,
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        includeProperties: false,
      });
      const saved = await exportToPdf(htmlContent, activeFile.name, activeFile.path);
      if (saved) {
        showNotification('PDF exported', 'success');
      }
    } catch (error) {
      console.error('Failed to export PDF:', error);
      showNotification('Failed to export PDF', 'error');
    }
  }, [activeTabId, content, files, settings.fontFamily, settings.fontSize, showNotification]);

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
