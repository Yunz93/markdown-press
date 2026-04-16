import katex from 'katex';

// KaTeX options
const katexOptions: katex.KatexOptions = {
  throwOnError: false,
  displayMode: false,
  output: 'html',
  trust: false,
};

let mermaidModulePromise: Promise<typeof import('mermaid')> | null = null;

async function loadMermaidModule() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid');
  }
  const module = await mermaidModulePromise;
  return module.default;
}

/** Last `themeMode` passed to `mermaid.initialize` (re-run when it changes). */
let lastMermaidThemeMode: 'light' | 'dark' | null = null;

async function ensureMermaidConfigured(themeMode: 'light' | 'dark' = 'light') {
  const mermaid = await loadMermaidModule();
  if (lastMermaidThemeMode === themeMode) {
    return mermaid;
  }
  mermaid.initialize({
    startOnLoad: false,
    theme: themeMode === 'dark' ? 'dark' : 'default',
    fontFamily: '"Trebuchet MS", Verdana, Arial, sans-serif',
    flowchart: {
      htmlLabels: false,
      useMaxWidth: true,
    },
  });
  lastMermaidThemeMode = themeMode;
  return mermaid;
}

export type RenderMermaidDiagramsOptions = {
  themeMode?: 'light' | 'dark';
};

/**
 * Initialize KaTeX for inline and display math
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function initKaTeX(md: any) {
  // Inline math: $...$
  md.inline.ruler.after('text', 'katex_inline_math', (state: any, silent: boolean) => {
    const start = state.pos;
    if (state.src[start] !== '$') return false;

    const end = state.src.indexOf('$', start + 1);
    if (end === -1 || end === start + 1) return false;

    // Check it's not $$ (display math)
    if (state.src[start + 1] === '$') return false;

    const content = state.src.slice(start + 1, end);

    if (!silent) {
      try {
        const rendered = katex.renderToString(content, katexOptions);
        const token = state.push('html_inline', '', 0);
        token.content = rendered;
      } catch (e) {
        const token = state.push('text', '', 0);
        token.content = `$${content}$`;
      }
    }

    state.pos = end + 1;
    return true;
  });

  // Display math: $$...$$
  md.block.ruler.after('blockquote', 'katex_display_math', (state: any, start: number, end: number) => {
    const pos = state.bMarks[start] + state.tShift[start];
    const max = state.eMarks[start];

    if (pos + 2 > max) return false;
    if (state.src.slice(pos, pos + 2) !== '$$') return false;

    let contentStart = pos + 2;
    let contentEnd = state.src.indexOf('$$', contentStart);

    // Find the closing $$
    if (contentEnd === -1) {
      // Search across multiple lines
      let currentLine = start;

      while (currentLine < state.lineMax) {
        const lineStart = state.bMarks[currentLine];
        const lineEnd = state.eMarks[currentLine];
        const lineContent = state.src.slice(lineStart, lineEnd);

        const closingIdx = lineContent.indexOf('$$');
        if (closingIdx !== -1) {
          contentEnd = lineStart + closingIdx;
          break;
        }

        currentLine++;
      }

      if (contentEnd === -1) return false;
    }

    const content = state.src.slice(contentStart, contentEnd).trim();

    // Line index of the closing `$$` (must advance state.line past entire block;
    // otherwise following lines are re-parsed as paragraphs / broken escapes, and
    // later fenced blocks e.g. ```mermaid fail to tokenize).
    let endLine = start;
    for (let i = start; i < state.lineMax; i++) {
      if (contentEnd >= state.bMarks[i] && contentEnd < state.eMarks[i]) {
        endLine = i;
        break;
      }
    }

    const token = state.push('katex_display', '', 0);
    token.content = content;
    token.map = [start, endLine + 1];

    state.line = endLine + 1;
    return true;
  });

  // Render function for display math
  md.renderer.rules.katex_display = (tokens: any[], idx: number) => {
    const content = tokens[idx].content;
    try {
      return `<div class="katex-display">${katex.renderToString(content, { ...katexOptions, displayMode: true })}</div>`;
    } catch (e) {
      return `<div class="katex-error">Failed to render: ${escapeHtml(content)}</div>`;
    }
  };
}

/**
 * Initialize Mermaid for diagrams
 */
export function initMermaid(md: any) {
  // Override fence rule to handle mermaid diagrams
  const defaultFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const token = tokens[idx];
    const fenceLang = (token.info.trim().split(/\s+/)[0] || '').toLowerCase();

    // Check if it's a mermaid diagram
    if (fenceLang === 'mermaid' || fenceLang === 'mmd') {
      const code = token.content.trim();
      // Omit a random id: it makes the HTML unstable and causes React to replace the DOM
      // on every markdown render, destroying already-rendered Mermaid SVGs and forcing a
      // re-render that can fail when the container is temporarily invisible.
      return `<div class="mermaid">${code}</div>`;
    }

    return defaultFence(tokens, idx, options, env, self);
  };
}

