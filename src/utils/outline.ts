export interface HeadingNode {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  children: HeadingNode[];
  line?: number;
}

const FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

export function createHeadingSlug(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '');

  return slug || 'section';
}

export function createUniqueHeadingId(text: string, slugCounts: Map<string, number>): string {
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

export const parseHeadings = (content: string): HeadingNode[] => {
  const frontmatterMatch = content.match(FRONTMATTER_REGEX);
  const bodyStartOffset = frontmatterMatch ? frontmatterMatch[0].length : 0;
  const bodyContent = content.slice(bodyStartOffset);
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: HeadingNode[] = [];
  const stack: HeadingNode[] = [];
  const slugCounts = new Map<string, number>();

  let match;
  while ((match = headingRegex.exec(bodyContent)) !== null) {
    const level = match[1].length as HeadingNode['level'];
    const text = match[2].trim();
    const id = createUniqueHeadingId(text, slugCounts);
    const line = content
      .substring(0, bodyStartOffset + match.index)
      .split('\n').length;

    const node: HeadingNode = { id, level, text, children: [], line };

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
