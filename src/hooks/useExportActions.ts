import { useCallback } from 'react';
import { useAppStore, selectContent } from '../store/appStore';
import { generateFrontmatter, parseFrontmatter } from '../utils/frontmatter';
import { downloadHtml, exportToHtml } from '../utils/export';
import { type Frontmatter } from '../types';
import { getCompositeFontFamily } from '../utils/fontSettings';

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
export function useExportActions(forceSave: () => Promise<boolean>, highlighter?: any | null) {
  const {
    files,
    activeTabId,
    settings,
    setContent,
    showNotification,
  } = useAppStore();
  const content = useAppStore(selectContent);
  const fontFamily = getCompositeFontFamily(settings);

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
      const htmlContent = exportToHtml(content, {
        title: activeFile.name.replace('.md', ''),
        theme: settings.themeMode,
        includeTOC: false,
        fontFamily,
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
      const nextContent = `${generateFrontmatter(merged)}${body}`;

      setContent(nextContent);
      await forceSave();
      showNotification('Marked as published and saved.', 'success');
    } catch (error) {
      console.error('Failed to publish blog:', error);
      showNotification('Failed to publish blog', 'error');
    }
  }, [activeTabId, forceSave, setContent, showNotification]);

  return { handleExportToHtml, handlePublishBlog };
}
