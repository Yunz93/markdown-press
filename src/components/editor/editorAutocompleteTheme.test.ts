import { describe, expect, it } from 'vitest';
import {
  autocompletePanelListStyle,
  autocompletePanelShellStyle,
} from './editorAutocompleteTheme';

describe('editorAutocompletePanelBaseTheme', () => {
  it('clips release autocomplete rows inside the rounded shell', () => {
    expect(autocompletePanelShellStyle.overflow).toBe('hidden');
    expect(autocompletePanelListStyle.height).toBe('100%');
    expect(autocompletePanelListStyle.overflowX).toBe('hidden');
    expect(autocompletePanelListStyle.overflowY).toBe('auto');
    expect(autocompletePanelListStyle.overscrollBehavior).toBe('contain');
  });
});
