import type { AIWikiReference, AppLanguage } from '../types';

const DEFAULT_WIKI_FOLDER = 'wiki';

function normalizeRelativeFolderPath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^\.\//, '');
}

export function normalizeWikiFolder(folder: string | undefined): string {
  const rawFolder = (folder || '').trim();

  if (!rawFolder) {
    return DEFAULT_WIKI_FOLDER;
  }

  if (
    rawFolder.startsWith('/')
    || rawFolder.startsWith('\\')
    || /^[A-Za-z]:/.test(rawFolder)
  ) {
    return DEFAULT_WIKI_FOLDER;
  }

  const normalized = normalizeRelativeFolderPath(rawFolder);

  if (!normalized) {
    return DEFAULT_WIKI_FOLDER;
  }

  if (normalized.split('/').some((segment) => segment === '..')) {
    return DEFAULT_WIKI_FOLDER;
  }

  return normalized;
}

export function sanitizeWikiArchiveSegment(segment: string | undefined, fallback: string): string {
  const sanitized = (segment || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return sanitized || fallback;
}

function getWikiSectionTitle(language: AppLanguage, section: 'references' | 'citations'): string {
  if (language === 'en') {
    return section === 'references' ? 'References' : 'Citation Notes';
  }

  return section === 'references' ? '参考资料' : '引用说明';
}

function formatReferenceItem(reference: AIWikiReference): string {
  const title = reference.title?.trim() || 'Untitled source';
  const parts = [title];

  if (reference.url?.trim()) {
    parts.push(reference.url.trim());
  }

  if (reference.note?.trim()) {
    parts.push(reference.note.trim());
  }

  return `- ${parts.join(' - ')}`;
}

export function buildWikiSupplementSections(
  language: AppLanguage,
  references: AIWikiReference[] | undefined,
  citations: string[] | undefined
): string {
  const normalizedReferences = (references || [])
    .filter((reference) => typeof reference?.title === 'string' && reference.title.trim())
    .map(formatReferenceItem);
  const normalizedCitations = (citations || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `- ${item}`);

  const sections: string[] = [];

  if (normalizedReferences.length > 0) {
    sections.push(`## ${getWikiSectionTitle(language, 'references')}\n\n${normalizedReferences.join('\n')}`);
  }

  if (normalizedCitations.length > 0) {
    sections.push(`## ${getWikiSectionTitle(language, 'citations')}\n\n${normalizedCitations.join('\n')}`);
  }

  if (sections.length === 0) {
    return '';
  }

  return `\n\n${sections.join('\n\n')}\n`;
}

export function buildWikiBacklink(language: AppLanguage, sourceWikiTarget: string): string {
  if (!sourceWikiTarget) {
    return '\n';
  }

  const label = language === 'en' ? 'Related source' : '关联原文';
  const separator = language === 'en' ? ':' : '：';
  const space = language === 'en' ? ' ' : '';
  return `\n\n---\n\n${label}${separator}${space}[[${sourceWikiTarget}]]\n`;
}

const DUPLICATE_WIKI_SECTION_PATTERNS = [
  /^##\s*参考资料[\t ]*$/im,
  /^##\s*引用说明[\t ]*$/im,
  /^##\s*references[\t ]*$/im,
  /^##\s*citation notes[\t ]*$/im,
];

export function stripDuplicateWikiSupplementSections(markdown: string): string {
  let next = markdown.trim();

  for (const pattern of DUPLICATE_WIKI_SECTION_PATTERNS) {
    const match = pattern.exec(next);
    if (!match || match.index < 0) {
      continue;
    }

    next = next.slice(0, match.index).trimEnd();
  }

  return next;
}
