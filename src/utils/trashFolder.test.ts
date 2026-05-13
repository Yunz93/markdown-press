import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TRASH_FOLDER,
  sanitizeTrashFolder,
  normalizeTrashFolder,
  isTrashRootName,
  getTrashDepth,
} from './trashFolder';

describe('DEFAULT_TRASH_FOLDER', () => {
  it('is .trash', () => {
    expect(DEFAULT_TRASH_FOLDER).toBe('.trash');
  });
});

describe('sanitizeTrashFolder', () => {
  it('returns default for null', () => {
    expect(sanitizeTrashFolder(null)).toBe('.trash');
  });

  it('returns default for undefined', () => {
    expect(sanitizeTrashFolder(undefined)).toBe('.trash');
  });

  it('returns default for empty string', () => {
    expect(sanitizeTrashFolder('')).toBe('.trash');
  });

  it('returns default for whitespace-only string', () => {
    expect(sanitizeTrashFolder('   ')).toBe('.trash');
  });

  it('trims whitespace', () => {
    expect(sanitizeTrashFolder('  .trash  ')).toBe('.trash');
  });

  it('converts backslashes to forward slashes', () => {
    expect(sanitizeTrashFolder('path\\to\\.trash')).toBe('.trash');
  });

  it('strips leading and trailing slashes', () => {
    expect(sanitizeTrashFolder('/.trash/')).toBe('.trash');
    expect(sanitizeTrashFolder('///.trash///')).toBe('.trash');
  });

  it('returns last segment for multi-segment path', () => {
    expect(sanitizeTrashFolder('a/b/c/.trash')).toBe('.trash');
  });

  it('returns single segment as-is', () => {
    expect(sanitizeTrashFolder('custom-trash')).toBe('custom-trash');
  });

  it('handles path with dots', () => {
    expect(sanitizeTrashFolder('.hidden')).toBe('.hidden');
  });
});

describe('normalizeTrashFolder', () => {
  it('returns default for non-string values', () => {
    expect(normalizeTrashFolder(null)).toBe('.trash');
    expect(normalizeTrashFolder(undefined)).toBe('.trash');
    expect(normalizeTrashFolder(123)).toBe('.trash');
    expect(normalizeTrashFolder(true)).toBe('.trash');
    expect(normalizeTrashFolder({})).toBe('.trash');
    expect(normalizeTrashFolder([])).toBe('.trash');
  });

  it('sanitizes string values', () => {
    expect(normalizeTrashFolder('  .trash  ')).toBe('.trash');
    expect(normalizeTrashFolder('a/b/.trash')).toBe('.trash');
  });

  it('returns default for empty string', () => {
    expect(normalizeTrashFolder('')).toBe('.trash');
  });
});

describe('isTrashRootName', () => {
  it('returns true for exact match', () => {
    expect(isTrashRootName('.trash', '.trash')).toBe(true);
  });

  it('returns false for non-match', () => {
    expect(isTrashRootName('notes', '.trash')).toBe(false);
  });

  it('sanitizes trashFolder parameter before comparing', () => {
    expect(isTrashRootName('.trash', '  /.trash/  ')).toBe(true);
    expect(isTrashRootName('.trash', 'a/b/.trash')).toBe(true);
  });

  it('returns false when sanitized values differ', () => {
    expect(isTrashRootName('.trash', 'custom')).toBe(false);
  });
});

describe('getTrashDepth', () => {
  it('returns -1 when trash folder is not in path', () => {
    expect(getTrashDepth('notes/file.md', '.trash')).toBe(-1);
  });

  it('returns 0 for root trash path', () => {
    expect(getTrashDepth('.trash', '.trash')).toBe(0);
  });

  it('returns 1 for file directly in trash', () => {
    expect(getTrashDepth('.trash/file.md', '.trash')).toBe(1);
  });

  it('returns 2 for one level deep in trash', () => {
    expect(getTrashDepth('.trash/sub/file.md', '.trash')).toBe(2);
  });

  it('returns 3 for two levels deep in trash', () => {
    expect(getTrashDepth('.trash/a/b/file.md', '.trash')).toBe(3);
  });

  it('handles Windows backslashes', () => {
    expect(getTrashDepth('.trash\\sub\\file.md', '.trash')).toBe(2);
  });

  it('handles mixed separators', () => {
    expect(getTrashDepth('.trash/sub\\file.md', '.trash')).toBe(2);
  });

  it('finds last occurrence of trash folder', () => {
    expect(getTrashDepth('notes/.trash/.trash/file.md', '.trash')).toBe(1);
  });

  it('returns -1 when trash folder is only a partial match', () => {
    expect(getTrashDepth('.trash-old/file.md', '.trash')).toBe(-1);
  });

  it('handles path with leading slash', () => {
    expect(getTrashDepth('/.trash/file.md', '.trash')).toBe(1);
  });

  it('sanitizes trashFolder parameter', () => {
    expect(getTrashDepth('.trash/file.md', '  /.trash/  ')).toBe(1);
  });

  it('handles empty path', () => {
    expect(getTrashDepth('', '.trash')).toBe(-1);
  });
});
