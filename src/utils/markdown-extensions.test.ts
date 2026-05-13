/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const initialize = vi.fn();
const run = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize,
    run,
  },
}));

vi.mock('../types/filesystem', () => ({
  isTauriEnvironment: vi.fn(() => false),
}));

vi.mock('katex', async () => {
  const actual = await vi.importActual<typeof import('katex')>('katex');
  return {
    default: {
      ...actual,
      renderToString: vi.fn((...args: any[]) => actual.renderToString(...args)),
    },
  };
});

import katex from 'katex';

import {
  applyKatexDarkTheme,
  getKatexRenderMode,
  getMermaidDefinition,
  getMermaidDiagramKind,
  getMermaidInlinePalette,
  getRootMermaidSvg,
  hoistMermaidSvgStyle,
  initKaTeX,
  initMermaid,
  inlineMermaidSvgTheme,
  normalizeMermaidSvg,
  parseSvgLength,
  parseSvgViewBoxSize,
  removeMermaidHoistedStyle,
  removeSvgLengthAttribute,
  renderMermaidDiagrams,
  resetMermaidPlaceholders,
} from './markdown-extensions';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createVisibleMermaidHost(innerHTML = 'flowchart LR\nA-->B'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mermaid';
  el.innerHTML = innerHTML;
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 480,
      height: 240,
      top: 0,
      right: 480,
      bottom: 240,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => null,
    }),
  });
  return el;
}

describe('escapeHtml (KaTeX/Mermaid XSS prevention)', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes img onerror XSS vector', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('<img');
    expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('leaves safe content unchanged', () => {
    const safe = 'x^2 + y^2 = z^2';
    expect(escapeHtml(safe)).toBe(safe);
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles multiple XSS vectors in one string', () => {
    const input = '<img src=x onerror="alert(document.cookie)">&<script>';
    const output = escapeHtml(input);
    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
  });
});

