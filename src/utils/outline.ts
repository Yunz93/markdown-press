export interface HeadingNode {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  children: HeadingNode[];
  line?: number;
}

const FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

function countNewlinesInRange(value: string, from: number, to: number): number {
  let count = 0;
  for (let index = from; index < to; index += 1) {
    if (value.charCodeAt(index) === 10 /* \n */) {
      count += 1;
    }
  }
  return count;
}

export function createHeadingSlug(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "");

  return slug || "section";
}

export function createUniqueHeadingId(
  text: string,
  slugCounts: Map<string, number>,
): string {
  const baseSlug = createHeadingSlug(text);
  const nextCount = (slugCounts.get(baseSlug) ?? 0) + 1;
  slugCounts.set(baseSlug, nextCount);
  return nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
}

export function flattenHeadingNodes(headings: HeadingNode[]): HeadingNode[] {
  const flattened: HeadingNode[] = [];

  const visit = (nodes: HeadingNode[]) => {
    for (const node of nodes) {
      flattened.push(node);
      if (node.children.length > 0) {
        visit(node.children);
      }
    }
  };

  visit(headings);
  return flattened;
}

const FENCE_LINE_REGEX = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING_LINE_REGEX = /^(#{1,6})\s+(.+)$/;

export const parseHeadings = (content: string): HeadingNode[] => {
  const frontmatterMatch = content.match(FRONTMATTER_REGEX);
  const bodyStartOffset = frontmatterMatch ? frontmatterMatch[0].length : 0;
  const bodyContent = content.slice(bodyStartOffset);
  const headings: HeadingNode[] = [];
  const stack: HeadingNode[] = [];
  const slugCounts = new Map<string, number>();
  const bodyStartLine = countNewlinesInRange(content, 0, bodyStartOffset) + 1;

  // Scan line by line so `#` lines inside fenced code blocks (comments in
  // shell/python snippets, etc.) are not misread as document headings. The
  // preview renderer (markdown-it) also ignores them, so this keeps outline
  // ids aligned with preview heading ids.
  const lines = bodyContent.split(/\r?\n/);
  let fenceMarkerChar: string | null = null;
  let fenceMarkerLength = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    const fenceMatch = line.match(FENCE_LINE_REGEX);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fenceMarkerChar === null) {
        fenceMarkerChar = marker[0];
        fenceMarkerLength = marker.length;
      } else if (
        marker[0] === fenceMarkerChar &&
        marker.length >= fenceMarkerLength
      ) {
        fenceMarkerChar = null;
        fenceMarkerLength = 0;
      }
      continue;
    }
    if (fenceMarkerChar !== null) {
      continue;
    }

    const match = line.match(HEADING_LINE_REGEX);
    if (!match) {
      continue;
    }

    const level = match[1].length as HeadingNode["level"];
    const text = match[2].trim();
    const id = createUniqueHeadingId(text, slugCounts);
    const node: HeadingNode = {
      id,
      level,
      text,
      children: [],
      line: bodyStartLine + index,
    };

    // Find parent node
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      headings.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return headings;
};
