import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext } from '@omniviewdev/runtime';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), target: vi.fn(), action: vi.fn() }));
vi.mock('@omniviewdev/runtime/api', () => ({ ResourceClient: { ResolveReference: mocks.resolve, ResolveTarget: mocks.target, Action: mocks.action } }));
import { createResourceEditorServices, decodeEditorValue, isReadOnlyResourceEditorProtocol } from './resourceEditorServices';

const context: ResourceEditorContext = {
  group: 'authentication.k8s.io', version: 'v1', resource: 'serviceaccounts/token', kind: 'TokenRequest', scope: 'Namespaced', namespace: 'team', name: 'builder', connectionID: 'connection', intent: 'action',
  capabilities: { create: 'unknown', update: 'unknown', delete: 'unknown', get: 'unknown', list: 'unknown', actions: {} },
  discovery: { status: 'available', features: {} }, schema: { status: 'unknown' },
};

describe('resource editor transport', () => {
  it('admits only pure read protocols for automatic preflight', () => {
    for (const protocol of ['kubernetes.metrics.v1', 'kubernetes.discovery.v1', 'kubernetes.server-info.v1', 'kubernetes.tigera-evidence.v1']) {
      expect(isReadOnlyResourceEditorProtocol(protocol)).toBe(true);
    }
    for (const protocol of ['kubernetes.service-account-token.v1', 'kubernetes.scale.v1', 'kubernetes.review.v1', 'kubernetes.crossplane-revision-activation.v1', 'toString', 'https://example.test']) {
      expect(isReadOnlyResourceEditorProtocol(protocol)).toBe(false);
    }
  });
  it('keeps wide response integers exact', () => {
    expect(decodeEditorValue({ kind: 'int64', value: '9007199254740993' })).toBe(9007199254740993n);
    expect(decodeEditorValue({ kind: 'int64', value: '17' })).toBe(17);
  });
  it('routes TokenRequest to real core service-account identity', async () => {
    mocks.resolve.mockResolvedValueOnce({ route: { connection: 'connection' }, reference: { address: { type: 'k8s:/serviceaccounts', id: 'builder' } } });
    mocks.action.mockResolvedValueOnce({ kind: 'map', value: {} });
    const result = await createResourceEditorServices(context).actions.execute({ protocol: 'kubernetes.service-account-token.v1', input: { apiVersion: 'authentication.k8s.io/v1', kind: 'TokenRequest', spec: { audiences: [] } }, sessionID: 'session', generation: 1, signal: new AbortController().signal });
    expect(mocks.resolve).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ type: 'k8s:/serviceaccounts', representation: 'kubernetes.object.v1/v1', id: 'builder', scope: [{ dimension: 'namespace', value: 'team' }] }));
    expect(result).toMatchObject({ status: 'ready', sensitive: true });
  });
  it('never calls transport for unknown protocols', async () => {
    mocks.action.mockClear();
    const result = await createResourceEditorServices(context).actions.execute({ protocol: 'https://cluster/private', input: {}, sessionID: 'session', generation: 2, signal: new AbortController().signal });
    expect(result.status).toBe('invalid');
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it('never starts an already cancelled action', async () => {
    mocks.resolve.mockClear();
    const abort = new AbortController(); abort.abort();
    const result = await createResourceEditorServices(context).actions.execute({ protocol: 'kubernetes.service-account-token.v1', input: {}, sessionID: 'session', generation: 3, signal: abort.signal });
    expect(result.status).toBe('cancelled');
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
