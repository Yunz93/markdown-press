import React from 'react';
import { parseWikiLinkReference } from '../../utils/wikiLinks';
import { resolveAttachmentTarget } from '../../utils/attachmentResolver';
import { isImageAttachment, isMarkdownNote, isPdfAttachment } from './previewUtils';
import { warmPreviewImage, resolvePreviewSource } from '../../utils/previewImageCache';

interface WikiLinkHandlerProps {
  target: string;
  label?: string;
  embedWidth?: number;
  embedHeight?: number;
  currentFilePath: string | null;
  attachmentResolverContext: any;
  onNavigate?: (target: string) => Promise<void>;
  children?: React.ReactNode;
}

export const WikiLinkHandler: React.FC<WikiLinkHandlerProps> = ({
  target,
  label,
  embedWidth,
  embedHeight,
  currentFilePath,
  attachmentResolverContext,
  onNavigate,
  children,
}) => {
  const handleClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (onNavigate) {
      await onNavigate(target);
    }
  };

  const style: React.CSSProperties = {};
  if (embedWidth) style.width = `${embedWidth}px`;
  if (embedHeight) style.height = `${embedHeight}px`;

  return (
    <a
      className="markdown-link markdown-wikilink"
      href="#"
      data-wikilink={target}
      onClick={handleClick}
      style={style}
    >
      {children || label || target}
    </a>
  );
};

interface AttachmentEmbedProps {
  target: string;
  label?: string;
  embedWidth?: number;
  embedHeight?: number;
  currentFilePath: string | null;
  attachmentResolverContext: any;
  fileContents?: Record<string, string>;
  content?: string;
  readFile?: (node: any) => Promise<string>;
  renderMarkdown?: (markdown: string, options: any) => string;
  themeMode?: string;
  highlighter?: any;
}

export const AttachmentEmbed: React.FC<AttachmentEmbedProps> = ({
  target,
  label,
  embedWidth,
  embedHeight,
  currentFilePath,
  attachmentResolverContext,
  fileContents,
  content,
  readFile,
  renderMarkdown,
  themeMode = 'light',
  highlighter,
}) => {
  const [resolved, setResolved] = React.useState<{
    type: 'image' | 'pdf' | 'note' | 'file';
    path: string;
    name: string;
    content?: string;
    title?: string;
  } | null>(null);

  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const resolveEmbed = async () => {
      try {
        const parsedTarget = parseWikiLinkReference(target, { embed: true });
        const resolvedTarget = await resolveAttachmentTarget(attachmentResolverContext, target);

        if (!resolvedTarget) {
          if (!cancelled) {
            setError(`Missing attachment: ${label || target}`);
            setLoading(false);
          }
          return;
        }

        if (isMarkdownNote(resolvedTarget.name)) {
          if (resolvedTarget.path === currentFilePath && !parsedTarget.subpath.trim()) {
            if (!cancelled) {
              setError('Cannot embed the entire current note into itself');
              setLoading(false);
            }
            return;
          }

          const sourceContent = resolvedTarget.path === currentFilePath && currentFilePath
            ? (fileContents?.[currentFilePath] ?? content ?? '')
            : readFile
              ? await readFile({
                  id: resolvedTarget.path,
                  name: resolvedTarget.name,
                  type: 'file',
                  path: resolvedTarget.path,
                })
              : '';

          // Simple fragment extraction - in real implementation would use extractWikiNoteFragment
          const title = label || resolvedTarget.name.replace(/\.(md|markdown)$/i, '');
          
          if (!cancelled) {
            setResolved({
              type: 'note',
              path: resolvedTarget.path,
              name: resolvedTarget.name,
              content: sourceContent,
              title,
            });
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setResolved({
            type: isImageAttachment(resolvedTarget.name) ? 'image' 
                 : isPdfAttachment(resolvedTarget.name) ? 'pdf' 
                 : 'file',
            path: resolvedTarget.path,
            name: resolvedTarget.name,
          });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to resolve attachment: ${label || target}`);
          setLoading(false);
        }
      }
    };

    resolveEmbed();

    return () => {
      cancelled = true;
    };
  }, [target, currentFilePath, attachmentResolverContext, fileContents, content, readFile, label]);

  if (loading) {
    return <span className="text-gray-400">Loading...</span>;
  }

  if (error || !resolved) {
    return (
      <span className="preview-attachment-file preview-attachment-file-missing">
        {error || 'Missing attachment'}
      </span>
    );
  }

  const containerStyle: React.CSSProperties = {};
  if (embedWidth) containerStyle.maxWidth = `${embedWidth}px`;
  if (embedHeight) {
    containerStyle.maxHeight = `${embedHeight}px`;
    containerStyle.overflow = 'auto';
  }

  if (resolved.type === 'image') {
    return (
      <img
        src={resolved.path}
        alt={label || resolved.name}
        className="preview-attachment-image"
        style={{ width: embedWidth, height: embedHeight, objectFit: embedHeight ? 'contain' : undefined }}
        decoding="async"
      />
    );
  }

  if (resolved.type === 'pdf') {
    return (
      <iframe
        src={`${resolved.path}#toolbar=0&navpanes=0&scrollbar=1`}
        sandbox="allow-scripts allow-same-origin"
        title={label || resolved.name}
        className="preview-attachment-pdf"
        style={{ width: embedWidth, height: embedHeight }}
      />
    );
  }

  if (resolved.type === 'note') {
    return (
      <section className="preview-note-embed" style={containerStyle}>
        <div className="preview-note-embed-title">{resolved.title}</div>
        {resolved.content && renderMarkdown && (
          <article
            className="markdown-body preview-note-embed-body"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(resolved.content, { highlighter, themeMode }),
            }}
          />
        )}
      </section>
    );
  }

  // Generic file attachment
  return (
    <a
      className="preview-attachment-file"
      href="#"
      data-attachment-path={resolved.path}
      data-attachment-name={resolved.name}
      title={`Double-click to reveal ${resolved.name}`}
    >
      <span className="preview-attachment-file-name">{label || resolved.name}</span>
      <span className="preview-attachment-file-hint">Double-click to reveal in Finder</span>
    </a>
  );
};
