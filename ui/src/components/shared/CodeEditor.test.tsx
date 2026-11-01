import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CodeEditor from './CodeEditor';

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
  useMonaco: () => null,
  DiffEditor: ({ originalModelPath, modifiedModelPath }: { originalModelPath?: string; modifiedModelPath?: string }) => (
    <div data-testid="diff" data-original={originalModelPath} data-modified={modifiedModelPath} />
  ),
}));

describe('CodeEditor diff models', () => {
  it('uses distinct schema-associated paths in the supplied directory', () => {
    render(<CodeEditor filename="draft.yaml" path="file:///catalog/pods/draft.yaml" language="yaml" value="modified" original="original" diff />);
    const diff = screen.getByTestId('diff');
    const original = diff.getAttribute('data-original');
    const modified = diff.getAttribute('data-modified');
    expect(original).toMatch(/^file:\/\/\/catalog\/pods\/original-.*-draft\.yaml$/);
    expect(modified).toMatch(/^file:\/\/\/catalog\/pods\/modified-.*-draft\.yaml$/);
    expect(original).not.toBe(modified);
  });
});
