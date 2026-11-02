import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateResourceModal from './CreateResourceModal';

vi.mock('../../../shared/CodeEditor', () => ({ default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <textarea aria-label="Manifest" value={value} onChange={(event) => onChange(event.target.value)} />
) }));

const template = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: pod\n  namespace: team\nspec:\n  containers:\n    - name: main\n      image: nginx:1.27\n  exact: 9007199254740993\n';
const props = { open: true, resourceKey: 'k8s:/pods', resourceName: 'Pod', template };

beforeEach(() => localStorage.clear());

describe('canonical create modal lifetime', () => {
  it('passes the original manifest without narrowing large integers', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<CreateResourceModal {...props} onCreate={onCreate} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(template, expect.any(Function)));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('does not close a reopened draft when an old create finishes', async () => {
    const pending = Promise.withResolvers<void>();
    const onCreate = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    const view = render(<CreateResourceModal {...props} onCreate={onCreate} onClose={onClose} />);
    fireEvent.click(screen.getByRole('radio', { name: 'YAML' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    view.rerender(<CreateResourceModal {...props} open={false} onCreate={onCreate} onClose={onClose} />);
    view.rerender(<CreateResourceModal {...props} onCreate={onCreate} onClose={onClose} />);
    await act(async () => { pending.resolve(); await pending.promise; });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Manifest' })).toHaveProperty('value', template));
    expect(onClose).not.toHaveBeenCalled();
  });
});
