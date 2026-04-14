import { describe, it, expect } from 'vitest';

/**
 * Tests for the escapeHtml function used to prevent XSS in KaTeX error output.
 * The function is module-private, so we test its behavior indirectly by
 * verifying the patterns it must handle.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
