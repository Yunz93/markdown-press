/** @vitest-environment happy-dom */

import React, { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { useCodeMirror } from './useCodeMirror';
import type { EditorView } from '@codemirror/view';

function Harness(props: {
  content: string;
  placeholder: string;
  documentKey?: string;
  themeMode?: 'light' | 'dark';
  onChange?: (content: string) => void;
  onView?: (view: EditorView | null) => void;
}) {
  const cm = useCodeMirror({
    content: props.content,
    documentKey: props.documentKey ?? 'file-1',
    placeholder: props.placeholder,
    themeMode: props.themeMode ?? 'light',
    onChange: props.onChange ?? (() => {}),
  });

  useEffect(() => {
    props.onView?.(cm.view);
  }, [cm.view, props]);

  return <div ref={cm.editorRef} />;
}

describe('useCodeMirror', () => {
  it('does not wipe document when placeholder changes after content loads', async () => {
    const { container, rerender } = render(<Harness content="" placeholder="a" />);

    await act(async () => {
      rerender(<Harness content="hello" placeholder="a" />);
    });
    await waitFor(() => expect(container.querySelector('.cm-content')?.textContent ?? '').toContain('hello'));

    await act(async () => {
      rerender(<Harness content="hello" placeholder="b" />);
    });
    await waitFor(() => expect(container.querySelector('.cm-content')?.textContent ?? '').toContain('hello'));
  });

  it('does not wipe document when theme mode toggles', async () => {
    const { container, rerender } = render(<Harness content="" placeholder="x" themeMode="light" />);

    await act(async () => {
      rerender(<Harness content="hello" placeholder="x" themeMode="light" />);
    });
    await waitFor(() => expect(container.querySelector('.cm-content')?.textContent ?? '').toContain('hello'));

    await act(async () => {
      rerender(<Harness content="hello" placeholder="x" themeMode="dark" />);
    });
    await waitFor(() => expect(container.querySelector('.cm-content')?.textContent ?? '').toContain('hello'));
  });

  it('flushes pending large-file edits before switching to a new document', async () => {
    const largeContent = `${Array.from({ length: 5001 }, () => 'line').join('\n')}\n`;
    const nextContent = 'next document';
    const firstOnChange = vi.fn();
    const secondOnChange = vi.fn();
    let view: EditorView | null = null;

    const { rerender } = render(
      <Harness
        content={largeContent}
        documentKey="file-1"
        placeholder="x"
        onChange={firstOnChange}
        onView={(instance) => {
          view = instance;
        }}
      />
    );

    await waitFor(() => expect(view).not.toBeNull());

    act(() => {
      view!.dispatch({
        changes: { from: view!.state.doc.length, insert: '!' },
      });
    });

    act(() => {
      rerender(
        <Harness
          content={nextContent}
          documentKey="file-2"
          placeholder="x"
          onChange={secondOnChange}
          onView={(instance) => {
            view = instance;
          }}
        />
      );
    });

    await waitFor(() => expect(firstOnChange).toHaveBeenCalledTimes(1));
    expect(firstOnChange).toHaveBeenCalledWith(`${largeContent}!`, { skipHistory: true });
    expect(secondOnChange).not.toHaveBeenCalled();
  });
});
