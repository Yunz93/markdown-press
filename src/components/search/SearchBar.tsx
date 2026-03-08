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
          <button onClick={() => setShowReplace(!showReplace)} className="search-btn">
            {showReplace ? 'Hide' : 'Replace'}
          </button>
          {showReplace && (
            <>
              <button onClick={replace} disabled={results.length === 0} className="search-btn">
                Replace
              </button>
              <button onClick={replaceAll} disabled={results.length === 0} className="search-btn">
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
