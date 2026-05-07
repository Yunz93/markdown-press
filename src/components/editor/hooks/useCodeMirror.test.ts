import { describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { getEditorTooltipSpace } from './useCodeMirror';

describe('getEditorTooltipSpace', () => {
  it('uses the editor DOM rectangle instead of the viewport for tooltip layout', () => {
    const view = {
      dom: {
        getBoundingClientRect: () => ({
          left: 120,
          right: 620,
          top: 40,
          bottom: 760,
          width: 500,
          height: 720,
          x: 120,
          y: 40,
          toJSON: () => ({}),
        }),
      },
    } as Pick<EditorView, 'dom'>;

    expect(getEditorTooltipSpace(view)).toEqual({
      left: 120,
      right: 620,
      top: 40,
      bottom: 760,
    });
  });
});
