import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import type { StateCommand } from '@codemirror/state';
import { createHandleSmartShiftTab, createHandleSmartTab, handleSmartEnter } from './input';
import { handleListTab } from '../nestedListCommands';

function applyCommand(cmd: StateCommand, doc: string, anchor: number, head: number): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
  });
  let next = state;
  cmd({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  return next;
}

describe('createHandleSmartTab selection', () => {
  const tab = createHandleSmartTab('strict');

  it('indents each covered line when a paragraph selection is non-empty', () => {
    const next = applyCommand(tab, 'aa\nbb\ncc', 0, 8);
    expect(next.doc.toString()).toBe('    aa\n    bb\n    cc');
  });

  it('indents the full line when only part of a line is selected', () => {
    const next = applyCommand(tab, 'hello world', 0, 5);
    expect(next.doc.toString()).toBe('    hello world');
  });

  it('indents an ordered list item consistently from before and after the marker', () => {
    const beforeMarker = applyCommand(tab, '1. parent\n2. item', 10, 10);
    const afterMarker = applyCommand(tab, '1. parent\n2. item', 13, 13);

    expect(beforeMarker.doc.toString()).toBe('1. parent\n    1. item');
    expect(afterMarker.doc.toString()).toBe('1. parent\n    1. item');
    expect(beforeMarker.selection.main.from).toBe(17);
    expect(afterMarker.selection.main.from).toBe(17);
  });

  it('keeps the cursor content-relative when indenting an ordered list item', () => {
    const next = applyCommand(tab, '1. parent\n10. item', 15, 15);

    expect(next.doc.toString()).toBe('1. parent\n    1. item');
    expect(next.selection.main.from).toBe(18);
  });

  it('uses marker-width-aware child indentation for wider ordered parents', () => {
    const looseTab = createHandleSmartTab('loose');
    const twoDigitParent = applyCommand(looseTab, '10. parent\n11. child', 11, 11);
    const threeDigitParent = applyCommand(looseTab, '100. parent\n101. child', 12, 12);

    expect(twoDigitParent.doc.toString()).toBe('10. parent\n    1. child');
    expect(threeDigitParent.doc.toString()).toBe('100. parent\n     1. child');
  });

  it('uses the decimal parent marker style when indenting a stale alphabetic empty item', () => {
    const doc = '1. 服务化\na. \n3. 可靠性';
    const cursorAfterMarker = '1. 服务化\na. '.length;
    const next = applyCommand(tab, doc, cursorAfterMarker, cursorAfterMarker);

    expect(next.doc.toString()).toBe('1. 服务化\n    1. \n2. 可靠性');
  });

  it('renumbers ordered siblings in the same tab command', () => {
    const next = applyCommand(tab, '1. one\n2. two\n3. three', 7, 7);

    expect(next.doc.toString()).toBe('1. one\n    1. two\n2. three');
  });

  it('indents mixed selections line by line instead of nesting later list items', () => {
    const next = applyCommand(tab, '- A\nB\n- C', 0, 9);
    expect(next.doc.toString()).toBe('    - A\n    B\n    - C');
  });

  it('after a nested ordered item, Tab nests a top-level sibling under the nearest shallower item', () => {
    const doc = '1. 基础：算力付费；\n2. 进阶：可靠性保障 SLA 付费；\n   1. 测试\n3. ';
    const pos = doc.length;
    const next = applyCommand(tab, doc, pos, pos);
    expect(next.doc.toString().split('\n').pop()).toBe('    1. ');
    // 误把「上一行」子列表当父级时会出现 7 格缩进
    expect(next.doc.toString()).not.toMatch(/\n {7}1\. /);
  });
});

describe('createHandleSmartShiftTab selection', () => {
  const shiftTab = createHandleSmartShiftTab('strict');

  it('outdents an ordered list item consistently from before and after the marker', () => {
    const beforeMarker = applyCommand(shiftTab, '  1. item', 2, 2);
    const afterMarker = applyCommand(shiftTab, '  1. item', 5, 5);

    expect(beforeMarker.doc.toString()).toBe('1. item');
    expect(afterMarker.doc.toString()).toBe('1. item');
    expect(beforeMarker.selection.main.from).toBe(3);
    expect(afterMarker.selection.main.from).toBe(3);
  });

  it('removes the marker from level-0 list items', () => {
    expect(applyCommand(shiftTab, '- item', 2, 2).doc.toString()).toBe('item');
    expect(applyCommand(shiftTab, '1. item', 3, 3).doc.toString()).toBe('item');
    expect(applyCommand(shiftTab, '- [ ] item', 6, 6).doc.toString()).toBe('item');
  });

  it('outdents mixed selections line by line and unlists level-0 items', () => {
    const next = applyCommand(shiftTab, '- A\nB\n- C', 0, 9);
    expect(next.doc.toString()).toBe('A\nB\nC');
  });

  it('keeps loose Shift-Tab numbering aligned with Enter when outdenting an empty ordered child', () => {
    const looseShiftTab = createHandleSmartShiftTab('loose');
    const doc = '1. 前项\n2. 数据的安全性；\n    1. 专属算力模式；\n    2. ';
    const next = applyCommand(looseShiftTab, doc, doc.length, doc.length);
    const enterNext = applyCommand(handleSmartEnter, doc, doc.length, doc.length);

    expect(next.doc.toString()).toBe('1. 前项\n2. 数据的安全性；\n    1. 专属算力模式；\n3. ');
    expect(next.doc.toString()).toBe(enterNext.doc.toString());
  });
});

describe('handleListTab selection fallback', () => {
  it('indents each line when there is a selection but no parsed list items', () => {
    const next = applyCommand(handleListTab({ strictMode: true }), 'aa\nbb', 0, 5);
    expect(next.doc.toString()).toBe('    aa\n    bb');
  });
});

describe('handleSmartEnter ordered list continuation', () => {
  it('inserts the next sibling number after a tab-indented continuation line', () => {
    const doc = '1. first\n\tcontinuation';
    const cursorAtEnd = doc.length;
    const next = applyCommand(handleSmartEnter, doc, cursorAtEnd, cursorAtEnd);
    expect(next.doc.toString()).toBe('1. first\n\tcontinuation\n2. ');
  });
});

describe('handleSmartEnter empty nested list items', () => {
  it('keeps the cursor after the marker when outdenting an empty ordered item', () => {
    const doc = '1. test\n   1. test\n   2. ';
    const next = applyCommand(handleSmartEnter, doc, doc.length, doc.length);

    expect(next.doc.toString()).toBe('1. test\n   1. test\n2. ');
    expect(next.selection.main.from).toBe('1. test\n   1. test\n2. '.length);
  });
});
