import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';

interface ContentSearchProps {
  onClose: () => void;
}

interface SearchMatch {
  index: number;
  length: number;
  line: number;
  column: number;
}

/**
 * Content search component with find and replace functionality
 */
export const ContentSearch: React.FC<ContentSearchProps> = ({ onClose }) => {
  const content = useAppStore(selectContent);
  const { setContent, activeTabId, updateTabContent } = useAppStore();
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [showReplace, setShowReplace] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Find all matches
  const findMatches = useCallback((text: string): SearchMatch[] => {
    if (!text || !content) return [];

    const matches: SearchMatch[] = [];
    const searchContent = caseSensitive ? content : content.toLowerCase();
    const searchTerm = caseSensitive ? text : text.toLowerCase();

    if (useRegex) {
      try {
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(text, flags);
        let match;
        while ((match = regex.exec(searchContent)) !== null) {
          const line = searchContent.substring(0, match.index).split('\n').length;
          const lineStart = searchContent.lastIndexOf('\n', match.index - 1) + 1;
          const column = match.index - lineStart + 1;

          matches.push({
            index: match.index,
            length: match[0].length,
            line,
            column
          });
        }
      } catch {
        return [];
      }
    } else {
      let index = 0;
      while ((index = searchContent.indexOf(searchTerm, index)) !== -1) {
        const line = searchContent.substring(0, index).split('\n').length;
        const lineStart = searchContent.lastIndexOf('\n', index - 1) + 1;
        const column = index - lineStart + 1;

        matches.push({
          index,
          length: searchTerm.length,
          line,
          column
        });
        index += searchTerm.length;
      }
    }

    return matches;
  }, [content, caseSensitive, useRegex]);

  // Update matches when search text changes
  useEffect(() => {
    if (searchText) {
      const newMatches = findMatches(searchText);
      setMatches(newMatches);
      setCurrentMatchIndex(0);
    } else {
      setMatches([]);
      setCurrentMatchIndex(0);
    }
  }, [searchText, findMatches]);

  // Navigate to next match
  const goToNextMatch = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  // Navigate to previous match
  const goToPrevMatch = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  // Replace current match
  const replaceCurrentMatch = useCallback(() => {
    if (matches.length === 0 || !activeTabId) return;

    const match = matches[currentMatchIndex];
    const newContent = content.substring(0, match.index) +
      replaceText +
      content.substring(match.index + match.length);
    setContent(newContent);
    if (activeTabId) {
      updateTabContent(activeTabId, newContent);
    }
  }, [matches, currentMatchIndex, content, replaceText, setContent, activeTabId, updateTabContent]);

  // Replace all matches
  const replaceAllMatches = useCallback(() => {
    if (matches.length === 0 || !activeTabId) return;

    let newContent = content;

    if (useRegex) {
      try {
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(searchText, flags);
        newContent = content.replace(regex, replaceText);
      } catch {
        return;
      }
    } else {
      const searchLower = caseSensitive ? searchText : searchText.toLowerCase();
      const contentLower = caseSensitive ? content : content.toLowerCase();

      let result = '';
      let lastIndex = 0;

      let index = 0;
      while ((index = contentLower.indexOf(searchLower, index)) !== -1) {
        result += content.substring(lastIndex, index) + replaceText;
        lastIndex = index + searchLower.length;
        index = lastIndex;
      }
      result += content.substring(lastIndex);
      newContent = result;
    }

    setContent(newContent);
    if (activeTabId) {
      updateTabContent(activeTabId, newContent);
    }
  }, [matches, content, searchText, replaceText, caseSensitive, useRegex, setContent, activeTabId, updateTabContent]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        goToPrevMatch();
      } else {
        goToNextMatch();
      }
    } else if (e.key === 'F3') {
      e.preventDefault();
      if (e.shiftKey) {
        goToPrevMatch();
      } else {
        goToNextMatch();
      }
    }
  }, [onClose, goToNextMatch, goToPrevMatch]);

  // Scroll to current match in editor
  useEffect(() => {
    if (matches.length > 0) {
      const match = matches[currentMatchIndex];
      const editorElement = document.querySelector('textarea.editor-pane') as HTMLTextAreaElement | null;
      if (!editorElement) return;

      editorElement.focus();
      editorElement.setSelectionRange(match.index, match.index + match.length);

      const lineIndex = content.substring(0, match.index).split('\n').length - 1;
      const lineHeight = parseFloat(getComputedStyle(editorElement).lineHeight) || 24;
      editorElement.scrollTop = Math.max(0, lineIndex * lineHeight - editorElement.clientHeight * 0.3);
    }
  }, [matches, currentMatchIndex, content]);

  return (
    <div
      className="absolute top-0 right-0 w-96 max-w-full bg-white dark:bg-gray-900 border-b border-l border-gray-200 dark:border-gray-700 shadow-lg rounded-bl-xl z-40"
      onKeyDown={handleKeyDown}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Find</span>
            <button
              onClick={() => setShowReplace(!showReplace)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {showReplace ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
              {showReplace ? 'Hide Replace' : 'Show Replace'}
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search..."
              className="w-full pl-3 pr-20 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                onClick={() => setCaseSensitive(!caseSensitive)}
                className={`p-1 rounded transition-colors ${
                  caseSensitive
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title="Case sensitive"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 20l4-10 4 10" />
                  <line x1="5.5" y1="16" x2="10.5" y2="16" />
                  <path d="M16 8h4a2 2 0 0 1 0 4h-4v8" />
                </svg>
              </button>
              <button
                onClick={() => setUseRegex(!useRegex)}
                className={`p-1 rounded transition-colors ${
                  useRegex
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title="Regular expression"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 7 8 7 8 11" />
                  <polyline points="20 17 16 17 16 13" />
                  <line x1="8" y1="7" x2="16" y2="15" />
                  <line x1="16" y1="9" x2="16" y2="9" />
                  <line x1="8" y1="15" x2="8" y2="15" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex items-center">
            <button
              onClick={goToPrevMatch}
              disabled={matches.length === 0}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous match (Shift+Enter)"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              onClick={goToNextMatch}
              disabled={matches.length === 0}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next match (Enter)"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Match count */}
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {searchText && (
            matches.length > 0
              ? `${currentMatchIndex + 1} of ${matches.length} matches`
              : 'No matches found'
          )}
        </div>

        {/* Replace inputs */}
        {showReplace && (
          <div className="space-y-2">
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={replaceCurrentMatch}
                disabled={matches.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                </svg>
                Replace
              </button>
              <button
                onClick={replaceAllMatches}
                disabled={matches.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-black dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 1l4 4-4 4" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <path d="M7 23l-4-4 4-4" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                Replace All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
