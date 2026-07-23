import React, { useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import { useI18n } from "../../hooks/useI18n";
import {
  getBacklinks,
  getOutbounds,
  getUnresolvedOutbounds,
} from "../../services/vault/linkIndexService";
import type { WikiOutboundLink } from "../../types/vaultIndex";

function displayName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.split("/").pop() || normalized;
  return base.replace(/\.(md|markdown)$/i, "");
}

interface LinksPanelProps {
  onOpenPath: (path: string) => void;
  onCreateMissingNote?: (targetRaw: string) => void;
}

const LinkRow: React.FC<{
  label: string;
  meta?: string;
  danger?: boolean;
  onClick?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ label, meta, danger, onClick, actionLabel, onAction }) => (
  <div className={`links-row ${danger ? "is-unresolved" : ""}`}>
    <button
      type="button"
      className="links-row-main"
      onClick={onClick}
      disabled={!onClick}
      title={label}
    >
      <span className="links-row-title">{label}</span>
      {meta ? <span className="links-row-meta">{meta}</span> : null}
    </button>
    {actionLabel && onAction ? (
      <button type="button" className="links-row-action" onClick={onAction}>
        {actionLabel}
      </button>
    ) : null}
  </div>
);

function formatOutboundMeta(link: WikiOutboundLink): string {
  const parts: string[] = [];
  if (link.isEmbed) parts.push("embed");
  if (link.subpath) parts.push(`#${link.subpath.replace(/^\^/, "^")}`);
  if (link.displayText && link.displayText !== link.targetRaw) {
    parts.push(link.displayText);
  }
  return parts.join(" · ");
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable scatter positions — no edges, labels beside dots. */
function layoutScatterPoints(
  ids: string[],
  width: number,
  height: number,
  centerId: string,
): Array<{ id: string; x: number; y: number }> {
  const padX = 28;
  const padY = 22;
  const minX = padX;
  const maxX = width - padX;
  const minY = padY;
  const maxY = height - padY;
  const points = ids.map((id) => {
    if (id === centerId) {
      return { id, x: width * 0.48, y: height * 0.46 };
    }
    const h = hashString(id);
    const x = minX + ((h % 1000) / 1000) * (maxX - minX);
    const y = minY + (((h >>> 10) % 1000) / 1000) * (maxY - minY);
    return { id, x, y };
  });

  // Light repulsion so labels stay readable in the narrow rail.
  for (let iter = 0; iter < 24; iter += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i]!;
        const b = points[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const minDist = a.id === centerId || b.id === centerId ? 42 : 36;
        if (dist >= minDist) continue;
        const push = ((minDist - dist) / minDist) * 4.5;
        dx = (dx / dist) * push;
        dy = (dy / dist) * push;
        if (a.id !== centerId) {
          a.x -= dx;
          a.y -= dy;
        }
        if (b.id !== centerId) {
          b.x += dx;
          b.y += dy;
        }
      }
    }
    for (const point of points) {
      if (point.id === centerId) continue;
      point.x = Math.min(maxX, Math.max(minX, point.x));
      point.y = Math.min(maxY, Math.max(minY, point.y));
    }
  }

  return points;
}

