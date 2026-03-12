import { useCallback } from 'react';
import { useAppStore, selectContent } from '../store/appStore';
import { analyzeContent } from '../services/geminiService';
import { parseFrontmatter } from '../utils/frontmatter';
import { type Frontmatter } from '../types';
import * as yaml from 'js-yaml';

/**
 * Encapsulates the AI-powered content analysis and frontmatter merge logic.
 * Extracted from App.tsx.
 */
export function useAIAnalyze() {
  const {
    settings,
    setAnalyzing,
    setContent,
    showNotification,
    setSettingsOpen,
  } = useAppStore();
  const content = useAppStore(selectContent);

  const handleAIAnalyze = useCallback(async () => {
    if (!content) return;

    const apiKey = settings.geminiApiKey;
    if (!apiKey) {
      showNotification('Please configure Gemini API Key in settings.', 'error');
      setSettingsOpen(true);
      return;
    }

    setAnalyzing(true);
    try {
      const { frontmatter: existingFrontmatter, body } = parseFrontmatter(content);
      const result = await analyzeContent(
        body,
        apiKey,
        settings.geminiModel || 'gemini-2.0-flash-exp'
      );
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

      const frontmatterYaml = yaml.dump(mergedFrontmatter, { skipInvalid: true });
      const frontmatterBlock = `---\n${frontmatterYaml}---\n\n`;
      const optimizedBody = (result.optimizedMarkdown || body).trim();
      const newContent = `${frontmatterBlock}${optimizedBody}\n`;

      setContent(newContent);
      showNotification('Content enhanced with AI!', 'success');
    } catch (error) {
      console.error('AI analysis failed:', error);
      showNotification('Failed to analyze content. Please check your API key and try again.', 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [content, settings.geminiApiKey, settings.geminiModel, setAnalyzing, setContent, showNotification, setSettingsOpen]);

  return { handleAIAnalyze };
}
