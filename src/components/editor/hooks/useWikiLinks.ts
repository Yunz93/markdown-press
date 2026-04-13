/**
 * WikiLinks Hook
 * 
 * 处理双向链接功能：
 * 1. 自动补全（文件和标题）
 * 2. 悬停预览
 * 3. 链接解析和跳转
 */

import { useCallback, useMemo, useRef } from 'react';
import type { ShikiHighlighter } from '../../../hooks/useShikiHighlighter';
import type { Completion, CompletionContext, CompletionSource } from '@codemirror/autocomplete';
import type { FileNode } from '../../../types';
import { renderMarkdown } from '../../../utils/markdown';
import {
  extractWikiNoteFragment,
  parseWikiLinkReference,
  resolveWikiLinkFile,
} from '../../../utils/wikiLinks';
import {
  findHeadingByReference,
  findOpenWikiLinkAt,
  findWikiLinkAt,
  flattenMarkdownFiles,
  getWikiHeadingCandidates,
  getWikiLinkDisplayPath,
  getWikiLinkInsertPath,
  stripMarkdownExtension,
} from '../../../utils/wikiLinkEditor';

export interface WikiLinkPreviewData {
  title: string;
  subtitle?: string;
  html: string;
}

export interface WikiLinkInfo {
  from: number;
  to: number;
  raw: string;
  embed: boolean;
}

export interface UseWikiLinksOptions {
  content: string;
  currentFilePath?: string | null;
  rootFolderPath?: string | null;
  files: FileNode[];
  fileContents: Record<string, string>;
  highlighter?: ShikiHighlighter | null;
  themeMode?: 'light' | 'dark';
  readFile: (file: FileNode) => Promise<string>;
}

export interface UseWikiLinksReturn {
  // 自动补全
  completionSource: CompletionSource;
  // 预览相关
  buildPreview: (rawTarget: string) => Promise<WikiLinkPreviewData | null>;
  findWikiLinkAtPosition: (text: string, pos: number) => WikiLinkInfo | null;
  // 文件列表（用于补全）
  markdownFiles: FileNode[];
  fileCompletionOptions: Completion[];
}

