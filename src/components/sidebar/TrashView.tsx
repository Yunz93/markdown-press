import React from 'react';
import type { FileNode } from '../../types';
import { useI18n } from '../../hooks/useI18n';

export interface TrashViewProps {
  trashItems: FileNode[];
  onRestore: (file: FileNode) => void;
  onDeleteForever: (file: FileNode) => void;
  onEmptyTrash: () => void;
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void;
}

export const TrashView: React.FC<TrashViewProps> = ({
  trashItems,
  onRestore,
  onDeleteForever,
  onEmptyTrash,
  onContextMenu
}) => {
  const { t } = useI18n();

  if (trashItems.length === 0) {
    return (
      <div className="px-3 py-2 text-xs italic text-gray-400 text-center">
        无
      </div>
    );
  }

  return (
    <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-gray-200/60 bg-white/45 p-1 dark:border-white/10 dark:bg-[#0f151f]">
      <div className="mb-1 flex items-center justify-end px-1">
        <button
          onClick={onEmptyTrash}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
          title={t('context_emptyTrash')}
        >
          {t('context_emptyTrash')}
        </button>
      </div>
      {trashItems.map(node => (
        <div
          key={node.id}
          className="group flex items-center justify-between rounded px-2 py-1.5 text-xs text-gray-600 hover:bg-black/[0.04] dark:text-gray-300 dark:hover:bg-[#161e2a]"
          onContextMenu={(e) => onContextMenu?.(e, node)}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
            <span className="shrink-0 text-gray-400">
              {node.type === 'folder' ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
              )}
            </span>
            <span className="truncate flex-1">{node.name}</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => onRestore(node)}
              className="p-0.5 hover:text-green-500"
              title={t('context_restore')}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
            <button
              onClick={() => onDeleteForever(node)}
              className="p-0.5 hover:text-red-500"
              title={t('context_deleteForever')}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
