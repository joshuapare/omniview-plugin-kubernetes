import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateResourceButton from './CreateResourceButton';
import type { jsonToValue as EncodeValue } from '@omniviewdev/runtime';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), resolve: vi.fn(), encode: vi.fn(), schema: vi.fn(), editorPath: vi.fn() }));
vi.mock('@omniviewdev/runtime', () => ({
  jsonToValue: mocks.encode,
  RESOURCE_EDITOR_EXTENSION_POINT: 'kubernetes/resource/editor/v1',
  useExtensionPointSnapshot: () => ({ contributions: [] }),
  useResourceMutations: () => ({ mutate: mocks.mutate }),
  useResourceEditorModelPath: mocks.editorPath,
  useResourceTypes: () => ({ resourceTypes: { data: [{
    type: 'k8s:/pods', displayName: 'Pod', identityDimensions: [{ name: 'namespace' }],
    defaultRepresentation: 'kubernetes.object.v1/v1', representations: [{ id: 'kubernetes.object.v1/v1', schema: { state: 'absent' } }],
    capabilities: [{ operation: 'create', scope: [] }],
  }] } }),
}));
vi.mock('@omniviewdev/runtime/api', () => ({ ResourceClient: { GetSchemaDocument: mocks.schema } }));
vi.mock('../../../../utils/kubernetesReference', () => ({ resolveKubernetesReference: mocks.resolve }));
vi.mock('./CreateResourceModal', () => ({ default: ({ open, onCreate }: {
  open: boolean; onCreate: (yaml: string, isCurrent: () => boolean) => Promise<void>;
}) => open ? <button onClick={() => void onCreate('apiVersion: v1\nkind: Pod\nmetadata:\n  name: exact-name\n  namespace: team\nspec:\n  containers: [{name: main, image: nginx}]\n  exact: 9007199254740993\n', () => true)}>Submit native manifest</button> : null }));

describe('canonical create mutation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ route: { connection: 'selected' }, reference: {
      address: { provider: 'kubernetes', authority: 'host-authority', type: 'k8s:/pods',
        scope: [{ dimension: 'namespace', value: 'team' }], id: 'exact-name' },
    } });
    const actual = await vi.importActual<{ jsonToValue: typeof EncodeValue }>('@omniviewdev/runtime');
    mocks.encode.mockImplementation(actual.jsonToValue);
    mocks.mutate.mockResolvedValue({});
  });

  it('creates pasted manifests without schema using host reference and exact tagged body', async () => {
    render(<CreateResourceButton connectionID="selected" resourceKey="k8s:/pods" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Pod' }));
    const submit = await screen.findByRole('button', { name: 'Submit native manifest' });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
    expect(mocks.resolve).toHaveBeenCalledWith({
      connectionID: 'selected', resourceType: 'k8s:/pods', name: 'exact-name', namespace: 'team',
    });
    expect(mocks.encode).toHaveBeenCalledWith(expect.objectContaining({ spec: expect.objectContaining({ exact: 9007199254740993n }) }));
    const request = mocks.mutate.mock.calls[0][0];
    expect(request.operation).toBe('create');
    expect(request.route).toEqual({ connection: 'selected' });
    expect(request.reference.address.authority).toBe('host-authority');
    expect(request.reference.incarnation).toBeUndefined();
    expect(request.expectedRevision).toBeUndefined();
    expect(request.input).toMatchObject({ kind: 'map', value: { spec: { kind: 'map', value: { exact: { kind: 'int64', value: '9007199254740993' } } } } });
  });
});