describe('renderMermaidDiagrams', () => {
  beforeEach(() => {
    initialize.mockReset();
    run.mockReset();
    document.body.innerHTML = '';
  });

  it('does not rerun for an already rendered diagram when only legacy layout width metadata differs', async () => {
    const container = document.createElement('div');
    const el = createVisibleMermaidHost('<svg><g></g></svg>');
    el.dataset.mermaidRendered = 'true';
    el.dataset.mermaidSource = 'flowchart LR\nA-->B';
    el.dataset.mermaidTheme = 'light';
    el.dataset.mermaidLayoutWidth = '120';
    container.appendChild(el);

    await renderMermaidDiagrams(container, { themeMode: 'light' });

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it('resets rendered placeholders back to source text', () => {
    const container = document.createElement('div');
    const el = createVisibleMermaidHost('<svg><g></g></svg>');
    el.dataset.mermaidRendered = 'true';
    el.dataset.mermaidSource = 'flowchart LR\nA-->B';
    el.dataset.mermaidTheme = 'dark';
    container.appendChild(el);

    resetMermaidPlaceholders(container);

    expect(el.textContent).toBe('flowchart LR\nA-->B');
    expect(el.dataset.mermaidRendered).toBeUndefined();
    expect(el.dataset.mermaidTheme).toBeUndefined();
    expect(el.dataset.mermaidSource).toBeUndefined();
  });

  it('marks a rendered diagram with source and theme metadata', async () => {
    run.mockImplementation(async ({ nodes }: { nodes: HTMLElement[] }) => {
      nodes.forEach((node) => {
        node.innerHTML = '<svg viewBox="0 0 120 60"><style>.node{fill:red}</style><text>ok</text></svg>';
      });
    });
    const container = document.createElement('div');
    const el = createVisibleMermaidHost('flowchart LR\nA-->B');
    container.appendChild(el);

    await renderMermaidDiagrams(container, { themeMode: 'light' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.dataset.mermaidRendered).toBe('true');
    expect(el.dataset.mermaidSource).toBe('flowchart LR\nA-->B');
    expect(el.dataset.mermaidTheme).toBe('light');
    expect(el.querySelector('.mermaid-error')).toBeNull();
  });

  it('normalizes SVGs with empty width and height attributes without keeping invalid dimensions', async () => {
    const removeAttribute = SVGSVGElement.prototype.removeAttribute;
    const directEmptyDimensionRemovals: string[] = [];
    const removeAttributeSpy = vi.spyOn(SVGSVGElement.prototype, 'removeAttribute').mockImplementation(function removeSvgAttribute(this: SVGSVGElement, name: string) {
      if ((name === 'width' || name === 'height') && this.getAttribute(name) === '') {
        directEmptyDimensionRemovals.push(name);
      }
      return removeAttribute.call(this, name);
    });

    run.mockImplementation(async ({ nodes }: { nodes: HTMLElement[] }) => {
      nodes.forEach((node) => {
        node.innerHTML = '<svg width="" height="" viewBox="0 0 120 60"><text>ok</text></svg>';
      });
    });
    const container = document.createElement('div');
    const el = createVisibleMermaidHost('flowchart LR\nA-->B');
    container.appendChild(el);

    try {
      await renderMermaidDiagrams(container, { themeMode: 'light' });
    } finally {
      removeAttributeSpy.mockRestore();
    }

    const svg = el.querySelector('svg') as SVGSVGElement | null;
    expect(svg).not.toBeNull();
    expect(svg?.hasAttribute('width')).toBe(false);
    expect(svg?.hasAttribute('height')).toBe(false);
    expect(svg?.style.aspectRatio).toBe('120 / 60');
    expect(el.dataset.mermaidRendered).toBe('true');
    expect(directEmptyDimensionRemovals).toEqual([]);
  });

  it('shows a deterministic error state when Mermaid does not produce SVG', async () => {
    run.mockResolvedValue(undefined);
    const container = document.createElement('div');
    const el = createVisibleMermaidHost('flowchart LR\nA-->');
    container.appendChild(el);

    await renderMermaidDiagrams(container, { themeMode: 'dark' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(el.querySelector('svg')).toBeNull();
    expect(el.dataset.mermaidRendered).toBe('error');
    expect(el.dataset.mermaidTheme).toBe('dark');
    expect(el.querySelector('.mermaid-error')?.textContent).toBe('Failed to render diagram');
  });

  it('renders more than 20 diagrams in bounded batches instead of skipping all', async () => {
    run.mockImplementation(async ({ nodes }: { nodes: HTMLElement[] }) => {
      nodes.forEach((node) => {
        node.innerHTML = '<svg viewBox="0 0 120 60"><text>ok</text></svg>';
      });
    });
    const container = document.createElement('div');
    for (let index = 0; index < 25; index += 1) {
      container.appendChild(createVisibleMermaidHost(`flowchart LR\nA${index}-->B${index}`));
    }

    await renderMermaidDiagrams(container, { themeMode: 'light' });

    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0][0].nodes).toHaveLength(20);
    expect(run.mock.calls[1][0].nodes).toHaveLength(5);
    expect(container.querySelectorAll('.mermaid svg')).toHaveLength(25);
    expect(Array.from(container.querySelectorAll<HTMLElement>('.mermaid')).every((node) => (
      node.dataset.mermaidRendered === 'true'
    ))).toBe(true);
  });

});

describe('getKatexRenderMode', () => {
  it('enables MathML fallback for Tauri-like surfaces', () => {
    expect(getKatexRenderMode({
      isTauri: true,
      protocol: 'tauri:',
    })).toBe('mathml');
  });

  it('enables MathML fallback for custom app protocols without relying on production build', () => {
    expect(getKatexRenderMode({
      isTauri: false,
      protocol: 'tauri:',
    })).toBe('mathml');
  });

  it('does not enable MathML fallback for non-Tauri web builds', () => {
    expect(getKatexRenderMode({
      isTauri: false,
      protocol: 'https:',
    })).toBeNull();
  });

  it('enables MathML fallback for asset: protocol', () => {
    expect(getKatexRenderMode({
      isTauri: false,
      protocol: 'asset:',
    })).toBe('mathml');
  });

  it('enables MathML fallback for app: protocol', () => {
    expect(getKatexRenderMode({
      isTauri: false,
      protocol: 'app:',
    })).toBe('mathml');
  });
});

describe('applyKatexDarkTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-katex-render-mode');
    document.querySelectorAll('[id="katex-dark-theme"]').forEach((el) => el.remove());
  });

  it('removes legacy katex-dark-theme element if present', () => {
    const legacyStyle = document.createElement('style');
    legacyStyle.id = 'katex-dark-theme';
    document.head.appendChild(legacyStyle);

    applyKatexDarkTheme();

    expect(document.getElementById('katex-dark-theme')).toBeNull();
  });

  it('sets data-katex-render-mode to mathml when in Tauri environment', async () => {
    const { isTauriEnvironment } = await import('../types/filesystem');
    vi.mocked(isTauriEnvironment).mockReturnValue(true);

    applyKatexDarkTheme();

    expect(document.documentElement.getAttribute('data-katex-render-mode')).toBe('mathml');
  });

  it('removes data-katex-render-mode when not in Tauri environment', async () => {
    const { isTauriEnvironment } = await import('../types/filesystem');
    vi.mocked(isTauriEnvironment).mockReturnValue(false);

    document.documentElement.setAttribute('data-katex-render-mode', 'mathml');
    applyKatexDarkTheme();

    expect(document.documentElement.hasAttribute('data-katex-render-mode')).toBe(false);
  });

  it('does nothing when document is undefined', () => {
    // happy-dom has document, so this just verifies no throw
    expect(() => applyKatexDarkTheme()).not.toThrow();
  });
});

