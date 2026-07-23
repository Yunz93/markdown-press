import React, { useEffect, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { useI18n } from "../../hooks/useI18n";
import { retrieve } from "../../services/vault/retrieveService";
import { createEmbeddingProvider } from "../../services/vault/embeddingProvider";
import { getActiveVectorStore } from "../../services/vault/semanticIndexRuntime";
import type { RetrieveHit } from "../../types/vaultIndex";

interface RelatedNotesPanelProps {
  onOpenPath: (path: string) => void;
}

function displayName(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() || path;
  return base.replace(/\.(md|markdown)$/i, "");
}

export const RelatedNotesPanel: React.FC<RelatedNotesPanelProps> = ({
  onOpenPath,
}) => {
  const { t } = useI18n();
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const chunkIndex = useAppStore((s) => s.chunkIndex);
  const settings = useAppStore((s) => s.settings);
  const content = useAppStore((s) =>
    s.currentFilePath ? s.fileContents[s.currentFilePath] : undefined,
  );
  const [hits, setHits] = useState<RetrieveHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!currentFilePath || !chunkIndex) {
        setHits([]);
        return;
      }
      setLoading(true);
      try {
        const query =
          (content ?? "")
            .replace(/^---[\s\S]*?---\s*/, "")
            .trim()
            .slice(0, 500) || displayName(currentFilePath);
        const mode =
          (settings.embeddingProvider ?? "builtin") === "none"
            ? "keyword"
            : (settings.searchModeDefault ?? "hybrid");
        const results = await retrieve({
          query,
          chunkIndex,
          vectorStore: getActiveVectorStore(),
          embeddingProvider: createEmbeddingProvider(settings),
          retrieve: {
            mode,
            topK: 8,
            excludePaths: [currentFilePath],
          },
        });
        if (cancelled) return;
        // Deduplicate by file path, keep best chunk.
        const byPath = new Map<string, RetrieveHit>();
        for (const hit of results) {
          const existing = byPath.get(hit.chunk.path);
          if (!existing || hit.score > existing.score) {
            byPath.set(hit.chunk.path, hit);
          }
        }
        setHits([...byPath.values()].slice(0, 5));
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [currentFilePath, chunkIndex, content, settings]);

  if (!currentFilePath) {
    return <p className="empty-message">{t("related_noFile")}</p>;
  }
  if (loading) {
    return <p className="empty-message">{t("related_loading")}</p>;
  }
  if (hits.length === 0) {
    return <p className="empty-message">{t("related_empty")}</p>;
  }

  return (
    <div className="links-panel-body">
      <section className="links-section">
        <h3 className="links-section-title">
          {t("related_title")}
          <span className="links-count">{hits.length}</span>
        </h3>
        {hits.map((hit) => (
          <button
            key={hit.chunk.id}
            type="button"
            className="links-row-main links-row"
            onClick={() => onOpenPath(hit.chunk.path)}
            title={hit.chunk.text.slice(0, 180)}
          >
            <span className="links-row-title">
              {displayName(hit.chunk.path)}
            </span>
            <span className="links-row-meta">
              {hit.chunk.titlePath.slice(1).join(" / ") ||
                hit.chunk.text.slice(0, 80)}
            </span>
          </button>
        ))}
      </section>
    </div>
  );
};
