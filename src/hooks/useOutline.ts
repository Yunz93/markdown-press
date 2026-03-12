import { useEffect } from 'react';
import { parseHeadings, type HeadingNode } from '../utils/outline';
import { useAppStore, selectContent } from '../store/appStore';

export const useOutline = () => {
  const content = useAppStore(selectContent);
  const setOutlineHeadings = useAppStore((state) => state.setOutlineHeadings);
  const setActiveHeadingId = useAppStore((state) => state.setActiveHeadingId);
  const outlineHeadings = useAppStore((state) => state.outlineHeadings);

  useEffect(() => {
    const headings = parseHeadings(content);
    setOutlineHeadings(headings);
  }, [content, setOutlineHeadings]);

  const scrollToHeading = (line: number) => {
    setActiveHeadingId(outlineHeadings.find((h) => h.line === line)?.id || null);
    // Editor scroll will be handled by the editor component
    return line;
  };

  return { headings: outlineHeadings, scrollToHeading };
};
