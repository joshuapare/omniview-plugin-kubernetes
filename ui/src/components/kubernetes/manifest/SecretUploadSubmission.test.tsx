import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawerContext, ResourceEditorContext } from '@omniviewdev/runtime';
import BaseEditorPage from '../../shared/sidebar/pages/editor/BaseEditorPage';
import type { KubernetesResourceObject } from '../../../types/resource';
import { setManifestMode } from './useManifestMode';

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@omniviewdev/runtime', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  useResourceMutations: () => ({ mutate: mocks.mutate }),
  useResourceEditorModelPath: () => undefined,
  useResourceTypes: () => ({ resourceTypes: { data: [{ type: 'k8s:/secrets', identityDimensions: [{ name: 'namespace' }], representations: [{ id: 'kubernetes.object.v1/v1', schema: { state: 'absent' } }], capabilities: [{ operation: 'mutationUpdate', scope: [] }] }] } }),
  jsonToValue: (value: unknown) => value,
  valueToJSON: (value: unknown) => value,
  parseAppError: () => ({ detail: 'Update failed.' }),
}));
vi.mock('../../shared/CodeEditor', () => ({ default: () => <div aria-label="Read-only YAML preview" /> }));
vi.mock('./useEditorEvidence', () => ({ useEditorEvidence: (context: ResourceEditorContext) => context }));

const original = { apiVersion: 'v1', kind: 'Secret', metadata: { name: 'credentials', namespace: 'team', uid: 'native-uid' }, type: 'kubernetes.io/tls', data: { 'tls.crt': 'b2xk', 'tls.key': 'a2V5' } };
function context(): DrawerContext<KubernetesResourceObject> {
  return { data: original, resource: {
    pluginID: 'kubernetes', targetId: 'host-target', key: 'host-key', route: { connection: 'cluster' }, representation: 'native-v1',
    reference: { address: { provider: 'kubernetes', authority: 'host-authority', type: 'k8s:/secrets', scope: [{ dimension: 'namespace', value: 'team' }], id: 'credentials' }, incarnation: 'native-uid' },
    record: { record: { sourceRevision: 'revision-1' } },
  } } as unknown as DrawerContext<KubernetesResourceObject>;
}
function selectFile(label: string, read: Promise<ArrayBuffer>) {
  const file = new File([], 'replacement.pem');
  Object.defineProperty(file, 'arrayBuffer', { value: () => read });
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}
beforeEach(() => { setManifestMode('form'); mocks.mutate.mockReset(); mocks.mutate.mockReturnValue(Promise.withResolvers<unknown>().promise); });
afterEach(cleanup);

describe('Secret upload submission safety', () => {
  it('blocks the real edit consumer and mode switching until the newest selected file finishes', async () => {
    render(<BaseEditorPage ctx={context()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Credentials', exact: true }));
    await act(async () => { selectFile('Upload certificate chain', Promise.resolve(new TextEncoder().encode('CERT').buffer)); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit', exact: true })).not.toBeDisabled());
    const first = Promise.withResolvers<ArrayBuffer>();
    const newest = Promise.withResolvers<ArrayBuffer>();
    selectFile('Upload private key', first.promise);
    selectFile('Upload private key', newest.promise);
    expect(screen.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redacted YAML', exact: true })).toBeDisabled();
    expect(screen.getByLabelText('Upload private key')).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit', exact: true }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    await act(async () => { first.resolve(new TextEncoder().encode('OLD').buffer); await first.promise; });
    expect(screen.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    await act(async () => { newest.resolve(new TextEncoder().encode('KEY').buffer); await newest.promise; });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit', exact: true })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Submit', exact: true }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update', expectedRevision: 'revision-1', input: { ...original, data: { 'tls.crt': 'Q0VSVA==', 'tls.key': 'S0VZ' } } })));
  });

  it('clears pending reads on cancellation and clears a prior read failure when a new selection succeeds', async () => {
    render(<BaseEditorPage ctx={context()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Credentials', exact: true }));
    await act(async () => { selectFile('Upload certificate chain', Promise.resolve(new TextEncoder().encode('CERT').buffer)); });
    const failed = Promise.withResolvers<ArrayBuffer>();
    selectFile('Upload private key', failed.promise);
    await act(async () => { failed.reject(new Error('File read failed.')); await failed.promise.catch(() => undefined); });
    expect(screen.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled();
    const pending = Promise.withResolvers<ArrayBuffer>();
    selectFile('Upload private key', pending.promise);
    expect(screen.queryByText('File could not be read. No credential changed.')).toBeNull();
    const privateKeyCard = screen.getByLabelText('Upload private key').closest('div');
    if (!privateKeyCard) throw new Error('Missing private key upload card.');
    const cancel = Array.from(privateKeyCard.querySelectorAll('button')).find((button) => button.textContent === 'Cancel change');
    if (!cancel) throw new Error('Missing pending upload cancellation.');
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit', exact: true })).not.toBeDisabled());
    await act(async () => { pending.resolve(new TextEncoder().encode('IGNORED').buffer); await pending.promise; });
    const recovered = Promise.withResolvers<ArrayBuffer>();
    selectFile('Upload private key', recovered.promise);
    await act(async () => { recovered.resolve(new TextEncoder().encode('KEY').buffer); await recovered.promise; });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit', exact: true })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Submit', exact: true }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ input: { ...original, data: { 'tls.crt': 'Q0VSVA==', 'tls.key': 'S0VZ' } } })));
  });
});
