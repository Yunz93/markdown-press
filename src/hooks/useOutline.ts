import { useMemo } from "react";
import { parseHeadings } from "../utils/outline";
import { useAppStore, selectContent } from "../store/appStore";

export const useOutline = () => {
  const content = useAppStore(selectContent);
  const setActiveHeadingId = useAppStore((state) => state.setActiveHeadingId);

  // Outline headings are fully derived from the document content, so compute
  // them here instead of mirroring them into the store.
  const headings = useMemo(() => parseHeadings(content), [content]);

  const scrollToHeading = (line: number) => {
    setActiveHeadingId(headings.find((h) => h.line === line)?.id || null);
    // Editor scroll will be handled by the editor component
    return line;
  };

  return { headings, scrollToHeading };
};
