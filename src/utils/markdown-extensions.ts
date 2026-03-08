import katex from 'katex';
import mermaid from 'mermaid';

// KaTeX options
const katexOptions = {
  throwOnError: false,
  displayMode: false,
  output: 'html',
  trust: true,
};

/**
 * Initialize KaTeX for inline and display math
 */
export function initKaTeX(md: any) {
  // Inline math: $...$
  md.inline.ruler.after('text', 'katex_inline_math', (state, silent) => {
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
  md.block.ruler.after('blockquote', 'katex_display_math', (state, start, end) => {
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
      let currentPos = contentStart;

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
        currentPos = lineEnd;
      }

      if (contentEnd === -1) return false;
    }

    const content = state.src.slice(contentStart, contentEnd).trim();

    // Create token
    const token = state.push('katex_display', '', 0);
    token.content = content;
    token.map = [start, state.line];

    state.line = start + 1;
    return true;
  });

  // Render function for display math
  md.renderer.rules.katex_display = (tokens: any[], idx: any[]) => {
    const content = tokens[idx].content;
    try {
      return `<div class="katex-display">${katex.renderToString(content, { ...katexOptions, displayMode: true })}</div>`;
    } catch (e) {
      return `<div class="katex-error">Failed to render: ${content}</div>`;
    }
  };
}

/**
 * Initialize Mermaid for diagrams
 */
export function initMermaid(md: any) {
  // Configure mermaid
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'inherit',
  });

  // Override fence rule to handle mermaid diagrams
  const defaultFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const token = tokens[idx];
    const lang = token.info.trim();

    // Check if it's a mermaid diagram
    if (lang === 'mermaid' || lang === 'mmd') {
      const code = token.content.trim();
      const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;

      // Return placeholder that will be replaced by actual SVG
      return `<div class="mermaid" id="${id}">${code}</div>`;
    }

    return defaultFence(tokens, idx, options, env, self);
  };
}

/**
 * Render all Mermaid diagrams in the container
 */
export async function renderMermaidDiagrams(container?: HTMLElement | null) {
  if (typeof window === 'undefined') return;

  const elements = container
    ? container.querySelectorAll('.mermaid')
    : document.querySelectorAll('.mermaid');

  if (elements.length === 0) return;

  try {
    const { insert } = await mermaid.render('mermaid', (elements[0] as HTMLElement).textContent || '');

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      const code = el.textContent || '';
      const id = el.id || `mermaid-${i}`;

      try {
        const { svg } = await mermaid.render(id, code);
        el.innerHTML = svg;
      } catch (e) {
        el.innerHTML = `<div class="mermaid-error">Failed to render diagram: ${e}</div>`;
      }
    }
  } catch (e) {
    console.error('Mermaid render failed:', e);
  }
}

/**
 * Apply dark theme to KaTeX
 */
export function applyKatexDarkTheme() {
  if (typeof document === 'undefined') return;

  const styleId = 'katex-dark-theme';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement;

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  const isDark = document.documentElement.classList.contains('dark');

  if (isDark) {
    styleEl.textContent = `
      .katex { color: #e5e7eb; }
      .katex .mord { color: #e5e7eb; }
      .katex .mtext { color: #9ca3af; }
      .katex .msupsub { color: #e5e7eb; }
      .katex-display { color: #e5e7eb; }
      .katex-display .katex { color: #e5e7eb; }
    `;
  } else {
    styleEl.textContent = '';
  }
}
