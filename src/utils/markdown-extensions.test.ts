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

import { getKatexRenderMode, renderMermaidDiagrams, resetMermaidPlaceholders } from './markdown-extensions';

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
    run.mockImplementation(async ({ nodes }: { nodes: HTMLElement[] }) => {
      nodes.forEach((node) => {
        node.innerHTML = '<svg width="" height="" viewBox="0 0 120 60"><text>ok</text></svg>';
      });
    });
    const container = document.createElement('div');
    const el = createVisibleMermaidHost('flowchart LR\nA-->B');
    container.appendChild(el);

    await renderMermaidDiagrams(container, { themeMode: 'light' });

    const svg = el.querySelector('svg') as SVGSVGElement | null;
    expect(svg).not.toBeNull();
    expect(svg?.hasAttribute('width')).toBe(false);
    expect(svg?.hasAttribute('height')).toBe(false);
    expect(svg?.style.aspectRatio).toBe('120 / 60');
    expect(el.dataset.mermaidRendered).toBe('true');
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
  it('enables MathML fallback for production Tauri-like surfaces', () => {
    expect(getKatexRenderMode({
      isProd: true,
      isTauri: true,
      protocol: 'tauri:',
    })).toBe('mathml');
  });

  it('does not enable MathML fallback for non-Tauri web builds', () => {
    expect(getKatexRenderMode({
      isProd: true,
      isTauri: false,
      protocol: 'https:',
    })).toBeNull();
  });
});