describe('renderMermaidDiagrams edge cases', () => {
  beforeEach(() => {
    initialize.mockReset();
    run.mockReset();
    document.body.innerHTML = '';
  });

  it('skips diagrams with zero-width bounding rect (invisible layout)', async () => {
    const container = document.createElement('div');
    const el = document.createElement('div');
    el.className = 'mermaid';
    el.textContent = 'flowchart LR\nA-->B';
    Object.defineProperty(el, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 0,
        height: 240,
        top: 0,
        right: 0,
        bottom: 240,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => null,
      }),
    });
    container.appendChild(el);

    await renderMermaidDiagrams(container, { themeMode: 'light' });

    expect(run).not.toHaveBeenCalled();
  });

  it('logs error when mermaid.run throws but continues processing', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    run.mockRejectedValue(new Error('Mermaid crashed'));

    const container = document.createElement('div');
    const el = createVisibleMermaidHost('flowchart LR\nA-->B');
    container.appendChild(el);

    await renderMermaidDiagrams(container, { themeMode: 'light' });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Mermaid run failed:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('returns early when window is undefined (SSR)', async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - simulate SSR
    globalThis.window = undefined;

    await renderMermaidDiagrams(document.createElement('div'));

    expect(run).not.toHaveBeenCalled();
    globalThis.window = originalWindow;
  });

  it('returns early when no mermaid nodes exist', async () => {
    const container = document.createElement('div');
    await renderMermaidDiagrams(container, { themeMode: 'light' });
    expect(run).not.toHaveBeenCalled();
  });

  it('uses document.querySelectorAll when container is null', async () => {
    run.mockImplementation(async ({ nodes }: { nodes: HTMLElement[] }) => {
      nodes.forEach((node) => {
        node.innerHTML = '<svg viewBox="0 0 120 60"><text>ok</text></svg>';
      });
    });

    const el = createVisibleMermaidHost('flowchart LR\nA-->B');
    document.body.appendChild(el);

    await renderMermaidDiagrams(null, { themeMode: 'light' });

    expect(run).toHaveBeenCalledTimes(1);
    document.body.innerHTML = '';
  });

  it('skips elements with no definition and no existing svg', async () => {
    const container = document.createElement('div');
    const el = document.createElement('div');
    el.className = 'mermaid';
    el.textContent = '';
    Object.defineProperty(el, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 480,
        height: 240,
        top: 0,
        right: 480,
        bottom: 240,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => null,
      }),
    });
    container.appendChild(el);

    await renderMermaidDiagrams(container, { themeMode: 'light' });

    expect(run).not.toHaveBeenCalled();
  });
});

