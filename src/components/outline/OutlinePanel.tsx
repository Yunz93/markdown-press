import React, { useState } from 'react';
import type { HeadingNode } from '../../utils/outline';

interface OutlinePanelProps {
  headings: HeadingNode[];
  activeHeadingId: string | null;
  onHeadingClick: (id: string, line: number) => void;
}

interface HeadingItemProps {
  node: HeadingNode;
  depth: number;
  activeId: string | null;
  onItemClick: (id: string, line: number) => void;
}

const HeadingItem: React.FC<HeadingItemProps> = ({
  node,
  depth,
  activeId,
  onItemClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div className="outline-item">
      <div
        className={`outline-node ${activeId === node.id ? 'active' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          <button
            className={`expand-btn ${isExpanded ? 'expanded' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            <svg
              className="chevron"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <span className="spacer" />
        )}
        <button
          className={`heading-text ${activeId === node.id ? 'active' : ''}`}
          onClick={() => onItemClick(node.id, node.line!)}
          title={node.text}
        >
          <span className={`heading-level h${node.level}`}>{node.text.charAt(0)}</span>
          <span className="heading-title">{node.text}</span>
        </button>
      </div>
      {hasChildren && isExpanded && (
        <div className="children">
          {node.children.map((child) => (
            <HeadingItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              onItemClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const OutlinePanel: React.FC<OutlinePanelProps> = ({
  headings,
  activeHeadingId,
  onHeadingClick,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (headings.length === 0) {
    return (
      <div className="outline-panel empty">
        <div className="outline-header">
          <span className="title">目录</span>
        </div>
        <p className="empty-message">No headings found</p>
      </div>
    );
  }

  return (
    <div className={`outline-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="outline-header">
        <span className="title">目录</span>
        <button
          className="collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {isCollapsed ? (
              <polyline points="15 18 9 12 15 6" />
            ) : (
              <polyline points="9 18 15 12 9 6" />
            )}
          </svg>
        </button>
      </div>
      {!isCollapsed && (
        <div className="outline-content">
          {headings.map((h) => (
            <HeadingItem
              key={h.id}
              node={h}
              depth={0}
              activeId={activeHeadingId}
              onItemClick={onHeadingClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};
