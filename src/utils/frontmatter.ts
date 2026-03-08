import yaml from 'js-yaml';
import type { Frontmatter, ParsedMarkdown } from '../types';

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter(content: string): ParsedMarkdown {
  if (!content) {
    return { frontmatter: null, body: '' };
  }

  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return { frontmatter: null, body: content };
  }

  try {
    const frontmatter = yaml.load(match[1]) as Frontmatter;
    const body = content.substring(match[0].length).trim();
    return { frontmatter, body };
  } catch (error) {
    console.error('Frontmatter parsing error:', error);
    // Return content without frontmatter if parsing fails
    return { frontmatter: null, body: content };
  }
}

/**
 * Generate frontmatter YAML string
 */
export function generateFrontmatter(frontmatter: Frontmatter): string {
  try {
    const yamlStr = yaml.dump(frontmatter, {
      indent: 2,
      lineWidth: -1, // Don't wrap lines
      noRefs: true,
      quotingType: '"',
    });
    return `---\n${yamlStr}---\n\n`;
  } catch (error) {
    console.error('Frontmatter generation error:', error);
    return '';
  }
}

/**
 * Update or add frontmatter in markdown content
 */
export function updateFrontmatter(
  content: string,
  newFrontmatter: Frontmatter
): string {
  const parsed = parseFrontmatter(content);
  const mergedFrontmatter = { ...parsed.frontmatter, ...newFrontmatter };
  const frontmatterBlock = generateFrontmatter(mergedFrontmatter);

  if (frontmatterBlock) {
    return frontmatterBlock + parsed.body;
  }

  return content;
}

/**
 * Remove frontmatter from markdown content
 */
export function removeFrontmatter(content: string): string {
  const parsed = parseFrontmatter(content);
  return parsed.body;
}

/**
 * Get frontmatter value by key
 */
export function getFrontmatterValue(
  content: string,
  key: string
): string | string[] | null {
  const parsed = parseFrontmatter(content);
  return parsed.frontmatter?.[key] ?? null;
}

/**
 * Set frontmatter value by key
 */
export function setFrontmatterValue(
  content: string,
  key: string,
  value: string | string[]
): string {
  const parsed = parseFrontmatter(content);
  const updatedFrontmatter = {
    ...parsed.frontmatter,
    [key]: value,
  };
  return updateFrontmatter(content, updatedFrontmatter);
}
