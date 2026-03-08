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
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-all active:scale-95
        ${isLoading
          ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-wait'
          : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
        }
      `}
    >
      <svg className={`w-4 h-4 ${isLoading ? 'animate-pulse' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
      <span className="hidden lg:inline">{isLoading ? 'Thinking...' : 'AI Enhance'}</span>
    </button>
  );
};
