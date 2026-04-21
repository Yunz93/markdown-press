import { describe, expect, it } from 'vitest';
import { getShortcutCandidates } from './useKeyboardShortcuts';

describe('getShortcutCandidates', () => {
  it('keeps the configured shortcut first for non-aliased actions', () => {
    expect(getShortcutCandidates('save', 'Cmd+S')).toEqual(['Cmd+S']);
  });

  it('adds stable fallback aliases for opening settings', () => {
    expect(getShortcutCandidates('settings', 'Cmd+0')).toEqual([
      'Cmd+0',
      'Ctrl+0',
      'Cmd+,',
      'Ctrl+,',
      'Command+,',
      'Meta+,',
    ]);
  });

  it('deduplicates configured values that already overlap with aliases', () => {
    expect(getShortcutCandidates('settings', 'Cmd+,')).toEqual([
      'Cmd+,',
      'Cmd+0',
      'Ctrl+0',
      'Ctrl+,',
      'Command+,',
      'Meta+,',
    ]);
  });
});
