import { useCallback, useState, useRef, useEffect } from 'react';
import { useAppStore, selectContent } from '../store/appStore';
import { isLargeFile } from '../utils/performance';

export interface SearchOptions {
  caseSensitive?: boolean;
  useRegex?: boolean;
  wholeWord?: boolean;
}

export interface SearchResult {
  index: number;
  text: string;
  start: number;
  end: number;
  line: number;
}

export const useSearch = () => {
  const content = useAppStore(selectContent);
  const setContent = useAppStore((state) => state.setContent);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SearchOptions>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [replacement, setReplacement] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Refs for debounced search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSearchRef = useRef(false);

  // Immediate search function
  const performSearch = useCallback((searchQuery: string, searchOptions: SearchOptions, searchContent: string) => {
    if (!searchQuery) {
      setResults([]);
      setCurrentIndex(-1);
      setIsSearching(false);
      return;
    }

    const flags = searchOptions.caseSensitive ? 'g' : 'gi';
    let pattern = searchQuery;

    if (!searchOptions.useRegex) {
      pattern = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Whole word matching
    if (searchOptions.wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    try {
      const regex = new RegExp(pattern, flags);
      const matches: SearchResult[] = [];
      let match;

      // For large files, use chunked processing to avoid blocking
      const isLarge = isLargeFile(searchContent);
      const startTime = performance.now();
      const maxTime = isLarge ? 100 : 50; // Allow more time for large files

      while ((match = regex.exec(searchContent)) !== null) {
        const line = searchContent.substring(0, match.index).split('\n').length;
        matches.push({
          index: matches.length,
          text: match[0],
          start: match.index,
          end: match.index + match[0].length,
          line,
        });

        // Yield if taking too long
        if (matches.length % 1000 === 0 && performance.now() - startTime > maxTime) {
          console.warn('[useSearch] Search taking too long, limiting results');
          break;
        }
      }

      setResults(matches);
      setCurrentIndex(matches.length > 0 ? 0 : -1);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setCurrentIndex(-1);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search with 150ms delay
  const search = useCallback(() => {
    // Clear any pending search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsSearching(true);
    pendingSearchRef.current = true;

    // Immediate search for small files, debounced for large files
    const isLarge = isLargeFile(content);
    const delay = isLarge ? 300 : 150;

    searchTimeoutRef.current = setTimeout(() => {
      pendingSearchRef.current = false;
      performSearch(query, options, content);
    }, delay);
  }, [query, options, content, performSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Auto-search when query changes (with debounce)
  useEffect(() => {
    search();
  }, [query, options, search]);

  const goToNext = useCallback(() => {
    if (results.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % results.length);
  }, [results.length]);

  const goToPrevious = useCallback(() => {
    if (results.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + results.length) % results.length);
  }, [results.length]);

  const replace = useCallback(() => {
    if (results.length === 0 || currentIndex === -1) return;

    const result = results[currentIndex];
    const newContent =
      content.substring(0, result.start) + replacement + content.substring(result.end);

    setContent(newContent);
    search(); // Re-search after replacement
  }, [results, currentIndex, content, replacement, setContent, search]);

  const replaceAll = useCallback(() => {
    if (results.length === 0) return;

    const flags = options.caseSensitive ? 'g' : 'gi';
    let pattern = query;

    if (!options.useRegex) {
      pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    if (options.wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    try {
      const newContent = content.replace(new RegExp(pattern, flags), replacement);
      setContent(newContent);
      setResults([]);
      setCurrentIndex(-1);
    } catch (error) {
      console.error('Replace all error:', error);
    }
  }, [results.length, query, content, replacement, options, setContent]);

  const openSearch = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setCurrentIndex(-1);
  }, []);

  return {
    query,
    setQuery,
    options,
    setOptions,
    results,
    currentIndex,
    replacement,
    setReplacement,
    isOpen,
    isSearching,
    search,
    goToNext,
    goToPrevious,
    replace,
    replaceAll,
    openSearch,
    closeSearch,
  };
};
