import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateResourceButton from './CreateResourceButton';
import { PLUGIN_ID } from '@/pluginId';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), resolve: vi.fn(), encode: vi.fn(), schema: vi.fn(), editorPath: vi.fn() }));
vi.mock('@omniviewdev/runtime', () => ({
  jsonToValue: mocks.encode,
  useResourceMutations: () => ({ mutate: mocks.mutate }),
  useResourceEditorModelPath: mocks.editorPath,
  useResourceTypes: () => ({ resourceTypes: { data: [{
    type: 'k8s:/pods', displayName: 'Pod', identityDimensions: [{ name: 'namespace' }],
    defaultRepresentation: 'native', representations: [{ id: 'native', schema: { state: 'absent' } }],
  }] } }),
}));
vi.mock('@omniviewdev/runtime/api', () => ({ ResourceClient: { GetSchemaDocument: mocks.schema } }));
vi.mock('../../../../utils/kubernetesReference', () => ({ resolveKubernetesReference: mocks.resolve }));
vi.mock('./CreateResourceModal', () => ({ default: ({ open, onCreate, editorPath }: {
  open: boolean; onCreate: (yaml: string) => Promise<void>; editorPath?: string;
}) => open ? <button data-editor-path={editorPath} onClick={() => void onCreate('apiVersion: v1\nkind: Pod\nmetadata:\n  name: exact-name\n  namespace: team\nspec:\n  exact: 9007199254740993\n')}>Submit native manifest</button> : null }));

describe('canonical create mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ route: { connection: 'selected' }, reference: {
      address: { provider: 'kubernetes', authority: 'host-authority', type: 'k8s:/pods',
        scope: [{ dimension: 'namespace', value: 'team' }], id: 'exact-name' },
    } });
    mocks.encode.mockReturnValue({ kind: 'map', value: {} });
    mocks.editorPath.mockReturnValue('catalog://pod/create.yaml');
    mocks.mutate.mockResolvedValue({});
  });

  it('creates pasted manifests without schema using host reference and exact tagged body', async () => {
    render(<CreateResourceButton connectionID="selected" resourceKey="k8s:/pods" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Pod' }));
    const submit = await screen.findByRole('button', { name: 'Submit native manifest' });
    expect(submit.getAttribute('data-editor-path')).toBe('catalog://pod/create.yaml');
    expect(mocks.editorPath).toHaveBeenCalledWith({
      pluginID: PLUGIN_ID, route: { connection: 'selected' }, type: 'k8s:/pods', name: 'create',
    });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
    expect(mocks.resolve).toHaveBeenCalledWith({
      connectionID: 'selected', resourceType: 'k8s:/pods', name: 'exact-name', namespace: 'team',
    });
    expect(mocks.encode).toHaveBeenCalledWith(expect.objectContaining({ spec: { exact: 9007199254740993n } }));
    const request = mocks.mutate.mock.calls[0][0];
    expect(request.operation).toBe('create');
    expect(request.route).toEqual({ connection: 'selected' });
    expect(request.reference.address.authority).toBe('host-authority');
    expect(request.reference.incarnation).toBeUndefined();
    expect(request.expectedRevision).toBeUndefined();
    expect(request.input).toEqual({ kind: 'map', value: {} });
  });
});