function getMermaidDefinition(el: HTMLElement): string {
  if (el.dataset.mermaidSource) {
    return el.dataset.mermaidSource;
  }
  return (el.textContent || '').trim();
}

/**
 * Strip SVG / error UI from `.mermaid` nodes so the next `renderMermaidDiagrams` pass re-parses
 * from source (used when the preview column was width‑0 and diagrams must not be treated as done).
 */
export function resetMermaidPlaceholders(container: HTMLElement): void {
  for (const node of container.querySelectorAll('.mermaid')) {
    const el = node as HTMLElement;
    const src = (el.dataset.mermaidSource || el.textContent || '').trim();
    if (!src) continue;
    el.replaceChildren(document.createTextNode(src));
    el.removeAttribute('data-processed');
    delete el.dataset.mermaidRendered;
    delete el.dataset.mermaidTheme;
    delete el.dataset.mermaidSource;
  }
}

/**
 * Render all Mermaid diagrams in the container.
 * Uses Mermaid's official `run()` API so diagram text is read from
 * `innerHTML` (with entity decode / dedent) and `render` receives the host element — required
 * for reliable rendering in Mermaid 11 (pie, stateDiagram, classDiagram, etc.).
 */
export async function renderMermaidDiagrams(
  container?: HTMLElement | null,
  options?: RenderMermaidDiagramsOptions,
) {
  if (typeof window === 'undefined') return;

  const themeMode = options?.themeMode ?? 'light';

  const nodeList = container
    ? container.querySelectorAll('.mermaid')
    : document.querySelectorAll('.mermaid');

  if (nodeList.length === 0) return;

  if (nodeList.length > 20) {
    console.warn(`[Mermaid] Too many diagrams (${nodeList.length}), skipping render`);
    return;
  }

  const mermaid = await ensureMermaidConfigured(themeMode);
  const all = Array.from(nodeList) as HTMLElement[];
  const sourceByEl = new Map<HTMLElement, string>();
  const pending: HTMLElement[] = [];

  for (const el of all) {
    const def = getMermaidDefinition(el);
    if (!def && !el.querySelector('svg')) {
      continue;
    }

    const rect = el.getBoundingClientRect();
    const hasVisibleLayout = rect.width >= 4;

    // Skip diagrams that aren't laid out yet (e.g. during a width transition from 0px).
    // Width is the critical dimension for Mermaid layout; height can legitimately be 0 before
    // the SVG is injected, so gating on height can starve initial renders.
    if (!hasVisibleLayout) {
      continue;
    }

    const stable = el.querySelector('svg')
      && el.dataset.mermaidRendered === 'true'
      && el.dataset.mermaidSource === def
      && (el.dataset.mermaidTheme ?? '') === themeMode;
    if (stable) {
      continue;
    }

    sourceByEl.set(el, def);
    el.removeAttribute('data-processed');
    pending.push(el);
  }

  if (pending.length === 0) {
    return;
  }

  // `mermaid.run` always reads the definition from `element.innerHTML`. After a prior pass the
  // node may still hold an SVG (e.g. same React HTML while `themeMode` or deps re-fire). Reset to
  // the stored source so Mermaid parses diagram text, not SVG markup.
  for (const el of pending) {
    const src = sourceByEl.get(el) ?? '';
    el.textContent = src;
  }

  try {
    await mermaid.run({
      nodes: pending,
      suppressErrors: true,
    });
  } catch (e) {
    console.error('Mermaid run failed:', e);
  }

  for (const el of pending) {
    const src = sourceByEl.get(el) ?? '';
    el.dataset.mermaidSource = src;
    el.dataset.mermaidTheme = themeMode;
    if (el.querySelector('svg')) {
      el.dataset.mermaidRendered = 'true';
    } else {
      el.dataset.mermaidRendered = 'error';
      const errorDiv = document.createElement('div');
      errorDiv.className = 'mermaid-error';
      errorDiv.textContent = 'Failed to render diagram';
      el.replaceChildren(errorDiv);
    }
  }
}

/**
 * Remove legacy global KaTeX overrides. Dark math colors come from `preview.css` (`.dark .katex`)
 * so they track `html.dark` and never fight `settings.themeMode` (child effects can run before
 * parent `useEffect` that used to toggle the class).
 */
export function applyKatexDarkTheme(): void {
  if (typeof document === 'undefined') return;
  document.getElementById('katex-dark-theme')?.remove();
}
