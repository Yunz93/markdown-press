/**
 * Editor Hooks
 * 
 * 编辑器相关的自定义 hooks
 */

// EditorPane hooks
export { useCodeMirror, type UseCodeMirrorOptions, type UseCodeMirrorReturn } from './useCodeMirror';
export { useWikiLinks, type UseWikiLinksOptions, type UseWikiLinksReturn, type WikiLinkPreviewData } from './useWikiLinks';
export { useImagePaste, type UseImagePasteOptions, type UseImagePasteReturn } from './useImagePaste';
export { useScrollSync, type UseScrollSyncOptions, type UseScrollSyncReturn } from './useScrollSync';

// PreviewPane hooks
export { usePreviewRenderer, type UsePreviewRendererOptions, type UsePreviewRendererReturn } from './usePreviewRenderer';
export { usePreviewScroll, type UsePreviewScrollOptions, type UsePreviewScrollReturn } from './usePreviewScroll';
export { useWikiLinkNavigation, type UseWikiLinkNavigationOptions, type UseWikiLinkNavigationReturn, type HeadingScrollOptions } from './useWikiLinkNavigation';
