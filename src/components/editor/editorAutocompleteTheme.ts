import { Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * CodeMirror 的补全浮层通过 style-mod 注入，与 `&light` / `&dark` 作用域绑定。
 * 仅写在全局 editor.css 里无法压过 @codemirror/view 与 @codemirror/autocomplete 的默认主题，
 * 因此用 EditorView.baseTheme（与官方相同的 light/dark 作用域）覆盖样式。
 */
export const editorAutocompletePanelBaseTheme = Prec.high(
  EditorView.baseTheme({
    '&light .cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel': {
      border: '1px solid rgba(226, 232, 240, 0.72)',
      borderRadius: '18px',
      backgroundColor: 'rgba(255, 255, 255, 0.94)',
      boxShadow: '0 22px 52px rgba(15, 23, 42, 0.14)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
    },
    '&dark .cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel': {
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '18px',
      backgroundColor: 'rgba(17, 24, 39, 0.94)',
      boxShadow: '0 22px 56px rgba(2, 6, 23, 0.42)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel': {
      padding: '0.4rem',
      minWidth: '19rem',
      maxWidth: 'min(32rem, calc(100vw - 1.5rem))',
    },
    '.cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel > ul': {
      fontFamily: 'var(--editor-font-family)',
      fontSize: 'var(--editor-font-size)',
      lineHeight: 1.45,
      padding: 0,
      margin: 0,
      listStyle: 'none',
    },
    '.cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel ul': {
      display: 'grid',
      gap: '0.2rem',
    },
    '&light .cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel ul li': {
      display: 'flex',
      alignItems: 'center',
      gap: '0.7rem',
      minWidth: 0,
      borderRadius: '14px',
      padding: '0.55rem 0.75rem',
      color: '#1f2937',
      transition: 'background-color 140ms ease, color 140ms ease, transform 140ms ease',
    },
    '&dark .cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel ul li': {
      display: 'flex',
      alignItems: 'center',
      gap: '0.7rem',
      minWidth: 0,
      borderRadius: '14px',
      padding: '0.55rem 0.75rem',
      color: '#e5e7eb',
      transition: 'background-color 140ms ease, color 140ms ease, transform 140ms ease',
    },
    '&light .cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel ul li[aria-selected]': {
      backgroundColor: 'rgba(15, 23, 42, 0.06)',
      color: '#0f172a',
      transform: 'translateX(1px)',
    },
    '&dark .cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel ul li[aria-selected]': {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      color: '#f8fafc',
      transform: 'translateX(1px)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel .cm-completionIcon': {
      flex: '0 0 auto',
      opacity: 0.48,
      transform: 'scale(0.92)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel .cm-completionLabel': {
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontWeight: 'normal',
    },
    '&light .cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel .cm-completionDetail': {
      marginLeft: 'auto',
      flex: '0 0 auto',
      color: '#64748b',
      fontSize: '0.78em',
      letterSpacing: '0.01em',
    },
    '&dark .cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel .cm-completionDetail': {
      marginLeft: 'auto',
      flex: '0 0 auto',
      color: '#94a3b8',
      fontSize: '0.78em',
      letterSpacing: '0.01em',
    },
    '.cm-tooltip.cm-tooltip-autocomplete.editor-autocomplete-panel .cm-completionMatchedText': {
      color: 'inherit',
      fontWeight: 600,
      textDecoration: 'none',
    },
  }),
);
