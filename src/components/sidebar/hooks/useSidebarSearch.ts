import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { FileNode } from '../../../types';

const isMarkdownFile = (fileName: string): boolean => /\.(md|markdown)$/i.test(fileName);

export interface SidebarSearchSnippet {
  line: number;
  start: number;
  end: number;
  text: string;
}

export interface SidebarSearchResult {
  file: FileNode;
  filenameMatched: boolean;
  snippets: SidebarSearchSnippet[];
}

interface FileContentsMap {
  [fileId: string]: string | undefined;
}

export interface UseSidebarSearchOptions {
  files: FileNode[];
  fileContents: FileContentsMap;
  readFile: (file: FileNode) => Promise<string>;
}

export interface UseSidebarSearchReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SidebarSearchResult[];
  isSearching: boolean;
  filteredFiles: FileNode[];
  hasSearchQuery: boolean;
  hasVisibleFiles: boolean;
  handleSearchResultSelect: (file: FileNode, snippet?: SidebarSearchSnippet) => Promise<void>;
}

const normalizeSearchTarget = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[\u3000-\u303F\uFF00-\uFFEF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const collectParagraphMatches = (content: string, query: string): SidebarSearchSnippet[] => {
  const normalizedQuery = normalizeSearchTarget(query);
  const lowerContent = content.toLowerCase();
  const snippets: SidebarSearchSnippet[] = [];
  const seenRanges = new Set<string>();

  const positions: number[] = [];
  let pos = 0;
  while ((pos = lowerContent.indexOf(normalizedQuery, pos)) !== -1) {
    positions.push(pos);
    pos += normalizedQuery.length;
  }

  for (const matchPos of positions) {
    let start = matchPos;
    while (start > 0 && content[start - 1] !== '\n') start--;
    while (start < content.length && /\s/.test(content[start])) start++;

    let end = matchPos + normalizedQuery.length;
    while (end < content.length && content[end] !== '\n') end++;
    while (end > start && /\s/.test(content[end - 1])) end--;

    const line = content.slice(0, start).split('\n').length;
    const key = `${start}-${end}`;

    if (!seenRanges.has(key)) {
      seenRanges.add(key);
      snippets.push({
        line,
        start,
        end,
        text: content.slice(start, end),
      });
    }
  }

  return snippets.slice(0, 3);
};

export function useSidebarSearch(
  options: UseSidebarSearchOptions,
  deps: {
    onFileSelect: (file: FileNode) => Promise<void> | void;
    onClose: () => void;
    focusEditorRangeByOffset: (start: number, end: number, options?: { alignTopRatio?: number }) => void;
  }
): UseSidebarSearchReturn {
  const { files, fileContents, readFile: readFileFn } = options;
  const { onFileSelect, onClose, focusEditorRangeByOffset } = deps;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SidebarSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const contentCacheRef = useRef<Map<string, string | undefined>>(new Map());

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredFiles = useMemo(() => {
    // Sort files: folders first, then by name (case-insensitive, locale-aware)
    const sortNodes = (nodes: FileNode[]): FileNode[] => {
      return [...nodes].sort((a, b) => {
        // Folders come before files
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        // Sort by name (case-insensitive)
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
    };

    if (!normalizedQuery) {
      return sortNodes(files);
    }

    const filtered = files.filter((file) =>
      file.name.toLowerCase().includes(normalizedQuery) ||
      normalizeSearchTarget(file.name).includes(normalizedQuery)
    );
    return sortNodes(filtered);
  }, [files, normalizedQuery]);

  const hasSearchQuery = normalizedQuery.length > 0;
  const hasVisibleFiles = filteredFiles.length > 0;

  const searchableFiles = useMemo(() => {
    const result: FileNode[] = [];
    const walk = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'folder' && node.children) {
          walk(node.children);
        } else if (node.type === 'file' && isMarkdownFile(node.name)) {
          result.push(node);
        }
      }
    };
    walk(files);
    return result;
  }, [files]);

  useEffect(() => {
    Object.entries(fileContents).forEach(([fileId, content]) => {
      if (content !== undefined) {
        contentCacheRef.current.set(fileId, content);
      }
    });
  }, [fileContents]);

  useEffect(() => {
    const liveIds = new Set(searchableFiles.map((file) => file.id));
    for (const fileId of Array.from(contentCacheRef.current.keys())) {
      if (!liveIds.has(fileId)) {
        contentCacheRef.current.delete(fileId);
      }
    }
  }, [searchableFiles]);

  useEffect(() => {
    if (!normalizedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsSearching(true);

        const nextResults: SidebarSearchResult[] = [];
        for (const file of searchableFiles) {
          if (cancelled) return;

          const filenameMatched =
            normalizeSearchTarget(file.name).includes(normalizedQuery) ||
            file.name.toLowerCase().includes(normalizedQuery);
          let snippets: SidebarSearchSnippet[] = [];

          if (isMarkdownFile(file.name)) {
            let content = contentCacheRef.current.get(file.id);
            if (content === undefined) {
              try {
                content = await readFileFn(file);
                contentCacheRef.current.set(file.id, content);
              } catch {
                content = undefined;
              }
            }

            if (content !== undefined) {
              snippets = collectParagraphMatches(content, normalizedQuery);
            }
          }

          if (filenameMatched || snippets.length > 0) {
            nextResults.push({ file, filenameMatched, snippets });
          }
        }

        nextResults.sort((left, right) => {
          if (left.filenameMatched !== right.filenameMatched) {
            return left.filenameMatched ? -1 : 1;
          }
          if (left.snippets.length !== right.snippets.length) {
            return right.snippets.length - left.snippets.length;
          }
          return left.file.name.localeCompare(right.file.name, 'zh-Hans-CN');
        });

        if (!cancelled) {
          setSearchResults(nextResults);
          setIsSearching(false);
        }
      })();
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [readFileFn, normalizedQuery, searchableFiles]);

  const handleSearchResultSelect = useCallback(
    async (file: FileNode, snippet?: SidebarSearchSnippet) => {
      await onFileSelect(file);
      if (snippet) {
        requestAnimationFrame(() => {
          focusEditorRangeByOffset(snippet.start, snippet.end, { alignTopRatio: 0.3 });
        });
      }
      if (window.innerWidth < 768) onClose();
    },
    [onFileSelect, onClose, focusEditorRangeByOffset]
  );

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    filteredFiles,
    hasSearchQuery,
    hasVisibleFiles,
    handleSearchResultSelect,
  };
}
