import { parseFrontmatter } from './frontmatter';

export interface HeadingNode {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  children: HeadingNode[];
  line?: number;
}

export const parseHeadings = (content: string): HeadingNode[] => {
  const { body: contentWithoutFrontmatter } = parseFrontmatter(content);

  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  let match;
  while ((match = headingRegex.exec(contentWithoutFrontmatter)) !== null) {
    const level = match[1].length as HeadingNode['level'];
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fff-]/g, '');
    const line = contentWithoutFrontmatter
      .substring(0, match.index)
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
