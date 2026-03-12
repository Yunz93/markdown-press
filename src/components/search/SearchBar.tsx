import React, { useEffect, useRef } from 'react';
import { useSearch } from '../../hooks/useSearch';

interface SearchBarProps {
  onClose: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onClose }) => {
  const {
    query,
    setQuery,
    options,
    setOptions,
    results,
    currentIndex,
    search,
    goToNext,
    goToPrevious,
    replacement,
    setReplacement,
    replace,
    replaceAll,
  } = useSearch();

  const [showReplace, setShowReplace] = React.useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      search();
    }, 150);
    return () => clearTimeout(timer);
  }, [query, options, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        goToPrevious();
      } else {
        goToNext();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="search-bar">
      <div className="search-container">
        <div className="search-inputs">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search..."
            className="search-input"
          />
          {showReplace && (
            <input
              type="text"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Replace with..."
              className="search-input"
            />
          )}
        </div>

        <div className="search-options">
          <label className="search-option">
            <input
              type="checkbox"
              checked={options.caseSensitive}
              onChange={(e) => setOptions({ ...options, caseSensitive: e.target.checked })}
            />
            <span>Match Case</span>
          </label>
          <label className="search-option">
            <input
              type="checkbox"
              checked={options.useRegex}
              onChange={(e) => setOptions({ ...options, useRegex: e.target.checked })}
            />
            <span>Regex</span>
          </label>
          <label className="search-option">
            <input
              type="checkbox"
              checked={options.wholeWord}
              onChange={(e) => setOptions({ ...options, wholeWord: e.target.checked })}
            />
            <span>Whole Word</span>
          </label>
        </div>

        <div className="search-actions">
          <span className="search-count">
            {results.length > 0 ? `${currentIndex + 1} / ${results.length}` : '0 / 0'}
          </span>
          <button onClick={goToPrevious} disabled={results.length === 0} className="search-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button onClick={goToNext} disabled={results.length === 0} className="search-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button onClick={() => setShowReplace(!showReplace)} className="search-btn gap-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            {showReplace ? 'Hide' : 'Replace'}
          </button>
          {showReplace && (
            <>
              <button onClick={replace} disabled={results.length === 0} className="search-btn gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                </svg>
                Replace
              </button>
              <button onClick={replaceAll} disabled={results.length === 0} className="search-btn gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 1l4 4-4 4" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <path d="M7 23l-4-4 4-4" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                All
              </button>
            </>
          )}
          <button onClick={onClose} className="search-btn close-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
