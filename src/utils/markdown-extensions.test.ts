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

import { renderMermaidDiagrams, resetMermaidPlaceholders } from './markdown-extensions';

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
});
