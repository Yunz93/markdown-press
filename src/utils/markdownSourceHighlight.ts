interface MarkdownSourceHighlighter {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
}

interface FenceState {
  marker: string;
}

function renderFrontmatterScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (/^(true|false|null)$/i.test(trimmed)) {
    return span('md-token-frontmatter-bool', value);
  }

  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    return span('md-token-frontmatter-number', value);
  }

  if (/^(['"]).*\1$/.test(trimmed)) {
    return [
      span('md-token-delimiter', value.slice(0, 1)),
      span('md-token-frontmatter-string', value.slice(1, -1)),
      span('md-token-delimiter', value.slice(-1)),
    ].join('');
  }

  if (/^https?:\/\/[^\s]+$/.test(trimmed)) {
    return span('md-token-link-url', value);
  }

  return span('md-token-frontmatter-value', value);
}

function renderFrontmatterArray(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return renderFrontmatterScalar(value);
  }

  const inner = trimmed.slice(1, -1);
  if (!inner.trim()) {
    return `${span('md-token-bracket', '[')}${span('md-token-bracket', ']')}`;
  }

  const items = inner.split(',').map((item) => item.trim());
  const renderedItems = items.map((item) => renderFrontmatterScalar(item)).join(
    `${span('md-token-frontmatter-punctuation', ',')} `
  );

  return [
    span('md-token-bracket', '['),
    renderedItems,
    span('md-token-bracket', ']'),
  ].join('');
}

function renderFrontmatterValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return renderFrontmatterArray(value);
  }

  return renderFrontmatterScalar(value);
}

