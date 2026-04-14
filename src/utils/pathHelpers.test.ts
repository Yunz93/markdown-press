import { describe, it, expect } from 'vitest';
import {
  getPathSeparator,
  joinFsPath,
  normalizeSlashes,
  sanitizeResourceFolder,
  getPathBasename,
} from './pathHelpers';

describe('getPathSeparator', () => {
  it('returns backslash for Windows paths', () => {
    expect(getPathSeparator('C:\\Users\\test')).toBe('\\');
  });

  it('returns forward slash for Unix paths', () => {
    expect(getPathSeparator('/home/user/test')).toBe('/');
  });

  it('returns forward slash for bare filenames', () => {
    expect(getPathSeparator('file.txt')).toBe('/');
  });
});

describe('joinFsPath', () => {
  it('joins Unix paths', () => {
    expect(joinFsPath('/home/user', 'docs', 'file.md')).toBe('/home/user/docs/file.md');
  });

  it('joins Windows paths', () => {
    expect(joinFsPath('C:\\Users\\test', 'docs')).toBe('C:\\Users\\test\\docs');
  });

  it('handles trailing separator', () => {
    expect(joinFsPath('/home/user/', 'file.md')).toBe('/home/user/file.md');
  });

  it('skips empty segments', () => {
    expect(joinFsPath('/home', '', 'file.md')).toBe('/home/file.md');
  });
});

describe('normalizeSlashes', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeSlashes('C:\\Users\\test')).toBe('C:/Users/test');
  });

  it('strips trailing slashes', () => {
    expect(normalizeSlashes('/home/user/')).toBe('/home/user');
    expect(normalizeSlashes('/home/user///')).toBe('/home/user');
  });

  it('handles already normalized paths', () => {
    expect(normalizeSlashes('/home/user/file.md')).toBe('/home/user/file.md');
  });
});

describe('sanitizeResourceFolder', () => {
  it('trims whitespace and normalizes slashes', () => {
    expect(sanitizeResourceFolder('  resources  ')).toBe('resources');
    expect(sanitizeResourceFolder('path\\to\\folder')).toBe('path/to/folder');
  });

  it('strips leading/trailing slashes', () => {
    expect(sanitizeResourceFolder('/resources/')).toBe('resources');
    expect(sanitizeResourceFolder('///resources///')).toBe('resources');
  });

  it('strips leading ./', () => {
    expect(sanitizeResourceFolder('./resources')).toBe('resources');
  });

  it('throws on path traversal with ..', () => {
    expect(() => sanitizeResourceFolder('../etc')).toThrow('Path traversal');
    expect(() => sanitizeResourceFolder('resources/../etc')).toThrow('Path traversal');
    expect(() => sanitizeResourceFolder('foo/../../etc')).toThrow('Path traversal');
  });

  it('allows dots in folder names that are not traversal', () => {
    expect(sanitizeResourceFolder('.hidden')).toBe('.hidden');
    expect(sanitizeResourceFolder('my.resources')).toBe('my.resources');
  });
});

describe('getPathBasename', () => {
  it('extracts basename from Unix path', () => {
    expect(getPathBasename('/home/user/file.md')).toBe('file.md');
  });

  it('extracts basename from Windows path', () => {
    expect(getPathBasename('C:\\Users\\test\\file.md')).toBe('file.md');
  });

  it('handles bare filename', () => {
    expect(getPathBasename('file.md')).toBe('file.md');
  });

  it('returns path itself for empty result', () => {
    expect(getPathBasename('')).toBe('');
  });
});
