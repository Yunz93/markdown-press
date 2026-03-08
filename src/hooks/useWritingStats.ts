import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';

export interface WritingStats {
  characters: number;
  charactersNoSpace: number;
  words: number;
  paragraphs: number;
  headings: number;
  readingTimeMinutes: number;
}

export const useWritingStats = () => {
  const content = useAppStore((state) => state.content);

  const stats: WritingStats = useMemo(() => {
    // Exclude code blocks and frontmatter
    const textWithoutCode = content.replace(/```[\s\S]*?```/g, '');
    const textWithoutFrontmatter = textWithoutCode.startsWith('---')
      ? textWithoutCode.substring(textWithoutCode.indexOf('---', 3) + 3)
      : textWithoutCode;

    const characters = textWithoutFrontmatter.length;
    const charactersNoSpace = textWithoutFrontmatter.replace(/\s/g, '').length;
    const words = textWithoutFrontmatter.split(/\s+/).filter((w) => w.length > 0).length;
    const paragraphs = textWithoutFrontmatter
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0).length;
    const headings = (textWithoutFrontmatter.match(/^#{1,6}\s+/gm) || []).length;

    // Chinese: ~300 chars/min, English: ~200 words/min
    const isMostlyChinese = characters > words * 2;
    const readingTimeMinutes = Math.ceil(
      isMostlyChinese ? characters / 300 : words / 200
    );

    return {
      characters,
      charactersNoSpace,
      words,
      paragraphs,
      headings,
      readingTimeMinutes,
    };
  }, [content]);

  return stats;
};