const NeighborhoodGraph: React.FC<{
  centerPath: string;
  nodes: Array<{ path: string; kind: "in" | "out" }>;
  onOpenPath: (path: string) => void;
}> = ({ centerPath, nodes, onOpenPath }) => {
  const width = 260;
  const height = 200;
  const ids = useMemo(
    () => [centerPath, ...nodes.map((node) => node.path)],
    [centerPath, nodes],
  );
  const points = useMemo(
    () => layoutScatterPoints(ids, width, height, centerPath),
    [ids, centerPath],
  );

  return (
    <svg
      className="links-neighborhood-graph"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={displayName(centerPath)}
    >
      {points.map((point) => {
        const isCurrent = point.id === centerPath;
        const label = displayName(point.id);
        const labelY = point.y + (point.y > height * 0.72 ? -12 : 16);
        return (
          <g
            key={point.id}
            className={
              isCurrent
                ? "links-neighborhood-item is-current"
                : "links-neighborhood-item"
            }
            onClick={() => {
              if (!isCurrent) onOpenPath(point.id);
            }}
            style={{ cursor: isCurrent ? "default" : "pointer" }}
          >
            <circle
              cx={point.x}
              cy={point.y}
              r={isCurrent ? 5.5 : 4.5}
              className={
                isCurrent
                  ? "links-neighborhood-node is-current"
                  : "links-neighborhood-node"
              }
            >
              <title>{label}</title>
            </circle>
            <text
              x={point.x}
              y={labelY}
              textAnchor="middle"
              className={
                isCurrent
                  ? "links-neighborhood-label is-current"
                  : "links-neighborhood-label"
              }
            >
              {label.length > 14 ? `${label.slice(0, 14)}…` : label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const LinksPanel: React.FC<LinksPanelProps> = ({
  onOpenPath,
  onCreateMissingNote,
}) => {
  const { t } = useI18n();
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const linkIndex = useAppStore((s) => s.linkIndex);
  const progress = useAppStore((s) => s.linkIndexProgress);

  const backlinks = useMemo(
    () => getBacklinks(linkIndex, currentFilePath),
    [linkIndex, currentFilePath],
  );
  const outbounds = useMemo(
    () => getOutbounds(linkIndex, currentFilePath),
    [linkIndex, currentFilePath],
  );
  const unresolved = useMemo(
    () => getUnresolvedOutbounds(linkIndex, currentFilePath),
    [linkIndex, currentFilePath],
  );
  const resolvedOutbounds = useMemo(
    () => outbounds.filter((link) => link.resolvedPath !== null),
    [outbounds],
  );

  const neighborhood = useMemo(() => {
    if (!currentFilePath) {
      return {
        center: "",
        nodes: [] as Array<{ path: string; kind: "in" | "out" }>,
      };
    }
    const nodes: Array<{ path: string; kind: "in" | "out" }> = [];
    const seen = new Set<string>();
    const center = currentFilePath.replace(/\\/g, "/");
    for (const group of backlinks) {
      const path = group.sourcePath.replace(/\\/g, "/");
      if (seen.has(path)) continue;
      seen.add(path);
      nodes.push({ path: group.sourcePath, kind: "in" });
    }
    for (const link of resolvedOutbounds) {
      const path = link.resolvedPath!.replace(/\\/g, "/");
      if (path === center || seen.has(path)) continue;
      seen.add(path);
      nodes.push({ path: link.resolvedPath!, kind: "out" });
    }
    return { center: currentFilePath, nodes: nodes.slice(0, 8) };
  }, [backlinks, currentFilePath, resolvedOutbounds]);

  if (!currentFilePath) {
    return <p className="empty-message">{t("links_noFile")}</p>;
  }

  if (progress.phase === "building" && !linkIndex) {
    return (
      <p className="empty-message">
        {t("links_building", {
          done: progress.done,
          total: Math.max(progress.total, 1),
        })}
      </p>
    );
  }

  return (
    <div className="links-panel-body">
      {neighborhood.nodes.length > 0 ? (
        <section className="links-section">
          <h3 className="links-section-title">
            {t("links_neighborhood")}
            <span className="links-count">{neighborhood.nodes.length}</span>
          </h3>
          <NeighborhoodGraph
            centerPath={neighborhood.center}
            nodes={neighborhood.nodes}
            onOpenPath={onOpenPath}
          />
        </section>
      ) : null}

      <section className="links-section">
        <h3 className="links-section-title">
          {t("links_backlinks")}
          <span className="links-count">{backlinks.length}</span>
        </h3>
        {backlinks.length === 0 ? (
          <p className="links-empty">{t("links_backlinksEmpty")}</p>
        ) : (
          backlinks.map((group) => (
            <LinkRow
              key={group.sourcePath}
              label={displayName(group.sourcePath)}
              meta={group.links.map((l) => l.raw).join(" ")}
              onClick={() => onOpenPath(group.sourcePath)}
            />
          ))
        )}
      </section>

      <section className="links-section">
        <h3 className="links-section-title">
          {t("links_outbounds")}
          <span className="links-count">{resolvedOutbounds.length}</span>
        </h3>
        {resolvedOutbounds.length === 0 ? (
          <p className="links-empty">{t("links_outboundsEmpty")}</p>
        ) : (
          resolvedOutbounds.map((link, index) => (
            <LinkRow
              key={`${link.raw}-${link.startOffset}-${index}`}
              label={displayName(link.resolvedPath || link.targetRaw)}
              meta={formatOutboundMeta(link)}
              onClick={
                link.resolvedPath
                  ? () => onOpenPath(link.resolvedPath!)
                  : undefined
              }
            />
          ))
        )}
      </section>

      <section className="links-section">
        <h3 className="links-section-title">
          {t("links_unresolved")}
          <span className="links-count">{unresolved.length}</span>
        </h3>
        {unresolved.length === 0 ? (
          <p className="links-empty">{t("links_unresolvedEmpty")}</p>
        ) : (
          unresolved.map((link, index) => (
            <LinkRow
              key={`${link.raw}-${link.startOffset}-u-${index}`}
              label={link.targetRaw || link.raw}
              meta={link.raw}
              danger
              actionLabel={
                onCreateMissingNote ? t("links_createNote") : undefined
              }
              onAction={
                onCreateMissingNote && link.targetRaw.trim()
                  ? () => onCreateMissingNote(link.targetRaw.trim())
                  : undefined
              }
            />
          ))
        )}
      </section>
    </div>
  );
};
