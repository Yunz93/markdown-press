import React from 'react';

interface AIButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export const AIButton: React.FC<AIButtonProps> = ({
  onClick,
  disabled = false,
  isLoading = false
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      title={isLoading ? 'AI Enhancing' : 'AI Enhance'}
      className={`
        p-2 rounded-lg transition-all active:scale-95
        ${isLoading
          ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-wait'
          : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
        }
      `}
    >
      <svg className={`w-4 h-4 ${isLoading ? 'animate-pulse' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M8 14a6 6 0 1 1 8 0c-.8.7-1.4 1.7-1.6 2.8a1 1 0 0 1-1 .8h-2.8a1 1 0 0 1-1-.8C9.4 15.7 8.8 14.7 8 14Z" />
      </svg>
    </button>
  );
};