function renderFrontmatterLine(line: string): string {
  if (!line.trim()) return escapeHtml(line);

  const commentMatch = line.match(/^(\s*)(#.*)$/);
  if (commentMatch) {
    return `${escapeHtml(commentMatch[1])}${span('md-token-frontmatter-comment', commentMatch[2])}`;
  }

  const listMatch = line.match(/^(\s*)(-)(\s+)(.*)$/);
  if (listMatch) {
    const [, indent, marker, gap, rest] = listMatch;
    return [
      escapeHtml(indent),
      span('md-token-list-marker', marker),
      escapeHtml(gap),
      renderFrontmatterValue(rest),
    ].join('');
  }

  const keyValueMatch = line.match(/^(\s*)([^:#\n][^:\n]*?)(\s*:\s*)(.*)$/);
  if (keyValueMatch) {
    const [, indent, key, separator, rest] = keyValueMatch;
    const colonIndex = separator.indexOf(':');
    const beforeColon = separator.slice(0, colonIndex);
    const afterColon = separator.slice(colonIndex + 1);

    return [
      escapeHtml(indent),
      span('md-token-frontmatter-key', key),
      escapeHtml(beforeColon),
      span('md-token-frontmatter-punctuation', ':'),
      escapeHtml(afterColon),
      renderFrontmatterValue(rest),
    ].join('');
  }

  return span('md-token-frontmatter-value', line);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function span(className: string, value: string): string {
  return `<span class="${className}">${escapeHtml(value)}</span>`;
}

function wrapDelimToken(className: string, value: string, delimiterLength: number): string {
  const start = value.slice(0, delimiterLength);
  const middle = value.slice(delimiterLength, value.length - delimiterLength);
  const end = value.slice(value.length - delimiterLength);

  return [
    span('md-token-delimiter', start),
    span(className, middle),
    span('md-token-delimiter', end),
  ].join('');
}

function renderLinkToken(value: string, isImage: boolean): string {
  const match = value.match(/^(!)?\[([^\]]*)\]\((.*)\)$/);
  if (!match) return span(isImage ? 'md-token-image' : 'md-token-link', value);

  const [, bang = '', label, target] = match;
  return [
    bang ? span('md-token-delimiter', bang) : '',
    span('md-token-bracket', '['),
    span(isImage ? 'md-token-image-alt' : 'md-token-link-text', label),
    span('md-token-bracket', ']'),
    span('md-token-bracket', '('),
    span(isImage ? 'md-token-image-url' : 'md-token-link-url', target),
    span('md-token-bracket', ')'),
  ].join('');
}

function renderWikiLinkToken(value: string): string {
  const match = value.match(/^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/);
  if (!match) return span('md-token-link', value);

  const [, target, alias] = match;
  return [
    span('md-token-bracket', '[['),
    span('md-token-wikilink-target', target),
    alias
      ? `${span('md-token-frontmatter-punctuation', '|')}${span('md-token-wikilink-alias', alias)}`
      : '',
    span('md-token-bracket', ']]'),
  ].join('');
}

function renderInlineToken(type: string, value: string): string {
  switch (type) {
    case 'image':
      return renderLinkToken(value, true);
    case 'link':
      return renderLinkToken(value, false);
    case 'wikilink':
      return renderWikiLinkToken(value);
    case 'inline-code':
      return wrapDelimToken('md-token-inline-code', value, 1);
    case 'bold':
      return wrapDelimToken('md-token-strong', value, 2);
    case 'italic':
      return wrapDelimToken('md-token-emphasis', value, 1);
    case 'strike':
      return wrapDelimToken('md-token-strike', value, 2);
    case 'url':
      return span('md-token-link-url', value);
    default:
      return escapeHtml(value);
  }
}

function highlightInline(text: string): string {
  const patterns = [
    { type: 'wikilink', regex: /\[\[[^\]\n]+(?:\|[^\]\n]+)?\]\]/g },
    { type: 'image', regex: /!\[[^\]\n]*\]\([^)]+\)/g },
    { type: 'link', regex: /\[[^\]\n]+\]\([^)]+\)/g },
    { type: 'inline-code', regex: /`[^`\n]+`/g },
    { type: 'bold', regex: /(\*\*|__)(?=\S)(.*?\S)\1/g },
    { type: 'italic', regex: /(\*|_)(?=\S)(.*?\S)\1/g },
    { type: 'strike', regex: /~~(?=\S)(.*?\S)~~/g },
    { type: 'url', regex: /https?:\/\/[^\s)]+/g },
  ] as const;

  let cursor = 0;
  let result = '';

  while (cursor < text.length) {
    let nextMatch:
      | { type: (typeof patterns)[number]['type']; index: number; value: string }
      | null = null;

    for (const pattern of patterns) {
      pattern.regex.lastIndex = cursor;
      const match = pattern.regex.exec(text);
      if (!match || match.index < cursor) continue;

      if (
        !nextMatch ||
        match.index < nextMatch.index ||
        (match.index === nextMatch.index && match[0].length > nextMatch.value.length)
      ) {
        nextMatch = {
          type: pattern.type,
          index: match.index,
          value: match[0],
        };
      }
    }

    if (!nextMatch) {
      result += escapeHtml(text.slice(cursor));
      break;
    }

    if (nextMatch.index > cursor) {
      result += escapeHtml(text.slice(cursor, nextMatch.index));
    }

    result += renderInlineToken(nextMatch.type, nextMatch.value);
    cursor = nextMatch.index + nextMatch.value.length;
  }

  return result;
}

function normalizeContentForMirror(content: string): string {
  return content;
}

function renderFenceLine(line: string): string {
  const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (!match) return escapeHtml(line);

  const [, indent, marker, rest] = match;
  return [
    escapeHtml(indent),
    span('md-token-fence-marker', marker),
    rest ? span('md-token-fence-info', rest) : '',
  ].join('');
}

function renderListLine(line: string): string | null {
  const match = line.match(/^(\s*)((?:[-+*])|\d+\.)((?:\s+))(.*)$/);
  if (!match) return null;

  const [, indent, marker, gap, rest] = match;
  const taskMatch = rest.match(/^(\[(?: |x|X)\])(\s+)(.*)$/);

  return [
    escapeHtml(indent),
    span('md-token-list-marker', marker),
    escapeHtml(gap),
    taskMatch
      ? [
          span('md-token-task', taskMatch[1]),
          escapeHtml(taskMatch[2]),
          highlightInline(taskMatch[3]),
        ].join('')
      : highlightInline(rest),
  ].join('');
}

function renderLine(line: string, fenceState: FenceState | null): { html: string; nextFenceState: FenceState | null } {
  const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (fenceMatch) {
    const marker = fenceMatch[2];
    const nextFenceState = fenceState ? null : { marker };
    return {
      html: renderFenceLine(line),
      nextFenceState,
    };
  }

  if (fenceState) {
    return {
      html: span('md-token-code-block', line),
      nextFenceState: fenceState,
    };
  }

  if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
    return {
      html: span('md-token-rule', line),
      nextFenceState: null,
    };
  }

  const headingMatch = line.match(/^(\s*)(#{1,6})(\s+)(.*)$/);
  if (headingMatch) {
    const [, indent, marks, gap, rest] = headingMatch;
    return {
      html: [
        escapeHtml(indent),
        span('md-token-heading-mark', marks),
        escapeHtml(gap),
        span('md-token-heading-text', rest),
      ].join(''),
      nextFenceState: null,
    };
  }

  const quoteMatch = line.match(/^(\s*)(>+)(\s?)(.*)$/);
  if (quoteMatch) {
    const [, indent, marks, gap, rest] = quoteMatch;
    return {
      html: [
        escapeHtml(indent),
        span('md-token-quote-mark', marks),
        gap ? escapeHtml(gap) : '',
        highlightInline(rest),
      ].join(''),
      nextFenceState: null,
    };
  }

  const listLine = renderListLine(line);
  if (listLine !== null) {
    return {
      html: listLine,
      nextFenceState: null,
    };
  }

  return {
    html: highlightInline(line),
    nextFenceState: null,
  };
}

export function renderMarkdownSourceHighlight(
  content: string,
  _themeMode: string,
  _highlighter?: MarkdownSourceHighlighter | null
): string {
  const normalizedContent = normalizeContentForMirror(content);
  const lines = normalizedContent.split('\n');

  let fenceState: FenceState | null = null;
  let inFrontmatter = false;
  let frontmatterResolved = false;
  const highlightedLines = lines.map((line) => {
    if (!frontmatterResolved) {
      if (line === '---') {
        inFrontmatter = true;
        return span('md-token-frontmatter-mark', line);
      }
      frontmatterResolved = true;
    }

    if (inFrontmatter) {
      if (/^(---|\.\.\.)\s*$/.test(line)) {
        inFrontmatter = false;
        frontmatterResolved = true;
        return span('md-token-frontmatter-mark', line);
      }

      return renderFrontmatterLine(line);
    }

    const rendered = renderLine(line, fenceState);
    fenceState = rendered.nextFenceState;
    return rendered.html;
  });

  return `<div class="editor-source-fallback">${highlightedLines.join('\n')}</div>`;
}