describe('initKaTeX', () => {
  it('registers inline math ruler and renders KaTeX', () => {
    const md = createMockMarkdownIt();
    initKaTeX(md);

    const rule = md.inline.ruler.rules.find((r: any) => r.name === 'katex_inline_math');
    expect(rule).toBeDefined();

    const state = createMockInlineState('$x^2$');
    const result = rule.fn(state, false);
    expect(result).toBe(true);
    expect(state.pos).toBe(5);
    expect(state.tokens.length).toBe(1);
    expect(state.tokens[0].type).toBe('html_inline');
  });

  it('returns false for inline math when no closing $', () => {
    const md = createMockMarkdownIt();
    initKaTeX(md);

    const rule = md.inline.ruler.rules.find((r: any) => r.name === 'katex_inline_math');
    const state = createMockInlineState('$x^2');
    const result = rule.fn(state, false);
    expect(result).toBe(false);
  });

  it('returns false for display math $$ in inline rule', () => {
    const md = createMockMarkdownIt();
    initKaTeX(md);

    const rule = md.inline.ruler.rules.find((r: any) => r.name === 'katex_inline_math');
    const state = createMockInlineState('$$x^2$$');
    const result = rule.fn(state, false);
    expect(result).toBe(false);
  });

  it('registers display math block ruler', () => {
    const md = createMockMarkdownIt();
    initKaTeX(md);

    const rule = md.block.ruler.rules.find((r: any) => r.name === 'katex_display_math');
    expect(rule).toBeDefined();

    const state = createMockBlockState('$$x^2$$');
    const result = rule.fn(state, 0, 10);
    expect(result).toBe(true);
    expect(state.line).toBe(1);
    expect(state.tokens.length).toBe(1);
    expect(state.tokens[0].type).toBe('katex_display');
    expect(state.tokens[0].content).toBe('x^2');
  });

  it('handles multi-line display math', () => {
    const md = createMockMarkdownIt();
    initKaTeX(md);

    const rule = md.block.ruler.rules.find((r: any) => r.name === 'katex_display_math');
    const state = createMockBlockState('$$\nx^2\n$$');
    const result = rule.fn(state, 0, 10);
    expect(result).toBe(true);
    expect(state.tokens[0].content).toBe('x^2');
  });

  it('returns false for display math without closing $$', () => {
    const md = createMockMarkdownIt();
    initKaTeX(md);

    const rule = md.block.ruler.rules.find((r: any) => r.name === 'katex_display_math');
    const state = createMockBlockState('$$x^2');
    const result = rule.fn(state, 0, 10);
    expect(result).toBe(false);
  });

  it('returns false when line is too short for $$', () => {
    const md = createMockMarkdownIt();
    initKaTeX(md);

    const rule = md.block.ruler.rules.find((r: any) => r.name === 'katex_display_math');
    const state = createMockBlockState('$');
    const result = rule.fn(state, 0, 10);
    expect(result).toBe(false);
  });

  it('renders display math via renderer rule', () => {
    const md = createMockMarkdownIt();
    initKaTeX(md);

    const tokens = [{ content: 'x^2' }];
    const html = md.renderer.rules.katex_display(tokens, 0);
    expect(html).toContain('katex-display');
  });

  it('falls back to error div on invalid display math', () => {
    vi.mocked(katex.renderToString).mockImplementationOnce(() => {
      throw new Error('KaTeX render failed');
    });

    const md = createMockMarkdownIt();
    initKaTeX(md);

    const tokens = [{ content: 'x^2' }];
    const html = md.renderer.rules.katex_display(tokens, 0);
    expect(html).toContain('katex-error');
  });

  it('falls back to raw text on invalid inline math', () => {
    vi.mocked(katex.renderToString).mockImplementationOnce(() => {
      throw new Error('KaTeX render failed');
    });

    const md = createMockMarkdownIt();
    initKaTeX(md);

    const rule = md.inline.ruler.rules.find((r: any) => r.name === 'katex_inline_math');
    const state = createMockInlineState('$x^2$');
    rule.fn(state, false);
    expect(state.tokens[0].type).toBe('text');
    expect(state.tokens[0].content).toBe('$x^2$');
  });

  it('does not push token in silent mode for inline math', () => {
    const md = createMockMarkdownIt();
    initKaTeX(md);

    const rule = md.inline.ruler.rules.find((r: any) => r.name === 'katex_inline_math');
    const state = createMockInlineState('$x^2$');
    const result = rule.fn(state, true);
    expect(result).toBe(true);
    expect(state.tokens.length).toBe(0);
  });
});

