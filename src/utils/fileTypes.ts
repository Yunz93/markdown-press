import type { FileNode } from "../types";

/**
 * Shared file-type predicates keyed off a file name (or path).
 * Consolidated from previously duplicated copies in App.tsx,
 * useFileOperations, useFileSystem, and knowledgeBaseService.
 */

export function isImageFile(name: string): boolean {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(name);
}

export function isPdfFile(name: string): boolean {
  return /\.pdf$/i.test(name);
}

export function isHtmlFile(name: string): boolean {
  return /\.html?$/i.test(name);
}

export function isMarkdownFile(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

/**
 * Files that can be displayed but not edited as markdown.
 */
export function isPreviewOnlyFile(name: string): boolean {
  return isImageFile(name) || isPdfFile(name) || isHtmlFile(name);
}

/**
 * A tree node that can be opened in a tab (markdown or preview-only file).
 */
export function isOpenableFile(node: FileNode): boolean {
  return (
    node.type === "file" &&
    (isMarkdownFile(node.name) || isPreviewOnlyFile(node.name))
  );
}

/**
 * Whether initial file content should be read eagerly when opening a workspace.
 */
export function shouldReadInitialFileContent(name: string): boolean {
  return isMarkdownFile(name) || isHtmlFile(name);
}
