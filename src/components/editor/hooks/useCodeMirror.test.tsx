/** @vitest-environment happy-dom */

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { useCodeMirror } from './useCodeMirror';

function Harness(props: {
  content: string;
  placeholder: string;
  themeMode?: 'light' | 'dark';
}) {
  const cm = useCodeMirror({
    content: props.content,
    documentKey: 'file-1',
    placeholder: props.placeholder,
    themeMode: props.themeMode ?? 'light',
    onChange: () => {},
  });

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
});