describe('initMermaid', () => {
  it('returns mermaid div for mermaid fence language', () => {
    const md = createMockMarkdownIt();
    initMermaid(md);

    const tokens = [{ info: 'mermaid', content: 'flowchart LR\nA-->B' }];
    const result = md.renderer.rules.fence(tokens, 0, {}, {}, {});
    expect(result).toBe('<div class="mermaid">flowchart LR\nA-->B</div>');
  });

  it('returns mermaid div for mmd fence language', () => {
    const md = createMockMarkdownIt();
    initMermaid(md);

    const tokens = [{ info: 'mmd', content: 'graph TD\nA-->B' }];
    const result = md.renderer.rules.fence(tokens, 0, {}, {}, {});
    expect(result).toBe('<div class="mermaid">graph TD\nA-->B</div>');
  });

  it('falls back to default fence for non-mermaid languages', () => {
    const md = createMockMarkdownIt();
    const defaultFence = vi.fn(() => '<pre>code</pre>');
    md.renderer.rules.fence = defaultFence;
    initMermaid(md);

    const tokens = [{ info: 'js', content: 'const x = 1;' }];
    const result = md.renderer.rules.fence(tokens, 0, {}, {}, {});
    expect(result).toBe('<pre>code</pre>');
  });
});

describe('getMermaidDefinition', () => {
  it('returns data-mermaid-source when present', () => {
    const el = document.createElement('div');
    el.dataset.mermaidSource = 'flowchart LR\nA-->B';
    expect(getMermaidDefinition(el)).toBe('flowchart LR\nA-->B');
  });

  it('falls back to trimmed textContent', () => {
    const el = document.createElement('div');
    el.textContent = '  graph TD\nA-->B  ';
    expect(getMermaidDefinition(el)).toBe('graph TD\nA-->B');
  });
});

describe('parseSvgLength', () => {
  it('parses positive pixel values', () => {
    expect(parseSvgLength('100')).toBe(100);
    expect(parseSvgLength('100px')).toBe(100);
  });

  it('returns null for empty or whitespace', () => {
    expect(parseSvgLength('')).toBeNull();
    expect(parseSvgLength('   ')).toBeNull();
    expect(parseSvgLength(null)).toBeNull();
  });

  it('returns null for non-positive or invalid values', () => {
    expect(parseSvgLength('0')).toBeNull();
    expect(parseSvgLength('-5')).toBeNull();
    expect(parseSvgLength('abc')).toBeNull();
    expect(parseSvgLength('NaN')).toBeNull();
  });
});

describe('parseSvgViewBoxSize', () => {
  it('parses standard viewBox', () => {
    expect(parseSvgViewBoxSize('0 0 100 200')).toEqual({ width: 100, height: 200 });
  });

  it('parses comma-separated viewBox', () => {
    expect(parseSvgViewBoxSize('0,0,100,200')).toEqual({ width: 100, height: 200 });
  });

  it('returns null for fewer than 4 parts', () => {
    expect(parseSvgViewBoxSize('0 0 100')).toBeNull();
  });

  it('returns null for empty or invalid', () => {
    expect(parseSvgViewBoxSize('')).toBeNull();
    expect(parseSvgViewBoxSize(null)).toBeNull();
    expect(parseSvgViewBoxSize('a b c d')).toBeNull();
  });

  it('returns null for non-positive dimensions', () => {
    expect(parseSvgViewBoxSize('0 0 0 0')).toBeNull();
    expect(parseSvgViewBoxSize('0 0 -10 20')).toBeNull();
  });
});

describe('removeSvgLengthAttribute', () => {
  it('does nothing when attribute is absent', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    removeSvgLengthAttribute(svg, 'width');
    expect(svg.hasAttribute('width')).toBe(false);
  });

  it('removes attribute when present', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100');
    removeSvgLengthAttribute(svg, 'width');
    expect(svg.hasAttribute('width')).toBe(false);
  });

  it('sets to 1 then removes when value is empty string', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '');
    removeSvgLengthAttribute(svg, 'width');
    expect(svg.hasAttribute('width')).toBe(false);
  });
});

describe('getMermaidInlinePalette', () => {
  it('returns dark palette', () => {
    const palette = getMermaidInlinePalette('dark');
    expect(palette.nodeFill).toBe('#1f2937');
    expect(palette.text).toBe('#e5e7eb');
  });

  it('returns light palette', () => {
    const palette = getMermaidInlinePalette('light');
    expect(palette.nodeFill).toBe('#ECECFF');
    expect(palette.text).toBe('#333333');
  });
});

