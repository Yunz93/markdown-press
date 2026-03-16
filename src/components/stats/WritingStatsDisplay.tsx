import React from 'react';
import { useWritingStats, type WritingStats } from '../../hooks/useWritingStats';

interface WritingStatsDisplayProps {
  stats?: WritingStats;
  className?: string;
  showBorder?: boolean;
}

export const WritingStatsDisplay: React.FC<WritingStatsDisplayProps> = ({
  stats: externalStats,
  className = '',
  showBorder = true
}) => {
  const computedStats = useWritingStats();
  const stats = externalStats || computedStats;

  return (
    <div className={`writing-stats flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 px-4 py-2 ${showBorder ? 'border-t border-gray-200/50 dark:border-white/5' : ''} ${className}`}>
      <div className="stat-item flex items-center gap-1.5" title="Characters">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
        </svg>
        <span>{stats.characters.toLocaleString()}</span>
      </div>
      <div className="stat-item flex items-center gap-1.5" title="Words">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19h16M4 15l4-11 4 11 4-11 4 11" />
        </svg>
        <span>{stats.words.toLocaleString()}</span>
      </div>
      <div className="stat-item flex items-center gap-1.5 hidden md:flex" title="Paragraphs">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
        <span>{stats.paragraphs.toLocaleString()}</span>
      </div>
      <div className="stat-item flex items-center gap-1.5 hidden lg:flex" title="Reading time">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>{stats.readingTimeMinutes} min</span>
      </div>
    </div>
  );
};
