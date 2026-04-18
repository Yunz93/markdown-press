import katex from 'katex';
import { isTauriEnvironment } from '../types/filesystem';

// KaTeX options
const katexOptions: katex.KatexOptions = {
  throwOnError: false,
  displayMode: false,
  output: 'htmlAndMathml',
  trust: false,
};

let mermaidModulePromise: Promise<typeof import('mermaid')> | null = null;
let mermaidStyleCounter = 0;

export type KatexRenderMode = 'mathml';

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
      } catch {
        const token = state.push('text', '', 0);
        token.content = `$${content}$`;
      }
    }

    state.pos = end + 1;
    return true;
  });

  // Display math: $$...$$
  md.block.ruler.after('blockquote', 'katex_display_math', (state: any, start: number, _end: number) => {
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
    } catch {
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

function parseSvgLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getMermaidInlinePalette(themeMode: 'light' | 'dark') {
  if (themeMode === 'dark') {
    return {
      nodeFill: '#1f2937',
      nodeStroke: '#a78bfa',
      text: '#e5e7eb',
      line: '#cbd5e1',
      clusterFill: '#111827',
      clusterStroke: '#94a3b8',
      edgeLabelFill: 'rgba(15, 23, 42, 0.85)',
    };
  }

  return {
    nodeFill: '#ECECFF',
    nodeStroke: '#9370DB',
    text: '#333333',
    line: '#333333',
    clusterFill: '#ffffde',
    clusterStroke: '#aaaa33',
    edgeLabelFill: 'rgba(232, 232, 232, 0.8)',
  };
}

function getMermaidDiagramKind(svg: SVGSVGElement): 'flowchart' | 'state' | 'pie' | 'sequence' | 'class' | 'other' {
  if (svg.classList.contains('flowchart')) return 'flowchart';
  if (svg.classList.contains('statediagram')) return 'state';
  if (svg.classList.contains('classDiagram')) return 'class';
  if (svg.getAttribute('aria-roledescription') === 'pie') return 'pie';
  if (svg.getAttribute('aria-roledescription') === 'sequence') return 'sequence';
  return 'other';
}

function removeMermaidHoistedStyle(el: HTMLElement): void {
  const styleId = el.dataset.mermaidStyleId;
  const doc = el.ownerDocument;
  if (!styleId || !doc) return;
  doc.getElementById(styleId)?.remove();
  delete el.dataset.mermaidStyleId;
}

function hoistMermaidSvgStyle(el: HTMLElement): void {
  const doc = el.ownerDocument;
  if (!doc) return;

  const svg = el.querySelector(':scope > svg');
  if (!(svg instanceof SVGSVGElement)) return;

  const styleNodes = Array.from(svg.querySelectorAll(':scope > style'));
  if (styleNodes.length === 0) return;

  const cssText = styleNodes
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
    .join('\n');
  if (!cssText) return;

  removeMermaidHoistedStyle(el);

  const styleId = `mermaid-hoisted-style-${mermaidStyleCounter += 1}`;
  const styleEl = doc.createElement('style');
  styleEl.id = styleId;
  styleEl.textContent = cssText;
  doc.head.appendChild(styleEl);
  el.dataset.mermaidStyleId = styleId;
}

function inlineMermaidSvgTheme(el: HTMLElement, themeMode: 'light' | 'dark'): void {
  const svg = el.querySelector(':scope > svg');
  if (!(svg instanceof SVGSVGElement)) return;

  const palette = getMermaidInlinePalette(themeMode);
  const diagramKind = getMermaidDiagramKind(svg);

  for (const shape of svg.querySelectorAll<SVGElement>('.node rect, .node polygon, .node ellipse, .node circle')) {
    shape.setAttribute('fill', palette.nodeFill);
    shape.setAttribute('stroke', palette.nodeStroke);
    shape.setAttribute('stroke-width', shape.getAttribute('stroke-width') || '1');
  }

  for (const shape of svg.querySelectorAll<SVGPathElement>('.node path')) {
    shape.setAttribute('fill', palette.nodeFill);
    shape.setAttribute('stroke', palette.nodeStroke);
    shape.setAttribute('stroke-width', shape.getAttribute('stroke-width') || '1');
  }

  for (const clusterRect of svg.querySelectorAll<SVGRectElement>('.cluster rect')) {
    clusterRect.setAttribute('fill', palette.clusterFill);
    clusterRect.setAttribute('stroke', palette.clusterStroke);
    clusterRect.setAttribute('stroke-width', clusterRect.getAttribute('stroke-width') || '1');
  }

  for (const edgePath of svg.querySelectorAll<SVGPathElement>('.edgePath .path, .flowchart-link')) {
    edgePath.setAttribute('stroke', palette.line);
    edgePath.setAttribute('fill', 'none');
  }

  for (const arrow of svg.querySelectorAll<SVGElement>('.marker, .marker .arrowMarkerPath, .arrowheadPath')) {
    arrow.setAttribute('fill', palette.line);
    arrow.setAttribute('stroke', palette.line);
  }

  if (diagramKind === 'flowchart') {
    for (const bg of svg.querySelectorAll<SVGRectElement>('.edgeLabel rect, .edgeLabel .background')) {
      bg.setAttribute('fill', 'none');
      bg.setAttribute('stroke', 'none');
    }

    for (const bg of svg.querySelectorAll<SVGRectElement>('.cluster-label .background')) {
      bg.setAttribute('fill', palette.edgeLabelFill);
      bg.setAttribute('stroke', 'none');
    }
  } else if (diagramKind === 'state') {
    for (const bg of svg.querySelectorAll<SVGRectElement>('.edgeLabel rect, .edgeLabel .background')) {
      bg.setAttribute('fill', 'none');
      bg.setAttribute('stroke', 'none');
    }
  }

  for (const textNode of svg.querySelectorAll<SVGTextElement>('text, tspan')) {
    textNode.setAttribute('fill', palette.text);
  }

  for (const htmlNode of svg.querySelectorAll<HTMLElement>('foreignObject div, foreignObject span, foreignObject p')) {
    htmlNode.style.color = palette.text;
    htmlNode.style.fill = palette.text;
    htmlNode.style.backgroundColor = 'transparent';
  }

  if (diagramKind === 'pie') {
    const sliceColors = Array.from(svg.querySelectorAll<SVGPathElement>('.pieCircle'))
      .map((slice) => slice.getAttribute('fill'))
      .filter((value): value is string => Boolean(value));
    const legendRects = Array.from(svg.querySelectorAll<SVGRectElement>('.legend rect'));

    legendRects.forEach((rect, index) => {
      const styleFill = rect.style.fill?.trim();
      const fill = styleFill || rect.getAttribute('fill') || sliceColors[index] || palette.nodeFill;
      rect.setAttribute('fill', fill);
      rect.setAttribute('stroke', fill);
      rect.style.fill = fill;
      rect.style.stroke = fill;
    });
  } else if (diagramKind === 'sequence') {
    for (const line of svg.querySelectorAll<SVGLineElement>('.messageLine0, .messageLine1')) {
      line.setAttribute('stroke', palette.line);
      line.setAttribute('fill', 'none');
    }

    for (const line of svg.querySelectorAll<SVGLineElement>('.actor-line')) {
      line.setAttribute('stroke', '#999999');
      line.setAttribute('fill', 'none');
    }

    for (const path of svg.querySelectorAll<SVGPathElement>('#arrowhead path, #filled-head path')) {
      path.setAttribute('fill', palette.line);
      path.setAttribute('stroke', palette.line);
    }

    for (const path of svg.querySelectorAll<SVGPathElement>('#crosshead path')) {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', palette.line);
    }
  } else if (diagramKind === 'class') {
    for (const relation of svg.querySelectorAll<SVGPathElement>('.relation')) {
      relation.setAttribute('stroke', palette.line);
      relation.setAttribute('fill', 'none');
    }

    for (const divider of svg.querySelectorAll<SVGPathElement>('.divider path')) {
      divider.setAttribute('stroke', palette.nodeStroke);
      divider.setAttribute('fill', 'none');
    }

    for (const markerPath of svg.querySelectorAll<SVGPathElement>('marker.extension path, marker.aggregation path, marker.composition path, marker.dependency path')) {
      const marker = markerPath.closest('marker');
      if (marker?.classList.contains('extension') || marker?.classList.contains('aggregation')) {
        markerPath.setAttribute('fill', 'transparent');
      } else {
        markerPath.setAttribute('fill', palette.line);
      }
      markerPath.setAttribute('stroke', palette.line);
    }

    for (const circle of svg.querySelectorAll<SVGCircleElement>('marker.lollipop circle')) {
      circle.setAttribute('fill', palette.nodeFill);
      circle.setAttribute('stroke', palette.line);
    }
  } else if (diagramKind === 'state') {
    for (const transition of svg.querySelectorAll<SVGPathElement>('.transition')) {
      transition.setAttribute('stroke', palette.line);
      transition.setAttribute('fill', 'none');
    }

    for (const markerPath of svg.querySelectorAll<SVGPathElement>('marker path')) {
      markerPath.setAttribute('fill', palette.line);
      markerPath.setAttribute('stroke', palette.line);
    }

    for (const start of svg.querySelectorAll<SVGCircleElement>('.state-start, .fork-join')) {
      start.setAttribute('fill', palette.line);
      start.setAttribute('stroke', palette.line);
    }

    for (const end of svg.querySelectorAll<SVGCircleElement>('.state-end')) {
      end.setAttribute('fill', palette.nodeStroke);
      end.setAttribute('stroke', '#ffffff');
    }

    for (const inner of svg.querySelectorAll<SVGPathElement>('.end-state-inner')) {
      inner.setAttribute('fill', '#ffffff');
      inner.setAttribute('stroke', 'none');
    }
  }
}

function normalizeMermaidSvg(el: HTMLElement, themeMode: 'light' | 'dark'): void {
  const svg = el.querySelector(':scope > svg');
  if (!(svg instanceof SVGSVGElement)) return;

  inlineMermaidSvgTheme(el, themeMode);

  const viewBox = svg.viewBox?.baseVal;
  const naturalWidth = viewBox?.width && viewBox.width > 0
    ? viewBox.width
    : parseSvgLength(svg.getAttribute('width'));
  const naturalHeight = viewBox?.height && viewBox.height > 0
    ? viewBox.height
    : parseSvgLength(svg.getAttribute('height'));

  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');

  if (naturalWidth && naturalHeight) {
    svg.style.width = `min(100%, ${naturalWidth}px)`;
    svg.style.height = 'auto';
    svg.style.maxWidth = 'none';
    svg.style.aspectRatio = `${naturalWidth} / ${naturalHeight}`;
  } else {
    svg.style.removeProperty('width');
    svg.style.height = 'auto';
    svg.style.maxWidth = '100%';
    svg.style.removeProperty('aspect-ratio');
  }
}

/**
 * Strip SVG / error UI from `.mermaid` nodes so the next `renderMermaidDiagrams` pass re-parses
 * from source (used when the preview column was width‑0 and diagrams must not be treated as done).
 */
export function resetMermaidPlaceholders(container: HTMLElement): void {
  for (const node of container.querySelectorAll('.mermaid')) {
    const el = node as HTMLElement;
    removeMermaidHoistedStyle(el);
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
      hoistMermaidSvgStyle(el);
      normalizeMermaidSvg(el, themeMode);
      el.dataset.mermaidRendered = 'true';
    } else {
      removeMermaidHoistedStyle(el);
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

  const renderMode = getKatexRenderMode();
  if (renderMode) {
    document.documentElement.setAttribute('data-katex-render-mode', renderMode);
  } else {
    document.documentElement.removeAttribute('data-katex-render-mode');
  }
}

export function getKatexRenderMode(
  options: {
    isProd?: boolean;
    isTauri?: boolean;
    protocol?: string;
  } = {},
): KatexRenderMode | null {
  const isProd = options.isProd ?? __PROD__;
  const isTauri = options.isTauri ?? isTauriEnvironment();
  const protocol = options.protocol ?? (typeof window !== 'undefined' ? window.location.protocol : '');

  const shouldUseMathMlFallback = isProd && (
    isTauri
    || protocol === 'tauri:'
    || protocol === 'asset:'
    || protocol === 'app:'
  );

  return shouldUseMathMlFallback ? 'mathml' : null;
}
