import { useCallback } from 'react';
import { useAppStore, selectContent } from '../store/appStore';
import { useFileSystem } from './useFileSystem';
import { analyzeMarkdownWithProvider, ensureAIConfiguration, generateWikiFromSelectionWithProvider } from '../services/aiService';
import { hydrateSensitiveSettingsIntoStore } from '../services/secureSettingsService';
import { generateFrontmatter, parseFrontmatter } from '../utils/frontmatter';
import { parseMetadataTemplateValue } from '../utils/metadataFields';
import { type Frontmatter } from '../types';
import { getFileSystem } from '../types/filesystem';
import { localizeKnownError, t } from '../utils/i18n';

function getFrontmatterBlockLength(content: string): number {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  return match ? match[0].length : 0;
}

function getFileNameFromPath(path: string | null): string {
  if (!path) return '';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

function stripMarkdownExtension(fileName: string): string {
  return fileName.replace(/\.(md|markdown)$/i, '');
}

function getParentPath(path: string | null): string | undefined {
  if (!path) return undefined;
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return undefined;
  return normalized.slice(0, index);
}

function sanitizeWikiFileName(input: string): string {
  const sanitized = input
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return sanitized || 'Untitled Wiki';
}

function sanitizeWikiLinkAlias(input: string): string {
  return input
    .replace(/\]\]/g, '')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildContextSnippet(content: string, from: number, to: number, radius: number = 800) {
  const safeFrom = Math.max(0, from);
  const safeTo = Math.min(content.length, to);
  return {
    before: content.slice(Math.max(0, safeFrom - radius), safeFrom).trim(),
    after: content.slice(safeTo, Math.min(content.length, safeTo + radius)).trim(),
  };
}

function extractDocumentTitle(content: string, fallbackPath: string | null): string {
  const { frontmatter, body } = parseFrontmatter(content);

  if (typeof frontmatter?.title === 'string' && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }

  const headingLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line));

  if (headingLine) {
    return headingLine.replace(/^#\s+/, '').trim();
  }

  return stripMarkdownExtension(getFileNameFromPath(fallbackPath));
}

async function resolveUniqueWikiFileName(baseName: string, folderPath: string): Promise<string> {
  const fs = await getFileSystem();
  const normalizedBase = sanitizeWikiFileName(baseName);

  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : ` ${index + 1}`;
    const candidate = `${normalizedBase}${suffix}.md`;
    const separator = folderPath.includes('\\') ? '\\' : '/';
    const fullPath = `${folderPath}${folderPath.endsWith(separator) ? '' : separator}${candidate}`;

    if (!await fs.fileExists(fullPath)) {
      return candidate;
    }
  }

  return `${normalizedBase} ${Date.now()}.md`;
}

function ensureHeading(markdown: string, title: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return `# ${title}\n\n`;
  }

  if (/^#\s+/.test(trimmed)) {
    return `${trimmed}\n`;
  }

  return `# ${title}\n\n${trimmed}\n`;
}

function buildGeneratedWikiContent(options: {
  title: string;
  summary: string;
  tags: string[];
  selectedText: string;
  markdown: string;
  sourceWikiTarget: string;
  metadataFields: { key: string; defaultValue: string }[];
}) {
  const frontmatter: Frontmatter = {};

  options.metadataFields.forEach((field) => {
    frontmatter[field.key] = parseMetadataTemplateValue(field.defaultValue);
  });

  frontmatter.title = options.title;
  frontmatter.description = options.summary;
  frontmatter.tags = options.tags;
  if (options.selectedText.trim() && options.selectedText.trim() !== options.title.trim()) {
    frontmatter.aliases = [sanitizeWikiLinkAlias(options.selectedText)];
  }

  const backlink = options.sourceWikiTarget
    ? `\n\n---\n\n关联原文：[[${options.sourceWikiTarget}]]\n`
    : '\n';

  return `${generateFrontmatter(frontmatter)}${ensureHeading(options.markdown, options.title).trimEnd()}${backlink}`;
}

/**
 * Encapsulates AI-powered content analysis and selection-based wiki generation.
 */
