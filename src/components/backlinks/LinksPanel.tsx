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