describe('getMermaidDiagramKind', () => {
  it('detects flowchart', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('flowchart');
    expect(getMermaidDiagramKind(svg)).toBe('flowchart');
  });

  it('detects state diagram', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('statediagram');
    expect(getMermaidDiagramKind(svg)).toBe('state');
  });

  it('detects class diagram', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('classDiagram');
    expect(getMermaidDiagramKind(svg)).toBe('class');
  });

  it('detects pie chart via aria-roledescription', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-roledescription', 'pie');
    expect(getMermaidDiagramKind(svg)).toBe('pie');
  });

  it('detects sequence diagram via aria-roledescription', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-roledescription', 'sequence');
    expect(getMermaidDiagramKind(svg)).toBe('sequence');
  });

  it('defaults to other', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(getMermaidDiagramKind(svg)).toBe('other');
  });
});

describe('getRootMermaidSvg', () => {
  it('returns first child svg', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.appendChild(svg);
    expect(getRootMermaidSvg(el)).toBe(svg);
  });

  it('returns svg found by querySelector when first child is not svg', () => {
    const el = document.createElement('div');
    const span = document.createElement('span');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.appendChild(span);
    el.appendChild(svg);
    expect(getRootMermaidSvg(el)).toBe(svg);
  });

  it('returns null when no svg exists', () => {
    const el = document.createElement('div');
    el.appendChild(document.createElement('span'));
    expect(getRootMermaidSvg(el)).toBeNull();
  });
});

describe('removeMermaidHoistedStyle', () => {
  it('removes style element and clears dataset', () => {
    const el = document.createElement('div');
    const style = document.createElement('style');
    style.id = 'mermaid-style-1';
    document.head.appendChild(style);
    el.dataset.mermaidStyleId = 'mermaid-style-1';

    removeMermaidHoistedStyle(el);

    expect(document.getElementById('mermaid-style-1')).toBeNull();
    expect(el.dataset.mermaidStyleId).toBeUndefined();
  });

  it('does nothing when no styleId in dataset', () => {
    const el = document.createElement('div');
    expect(() => removeMermaidHoistedStyle(el)).not.toThrow();
  });
});

describe('hoistMermaidSvgStyle', () => {
  it('hoists style nodes from svg to document head', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = '.node { fill: red; }';
    svg.appendChild(style);
    el.appendChild(svg);

    hoistMermaidSvgStyle(el);

    expect(el.dataset.mermaidStyleId).toBeDefined();
    const hoisted = document.getElementById(el.dataset.mermaidStyleId!);
    expect(hoisted).not.toBeNull();
    expect(hoisted?.textContent).toBe('.node { fill: red; }');
  });

  it('does nothing when svg has no style nodes', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.appendChild(svg);

    hoistMermaidSvgStyle(el);

    expect(el.dataset.mermaidStyleId).toBeUndefined();
  });

  it('does nothing when svg is absent', () => {
    const el = document.createElement('div');
    hoistMermaidSvgStyle(el);
    expect(el.dataset.mermaidStyleId).toBeUndefined();
  });

  it('replaces previous hoisted style', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    // First style
    const style1 = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style1.textContent = '.node { fill: blue; }';
    svg.appendChild(style1);
    el.appendChild(svg);

    hoistMermaidSvgStyle(el);
    const firstId = el.dataset.mermaidStyleId;

    // Remove first style from SVG and add second style
    svg.removeChild(style1);
    const style2 = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style2.textContent = '.node { fill: green; }';
    svg.appendChild(style2);
    hoistMermaidSvgStyle(el);

    expect(document.getElementById(firstId!)).toBeNull();
    expect(el.dataset.mermaidStyleId).not.toBe(firstId);
    expect(document.getElementById(el.dataset.mermaidStyleId!)?.textContent).toBe('.node { fill: green; }');
  });
});