export function useAIAnalyze() {
  const {
    settings,
    activeTabId,
    setAnalyzing,
    setContentForFile,
    showNotification,
    setSettingsOpen,
    currentFilePath,
    rootFolderPath,
  } = useAppStore();
  const content = useAppStore(selectContent);
  const { createFile } = useFileSystem();

  const handleAIAnalyze = useCallback(async () => {
    if (!content || !activeTabId) return;
    const hydratedSettings = await hydrateSensitiveSettingsIntoStore();

    try {
      ensureAIConfiguration(hydratedSettings);
    } catch (error) {
      showNotification(error instanceof Error ? localizeKnownError(hydratedSettings.language, error.message) : t(hydratedSettings.language, 'notifications_aiConfigFirst'), 'error');
      setSettingsOpen(true);
      return;
    }

    setAnalyzing(true);
    try {
      const { frontmatter: existingFrontmatter, body } = parseFrontmatter(content);
      const result = await analyzeMarkdownWithProvider(body, hydratedSettings);
      const today = new Date().toISOString().split('T')[0];

      const aiFields: Partial<Frontmatter> = {
        title: result.seoTitle,
        date: today,
        description: result.summary,
        tags: result.suggestedTags,
      };

      const mergedFrontmatter: Frontmatter = {
        ...existingFrontmatter,
        ...aiFields,
        ...(existingFrontmatter?.category !== undefined && { category: existingFrontmatter.category }),
        ...(existingFrontmatter?.status !== undefined && { status: existingFrontmatter.status }),
        ...(existingFrontmatter?.is_publish !== undefined && { is_publish: existingFrontmatter.is_publish }),
        ...(existingFrontmatter?.layout !== undefined && { layout: existingFrontmatter.layout }),
      };

      const frontmatterBlock = generateFrontmatter(mergedFrontmatter);
      const optimizedBody = (result.optimizedMarkdown || body).trim();
      const newContent = `${frontmatterBlock}${optimizedBody}\n`;

      setContentForFile(activeTabId, newContent);
      showNotification(t(hydratedSettings.language, 'notifications_aiEnhanced'), 'success');
    } catch (error) {
      console.error('AI analysis failed:', error);
      showNotification(t(hydratedSettings.language, 'notifications_aiEnhanceFailed'), 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [activeTabId, content, setAnalyzing, setContentForFile, showNotification, setSettingsOpen]);

  const handleGenerateWikiFromSelection = useCallback(async (selection: {
    text: string;
    from: number;
    to: number;
  }): Promise<string | null> => {
    if (!content) return null;

      const selectedText = sanitizeWikiLinkAlias(selection.text);
    if (!selectedText) {
      return null;
    }
    const hydratedSettings = await hydrateSensitiveSettingsIntoStore();

    try {
      ensureAIConfiguration(hydratedSettings);
    } catch (error) {
      showNotification(error instanceof Error ? localizeKnownError(hydratedSettings.language, error.message) : t(hydratedSettings.language, 'notifications_aiConfigFirst'), 'error');
      setSettingsOpen(true);
      return null;
    }

    const targetFolder = getParentPath(currentFilePath) || rootFolderPath || undefined;
    if (!targetFolder) {
      showNotification(t(hydratedSettings.language, 'notifications_noKnowledgeBaseForWiki'), 'error');
      return null;
    }

    setAnalyzing(true);
    try {
      const documentTitle = extractDocumentTitle(content, currentFilePath);
      const currentFileName = stripMarkdownExtension(getFileNameFromPath(currentFilePath));
      const sourceWikiTarget = currentFileName || documentTitle;
      const context = buildContextSnippet(content, selection.from, selection.to);
      const result = await generateWikiFromSelectionWithProvider({
        selectedText,
        contextBefore: context.before,
        contextAfter: context.after,
        documentTitle,
        currentFileName,
        isFrontmatterSelection: selection.to <= getFrontmatterBlockLength(content),
      }, hydratedSettings);

      const targetFileName = await resolveUniqueWikiFileName(result.title || selectedText, targetFolder);
      const wikiTarget = stripMarkdownExtension(targetFileName);
      const nextFileContent = buildGeneratedWikiContent({
        title: result.title || selectedText,
        summary: result.summary || '',
        tags: result.suggestedTags || [],
        selectedText,
        markdown: result.markdown || '',
        sourceWikiTarget,
        metadataFields: hydratedSettings.metadataFields,
      });

      const newFile = await createFile(targetFileName, nextFileContent, targetFolder);
      if (!newFile) {
        throw new Error('Failed to create the wiki file.');
      }

      showNotification(t(hydratedSettings.language, 'notifications_wikiCreated', { name: newFile.name }), 'success');
      return `[[${wikiTarget}|${selectedText}]]`;
    } catch (error) {
      console.error('AI wiki generation failed:', error);
      showNotification(t(hydratedSettings.language, 'notifications_wikiCreateFailed'), 'error');
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, [content, currentFilePath, rootFolderPath, setAnalyzing, showNotification, setSettingsOpen, createFile]);

  return {
    handleAIAnalyze,
    handleGenerateWikiFromSelection,
  };
}
