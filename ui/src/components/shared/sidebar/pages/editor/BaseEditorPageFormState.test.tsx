import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawerContext } from '@omniviewdev/runtime';
import type { KubernetesResourceObject } from '../../../../../types/resource';
import { setManifestMode } from '../../../../kubernetes/manifest/useManifestMode';
import BaseEditorPage from './BaseEditorPage';

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@omniviewdev/runtime', () => ({
  useResourceMutations: () => ({ mutate: mocks.mutate }),
  useResourceEditorModelPath: () => undefined,
  useResourceTypes: () => ({ resourceTypes: { data: [{ type: 'k8s:/configmaps', capabilities: [{ operation: 'mutationUpdate', scope: [] }] }] } }),
  jsonToValue: (value: unknown) => value,
  valueToJSON: (value: unknown) => value,
  parseAppError: () => ({ detail: 'Update failed.' }),
}));
vi.mock('../../../CodeEditor', () => ({ default: () => <div aria-label="YAML preview" /> }));

const original = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'config', namespace: 'team', uid: 'native-uid' }, data: { existing: 'original' } };
function context(data = original, revision = 'revision-1'): DrawerContext<KubernetesResourceObject> {
  return { data, resource: {
    pluginID: 'kubernetes', targetId: 'host-target', key: 'host-key', route: { connection: 'cluster' }, representation: 'native-v1',
    reference: { address: { provider: 'kubernetes', authority: 'host-authority', type: 'k8s:/configmaps', scope: [{ dimension: 'namespace', value: 'team' }], id: 'config' }, incarnation: 'native-uid' },
    record: { record: { sourceRevision: revision } },
  } } as unknown as DrawerContext<KubernetesResourceObject>;
}
const refreshed = { ...original, data: { existing: 'server' } };
function entries() {
  const button = screen.getByRole('button', { name: 'Entries', exact: true });
  fireEvent.pointerDown(button);
  fireEvent.click(button);
}
beforeEach(() => { setManifestMode('form'); mocks.mutate.mockReset(); });
afterEach(cleanup);

describe('real editor passive snapshot safety', () => {
  it('preserves pending keys, section, validity, and original concurrency baseline during refresh', async () => {
    const ctx = context();
    const view = render(<BaseEditorPage ctx={ctx} />);
    entries();
    const key = screen.getByLabelText('New entry key');
    fireEvent.focus(key);
    fireEvent.change(key, { target: { value: 'pending' } });
    view.rerender(<BaseEditorPage ctx={context(refreshed, 'revision-2')} />);
    expect(screen.getByLabelText('New entry key')).toHaveValue('pending');
    expect(screen.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show Diff' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add text entry' }));
    mocks.mutate.mockResolvedValue({ body: { ...original, data: { ...original.data, pending: '' } }, sourceRevision: 'revision-3' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit', exact: true }));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ reference: ctx.resource!.reference, expectedRevision: 'revision-1', input: { ...original, data: { ...original.data, pending: '' } } }));
    await waitFor(() => expect(screen.queryByLabelText('New entry key')).toBeNull());
    view.rerender(<BaseEditorPage ctx={context(refreshed, 'revision-4')} />);
    entries();
    expect(screen.getByLabelText('Value')).toHaveValue('server');
  });

  it('freezes unchanged source after interaction even without a validity error; Reset admits later refreshes', () => {
    const view = render(<BaseEditorPage ctx={context()} />);
    const section = screen.getByRole('button', { name: 'Entries', exact: true });
    fireEvent.focus(section);
    fireEvent.click(section);
    view.rerender(<BaseEditorPage ctx={context(refreshed, 'revision-2')} />);
    expect(screen.getByLabelText('Value')).toHaveValue('original');
    expect(screen.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('New entry key'), { target: { value: 'pending' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset', exact: true }));
    view.rerender(<BaseEditorPage ctx={context(refreshed, 'revision-3')} />);
    entries();
    expect(screen.getByLabelText('New entry key')).toHaveValue('');
    expect(screen.getByLabelText('Value')).toHaveValue('server');
  });

  it('adopts untouched refresh without remounting editor controls', () => {
    const view = render(<BaseEditorPage ctx={context()} />);
    const section = screen.getByRole('button', { name: 'Entries', exact: true });
    view.rerender(<BaseEditorPage ctx={context(refreshed, 'revision-2')} />);
    expect(screen.getByRole('button', { name: 'Entries', exact: true })).toBe(section);
    entries();
    expect(screen.getByLabelText('Value')).toHaveValue('server');
  });
});
