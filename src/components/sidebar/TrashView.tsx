import React from 'react';
import type { FileNode } from '../../types';

interface TrashViewProps {
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
  if (trashItems.length === 0) {
    return (
      <div className="px-3 py-2 text-xs italic text-gray-400 text-center">
        Empty
      </div>
    );
  }

  return (
    <div className="mt-2 max-h-32 overflow-y-auto bg-black/5 dark:bg-white/5 rounded-lg p-1">
      <div className="mb-1 flex items-center justify-end px-1">
        <button
          onClick={onEmptyTrash}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
          title="Empty Trash"
        >
          Empty Trash
        </button>
      </div>
      {trashItems.map(node => (
        <div
          key={node.id}
          className="flex items-center justify-between px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded group text-gray-600 dark:text-gray-300 text-xs"
          onContextMenu={(e) => onContextMenu?.(e, node)}
        >
          <span className="truncate flex-1 pr-2">{node.name}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => onRestore(node)}
              className="p-0.5 hover:text-green-500"
              title="Restore"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
            <button
              onClick={() => onDeleteForever(node)}
              className="p-0.5 hover:text-red-500"
              title="Delete permanently"
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
