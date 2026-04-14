import { parseFrontmatter } from '../frontmatter';
import { saveExportFile } from './core';

export function exportToPlainText(content: string): string {
  // Remove markdown formatting
  let text = parseFrontmatter(content).body;

  // Remove code blocks (keep content)
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```[a-z]*\n?/g, '').replace(/```/g, '');
  });

  // Remove inline code
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Convert links to text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove bold/italic
  text = text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1');

  // Remove heading markers
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove blockquotes
  text = text.replace(/^>\s+/gm, '');

  // Remove list markers
  text = text.replace(/^[\s]*[-*+]\s+/gm, '');
  text = text.replace(/^[\s]*\d+\.\s+/gm, '');

  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

export async function downloadPlainText(text: string, filename: string): Promise<string | null> {
  return saveExportFile({
    content: text,
    filename,
    defaultExtension: '.txt',
    mimeType: 'text/plain;charset=utf-8',
    description: 'Plain Text Document',
  });
}