export function useWikiLinks(options: UseWikiLinksOptions): UseWikiLinksReturn {
  const {
    content,
    currentFilePath,
    rootFolderPath,
    files,
    fileContents,
    highlighter,
    themeMode = 'light',
    readFile,
  } = options;

  // 缓存文件读取结果
  const hoveredLinkCacheRef = useRef(new Map<string, Promise<string>>());

  // 获取所有 Markdown 文件
  const markdownFiles = useMemo(() => flattenMarkdownFiles(files), [files]);

  // 当前文件的标题
  const currentHeadings = useMemo(() => getWikiHeadingCandidates(content), [content]);

  // 文件补全选项
  const fileCompletionOptions = useMemo<Completion[]>(() => {
    return markdownFiles.map((file) => {
      const insertPath = getWikiLinkInsertPath(file, rootFolderPath);
      const displayPath = getWikiLinkDisplayPath(file, rootFolderPath);
      const fileLabel = stripMarkdownExtension(file.name);

      return {
        label: fileLabel,
        displayLabel: fileLabel,
        type: 'file',
        detail: displayPath === fileLabel ? 'Knowledge base note' : displayPath,
        apply: (view, _completion, from, to) => {
          const suffix = view.state.doc.sliceString(to, to + 2) === ']]' ? '' : ']]';
          view.dispatch({
            changes: { from, to, insert: `${insertPath}${suffix}` },
            selection: { anchor: from + insertPath.length + suffix.length },
          });
        },
        boost: insertPath.includes('/') ? 0 : 1,
      };
    });
  }, [markdownFiles, rootFolderPath]);

  // 读取 Wiki 链接目标内容
  const readWikiTargetContent = useCallback(async (
    fileId: string,
    filePath: string,
    fileName: string
  ): Promise<string> => {
    // 如果是当前文件
    if (currentFilePath && filePath === currentFilePath) {
      return content;
    }

    // 检查缓存
    const cachedContent = fileContents[fileId];
    if (cachedContent !== undefined) {
      return cachedContent;
    }

    // 检查异步缓存
    const cachedPromise = hoveredLinkCacheRef.current.get(filePath);
    if (cachedPromise) {
      return cachedPromise;
    }

    // 异步读取
    const pending = readFile({
      id: fileId,
      name: fileName,
      type: 'file',
      path: filePath,
    }).catch((error) => {
      hoveredLinkCacheRef.current.delete(filePath);
      throw error;
    });

    hoveredLinkCacheRef.current.set(filePath, pending);
    return pending;
  }, [content, currentFilePath, fileContents, readFile]);

  // 构建 Wiki 链接预览
  const buildPreview = useCallback(async (rawTarget: string): Promise<WikiLinkPreviewData | null> => {
    const parsedReference = parseWikiLinkReference(rawTarget);

    // 当前文件的标题引用
    if (!parsedReference.subpathType && parsedReference.path.trim()) {
      const matchedHeading = findHeadingByReference(currentHeadings, rawTarget);
      if (matchedHeading) {
        const fragment = extractWikiNoteFragment(content, `#${matchedHeading.text}`);
        if (!fragment.markdown) return null;

        return {
          title: matchedHeading.text,
          subtitle: 'Current note',
          html: renderMarkdown(fragment.markdown, { highlighter, themeMode }),
        };
      }
    }

    // 当前文件的片段引用（仅 #heading）
    if (!parsedReference.path.trim()) {
      const fragment = extractWikiNoteFragment(content, rawTarget);
      if (!fragment.markdown) return null;

      return {
        title: fragment.title,
        subtitle: 'Current note',
        html: renderMarkdown(fragment.markdown, { highlighter, themeMode }),
      };
    }

    // 其他文件的引用
    const matchedFile = resolveWikiLinkFile(files, rawTarget, rootFolderPath, currentFilePath);
    if (!matchedFile) return null;

    const sourceContent = await readWikiTargetContent(matchedFile.id, matchedFile.path, matchedFile.name);
    const fragment = extractWikiNoteFragment(sourceContent, rawTarget);
    if (!fragment.markdown) return null;

    return {
      title: fragment.title,
      subtitle: getWikiLinkDisplayPath(matchedFile, rootFolderPath),
      html: renderMarkdown(fragment.markdown, { highlighter, themeMode }),
    };
  }, [content, currentFilePath, currentHeadings, files, highlighter, readWikiTargetContent, rootFolderPath, themeMode]);

  // 自动补全源
  const completionSource = useCallback<CompletionSource>(async (context: CompletionContext) => {
    const match = findOpenWikiLinkAt(context.state.doc.toString(), context.pos);
    if (!match) return null;

    // 文件补全（无 # 时）
    if (!match.hasHash) {
      return {
        from: match.from,
        to: match.to,
        options: fileCompletionOptions,
        validFor: /^[^#|\]\n]*$/,
      };
    }

    // 标题补全
    const noteTarget = match.pathQuery.trim();
    const targetFile = noteTarget
      ? resolveWikiLinkFile(files, noteTarget, rootFolderPath, currentFilePath)
      : null;

    let headingSourceContent = content;
    if (targetFile) {
      headingSourceContent = await readWikiTargetContent(targetFile.id, targetFile.path, targetFile.name);
    } else if (noteTarget) {
      return null;
    }

    const headingOptions: Completion[] = getWikiHeadingCandidates(headingSourceContent).map((heading) => ({
      label: heading.text,
      displayLabel: heading.text,
      type: 'property',
      detail: targetFile
        ? `${stripMarkdownExtension(targetFile.name)} · H${heading.level}`
        : `Current note · H${heading.level}`,
      apply: heading.text,
    }));

    return {
      from: match.from,
      to: match.to,
      options: headingOptions,
      validFor: /^[^|\]\n]*$/,
    };
  }, [content, currentFilePath, fileCompletionOptions, files, readWikiTargetContent, rootFolderPath]);

  // 查找位置附近的 Wiki 链接
  const findWikiLinkAtPosition = useCallback((text: string, pos: number): WikiLinkInfo | null => {
    const offsets = [0, -1, 1, -2, 2];

    for (const offset of offsets) {
      const match = findWikiLinkAt(text, pos + offset);
      if (match) {
        return match;
      }
    }

    return null;
  }, []);

  return {
    completionSource,
    buildPreview,
    findWikiLinkAtPosition,
    markdownFiles,
    fileCompletionOptions,
  };
}
