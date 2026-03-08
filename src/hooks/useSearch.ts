import { useCallback, useState } from 'react';
import { useAppStore } from '../store/appStore';

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
  const content = useAppStore((state) => state.content);
  const setContent = useAppStore((state) => state.setContent);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SearchOptions>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [replacement, setReplacement] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const search = useCallback(() => {
    if (!query) {
      setResults([]);
      setCurrentIndex(-1);
      return;
    }

    const flags = options.caseSensitive ? 'g' : 'gi';
    let pattern = query;

    if (!options.useRegex) {
      pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Whole word matching
    if (options.wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    try {
      const regex = new RegExp(pattern, flags);
      const matches: SearchResult[] = [];
      let match;

      while ((match = regex.exec(content)) !== null) {
        const line = content.substring(0, match.index).split('\n').length;
        matches.push({
          index: matches.length,
          text: match[0],
          start: match.index,
          end: match.index + match[0].length,
          line,
        });
      }

      setResults(matches);
      setCurrentIndex(matches.length > 0 ? 0 : -1);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setCurrentIndex(-1);
    }
  }, [query, content, options]);

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
    search,
    goToNext,
    goToPrevious,
    replace,
    replaceAll,
    openSearch,
    closeSearch,
  };
};