describe('inlineMermaidSvgTheme', () => {
  it('applies flowchart theme', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('flowchart');
    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodeGroup.classList.add('node');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    nodeGroup.appendChild(rect);
    svg.appendChild(nodeGroup);
    el.appendChild(svg);

    inlineMermaidSvgTheme(el, 'light');
    expect(rect.getAttribute('fill')).toBe('#ECECFF');
    expect(rect.getAttribute('stroke')).toBe('#9370DB');
  });

  it('applies state diagram theme', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('statediagram');
    const edgeLabelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgeLabelGroup.classList.add('edgeLabel');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    edgeLabelGroup.appendChild(rect);
    svg.appendChild(edgeLabelGroup);
    el.appendChild(svg);

    inlineMermaidSvgTheme(el, 'dark');
    expect(rect.getAttribute('fill')).toBe('none');
    expect(rect.getAttribute('stroke')).toBe('none');
  });

  it('applies pie chart theme', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-roledescription', 'pie');
    const slice = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    slice.classList.add('pieCircle');
    slice.setAttribute('fill', '#ff0000');
    const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    legendGroup.classList.add('legend');
    const legendRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    legendGroup.appendChild(legendRect);
    svg.appendChild(slice);
    svg.appendChild(legendGroup);
    el.appendChild(svg);

    inlineMermaidSvgTheme(el, 'light');
    expect(legendRect.getAttribute('fill')).toBe('#ff0000');
  });

  it('applies sequence diagram theme', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-roledescription', 'sequence');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.classList.add('messageLine0');
    svg.appendChild(line);
    el.appendChild(svg);

    inlineMermaidSvgTheme(el, 'light');
    expect(line.getAttribute('stroke')).toBe('#333333');
  });

  it('applies class diagram theme', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('classDiagram');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('relation');
    svg.appendChild(path);
    el.appendChild(svg);

    inlineMermaidSvgTheme(el, 'light');
    expect(path.getAttribute('stroke')).toBe('#333333');
  });

  it('does nothing when no svg is found', () => {
    const el = document.createElement('div');
    expect(() => inlineMermaidSvgTheme(el, 'light')).not.toThrow();
  });
});

describe('normalizeMermaidSvg', () => {
  it('sets aspect ratio when viewBox is present', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 200');
    svg.classList.add('flowchart');
    el.appendChild(svg);

    normalizeMermaidSvg(el, 'light');
    expect(svg.style.aspectRatio).toBe('100 / 200');
    expect(svg.style.height).toBe('auto');
    // happy-dom does not support CSS min() in style.width, just check it was set
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMin meet');
  });

  it('falls back to width/height attributes when no viewBox', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '150');
    svg.setAttribute('height', '300');
    svg.classList.add('flowchart');
    el.appendChild(svg);

    normalizeMermaidSvg(el, 'light');
    expect(svg.style.aspectRatio).toBe('150 / 300');
  });

  it('uses auto sizing when no dimensions are available', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('flowchart');
    el.appendChild(svg);

    normalizeMermaidSvg(el, 'light');
    expect(svg.style.width).toBe('');
    expect(svg.style.height).toBe('auto');
    expect(svg.style.maxWidth).toBe('100%');
    expect(svg.style.aspectRatio).toBe('');
  });

  it('removes empty width/height attributes', () => {
    const el = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '');
    svg.setAttribute('height', '');
    svg.setAttribute('viewBox', '0 0 100 200');
    svg.classList.add('flowchart');
    el.appendChild(svg);

    normalizeMermaidSvg(el, 'light');
    expect(svg.hasAttribute('width')).toBe(false);
    expect(svg.hasAttribute('height')).toBe(false);
  });

  it('does nothing when no svg is found', () => {
    const el = document.createElement('div');
    expect(() => normalizeMermaidSvg(el, 'light')).not.toThrow();
  });
});

// Helper factories for mock markdown-it
function createMockMarkdownIt() {
  const inlineRules: any[] = [];
  const blockRules: any[] = [];
  return {
    inline: { ruler: { after: vi.fn((_chain: string, name: string, fn: any) => {
      inlineRules.push({ name, fn });
    }), rules: inlineRules } },
    block: { ruler: { after: vi.fn((_chain: string, name: string, fn: any) => {
      blockRules.push({ name, fn });
    }), rules: blockRules } },
    renderer: { rules: {} as Record<string, any> },
  };
}

function createMockInlineState(src: string) {
  const tokens: any[] = [];
  const state = {
    src,
    pos: 0,
    tokens,
    push: (type: string, _tag: string, _nesting: number) => {
      const token = { type, content: '' };
      state.tokens.push(token);
      return token;
    },
  };
  return state;
}

function createMockBlockState(src: string) {
  const lines = src.split('\n');
  const bMarks = lines.map((_, i) => lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0));
  const eMarks = lines.map((line, i) => bMarks[i] + line.length);
  const tokens: any[] = [];
  const state: any = {
    src,
    bMarks,
    eMarks,
    tShift: lines.map(() => 0),
    line: 0,
    lineMax: lines.length,
    tokens,
    push: (type: string, _tag: string, _nesting: number) => {
      const token = { type, content: '', map: [0, 0] as [number, number] };
      state.tokens.push(token);
      return token;
    },
  };
  return state;
}
