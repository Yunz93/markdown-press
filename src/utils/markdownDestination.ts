export interface ParsedMarkdownDestination {
  path: string;
  angleBrackets: boolean;
  title: string;
}

export function parseMarkdownDestination(rawDestination: string): ParsedMarkdownDestination {
  const trimmed = rawDestination.trim();
  if (!trimmed) {
    return { path: '', angleBrackets: false, title: '' };
  }

  if (trimmed.startsWith('<')) {
    const closingIndex = trimmed.indexOf('>');
    if (closingIndex > 0) {
      return {
        path: trimmed.slice(1, closingIndex).trim(),
        angleBrackets: true,
        title: trimmed.slice(closingIndex + 1).trim(),
      };
    }
  }

  const titleMatch = trimmed.match(/^(\S+)(\s+(?:"[^"]*"|'[^']*'))?\s*$/);
  return {
    path: (titleMatch?.[1] ?? trimmed).trim(),
    angleBrackets: false,
    title: titleMatch?.[2]?.trim() ?? '',
  };
}

export function stripMarkdownDestination(rawDestination: string): string | null {
  const path = parseMarkdownDestination(rawDestination).path.trim();
  return path || null;
}

export function buildMarkdownDestination(
  path: string,
  parsedDestination: ParsedMarkdownDestination
): string {
  const normalizedPath = parsedDestination.angleBrackets ? `<${path}>` : path;
  return parsedDestination.title
    ? `${normalizedPath} ${parsedDestination.title}`
    : normalizedPath;
}
