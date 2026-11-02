import { describe, expect, it, vi } from 'vitest';
import { jsonToValue, type ResourceEditorContext, type ResourceEditorContribution } from '@omniviewdev/runtime';
import { parse } from 'yaml';
import { ResourceEditorController, assertResourceEditorInput } from './resourceEditorController';
import { canonicalEditorRequest } from './resourceEditorRequest';
import { projectEditorActionResult } from './resourceEditorResults';
import { validateImmutableEditorFields } from './resourceEditorPolicy';

const context: ResourceEditorContext = { group: 'demo.example', version: 'v1', kind: 'Demo', resource: 'demos', scope: 'Namespaced', connectionID: 'fixture-only', intent: 'create', capabilities: { create: 'available', update: 'available', delete: 'absent', get: 'available', list: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' }, ownership: { status: 'application' } };
const contribution: ResourceEditorContribution = { contractVersion: 1, targets: [context], intents: ['create', 'edit'], ownershipPolicy: 'declarative', label: 'Demo', sections: [{ id: 'configuration', label: 'Configuration' }], ownedPaths: [['spec']], component: () => null };
const source = 'apiVersion: demo.example/v1\nkind: Demo\nmetadata: { name: demo, namespace: team }\nspec:\n  message: old # keep field comment\n  unknown: 9007199254740993 # preserve exact unknown scalar\n  rows:\n    - name: first # preserve row\n      unknown: retained\n    - name: second\n';

describe('canonical resource editor controller', () => {
  it('retains comments, unknown siblings and exact mutation integers across form and YAML edits', () => {
    const controller = new ResourceEditorController(source, 'session');
    const before = controller.draft();
    expect(controller.draft()).toBe(before);
    expect(controller.patch({ sessionID: 'session', expectedRevision: 0, operations: [{ op: 'set', path: ['spec'], value: { message: 'new' } }] }, contribution, context).status).toBe('accepted');
    expect(before.get(['spec', 'message'])).toBe('old');
    expect(controller.getSource()).toContain('# keep field comment');
    expect(controller.getSource()).toContain('unknown: 9007199254740993');
    controller.syncSource(`${controller.getSource()}advanced: true\n`);
    const payload = jsonToValue(parse(controller.getSource(), { intAsBigInt: true }));
    expect(payload).toMatchObject({ kind: 'map', value: { spec: { kind: 'map', value: { unknown: { kind: 'int64', value: '9007199254740993' } } }, advanced: { kind: 'bool', value: true } } });
  });

  it('publishes coherent external snapshots and retains protected paths across provider fallback', () => {
    const controller = new ResourceEditorController('apiVersion: demo.example/v1\nkind: Demo\nspec: {token: fixture-only-secret}\n');
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.commitSafety(true, false, [['spec', 'token']], true);
    const protectedSnapshot = controller.getSnapshot();
    expect(protectedSnapshot).toMatchObject({ sensitive: true, readOnly: false, fallback: true, protectedPaths: [['spec', 'token']] });
    controller.commitSafety(false, undefined, []);
    expect(controller.getSnapshot()).toBe(protectedSnapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    controller.syncSource(`${controller.getSource()}other: retained\n`);
    expect(controller.getSnapshot()).toMatchObject({ revision: 1, sensitive: true, fallback: true, protectedPaths: [['spec', 'token']] });
    const projected = controller.draft(controller.getSnapshot().protectedPaths);
    expect(() => JSON.stringify(projected.get(['spec', 'token']))).toThrow();
    expect(projected.get(['other'])).toBe('retained');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    controller.invalidate();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('rejects an unsafe batch atomically and invalidates stale sessions and revisions', () => {
    const controller = new ResourceEditorController(source, 'session');
    expect(controller.patch({ sessionID: 'session', expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'message'], value: 'not committed' }, { op: 'set', path: ['spec', 'unknown'], value: 9007199254740992 }] }, contribution, context).status).toBe('unsafe');
    expect(controller.getSource()).toBe(source);
    expect(controller.revision).toBe(0);
    controller.syncSource(`${source}other: true\n`);
    expect(controller.patch({ sessionID: 'session', expectedRevision: 0, operations: [] }, contribution, context).status).toBe('stale');
    expect(controller.patch({ sessionID: 'old-session', expectedRevision: 1, operations: [] }, contribution, context).status).toBe('stale');
    controller.dispose();
    expect(controller.patch({ sessionID: 'session', expectedRevision: 1, operations: [] }, contribution, context).status).toBe('stale');
  });

  it('keeps unedited row nodes and rejects segment-prefix ownership and identity writes', () => {
    const controller = new ResourceEditorController(source, 'session');
    expect(controller.patch({ sessionID: 'session', expectedRevision: 0, operations: [{ op: 'insert', path: ['spec', 'rows'], index: 1, value: { name: 'inserted' } }] }, contribution, context).status).toBe('accepted');
    expect(controller.getSource()).toContain('# preserve row');
    expect(controller.draft().get(['spec', 'rows', 0, 'unknown'])).toBe('retained');
    expect(controller.draft().get(['spec', 'rows', 2, 'name'])).toBe('second');
    expect(controller.patch({ sessionID: 'session', expectedRevision: 1, operations: [{ op: 'set', path: ['specOther'], value: true }] }, contribution, context).status).toBe('forbidden');
    expect(controller.patch({ sessionID: 'session', expectedRevision: 1, operations: [{ op: 'set', path: ['metadata', 'name'], value: 'other' }] }, contribution, context).status).toBe('immutable');
  });

  it('reorders named rows without transferring unknown fields or comments to another row', () => {
    const controller = new ResourceEditorController(source, 'session');
    expect(controller.patch({ sessionID: 'session', expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'rows'], value: [{ name: 'second' }, { name: 'first', extra: true }] }] }, contribution, context).status).toBe('accepted');
    expect(controller.draft().get(['spec', 'rows', 0, 'unknown'])).toBeUndefined();
    expect(controller.draft().get(['spec', 'rows', 1, 'unknown'])).toBe('retained');
    expect(controller.getSource()).toContain('name: first # preserve row');
  });

  it('masks wildcard values and malformed sensitive ancestors without allowing projection writeback', () => {
    const protectedContribution = { ...contribution, sensitivePaths: [['spec', 'rows', '*', 'unknown']] } satisfies ResourceEditorContribution;
    const controller = new ResourceEditorController(source, 'session');
    const draft = controller.draft(protectedContribution.sensitivePaths);
    const hidden = draft.get(['spec', 'rows', 0, 'unknown']);
    expect(hidden).not.toBe('retained');
    expect(() => JSON.stringify(hidden)).toThrow('Hidden values');
    expect(() => assertResourceEditorInput({ nested: hidden })).toThrow();
    expect(controller.patch({ sessionID: 'session', expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'rows', 0, 'unknown'], value: hidden }] }, protectedContribution, context).status).toBe('unsafe');
    const malformed = new ResourceEditorController('spec: { rows: hidden-scalar }\n').draft(protectedContribution.sensitivePaths);
    expect(malformed.get(['spec', 'rows'])).not.toBe('hidden-scalar');
    expect(Object.isFrozen(draft.get(['spec', 'rows']))).toBe(true);
  });

  it('accepts fresh explicit sensitive subtree replacement without altering adjacent nodes', () => {
    const protectedContribution = { ...contribution, sensitivePaths: [['spec', 'rows']] } satisfies ResourceEditorContribution;
    const controller = new ResourceEditorController(source, 'session');
    expect(controller.patch({ sessionID: 'session', expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'rows'], value: [{ name: 'replacement' }] }] }, protectedContribution, context).status).toBe('accepted');
    expect(controller.getSource()).toContain('unknown: 9007199254740993');
    expect(controller.getSource()).not.toContain('name: first');
  });

  it('enforces native immutable fields for YAML and permits nondecreasing static PV capacity', () => {
    const baseline = 'apiVersion: v1\nkind: PersistentVolume\nmetadata: {name: pv}\nspec: {nfs: {server: storage, path: /data}, capacity: {storage: 10Gi}, accessModes: [ReadWriteOnce]}\n';
    const pv = { ...context, group: '', kind: 'PersistentVolume', resource: 'persistentvolumes', scope: 'Cluster', intent: 'edit' } as const;
    expect(validateImmutableEditorFields(baseline.replace('server: storage', 'server: other'), baseline, pv)).toContain('immutable');
    expect(validateImmutableEditorFields(baseline.replace('10Gi', '20Gi'), baseline, pv)).toBeNull();
    expect(validateImmutableEditorFields(baseline.replace('10Gi', '9Gi'), baseline, pv)).toContain('cannot decrease');
  });
});

describe('canonical request privacy', () => {
  it('extracts only approval identity and conditions, never CSR bytes', () => {
    const body = 'apiVersion: certificates.k8s.io/v1\nkind: CertificateSigningRequest\nmetadata: {name: csr, resourceVersion: "7"}\nspec: {request: private-csr-bytes}\nstatus: {conditions: [{type: Approved, status: "True", reason: Reviewed}]}\n';
    const result = canonicalEditorRequest(body, 'kubernetes.csr-approval.v1', { ...context, group: 'certificates.k8s.io', kind: 'CertificateSigningRequest', resource: 'certificatesigningrequests', scope: 'Cluster', intent: 'action', name: 'csr', resourceVersion: '7' });
    expect(result).not.toHaveProperty('spec');
    expect(result).toMatchObject({ metadata: { name: 'csr', resourceVersion: '7' }, status: { conditions: [{ type: 'Approved' }] } });
  });
  it('keeps credential-bearing action output opaque while retaining safe decision and expiry', () => {
    const result = projectEditorActionResult({ status: 'ready', sensitive: true, output: { spec: { token: 'private-input' }, status: { authenticated: true, user: { username: 'private-user' }, error: 'private-diagnostic' } } }, 'kubernetes.review.v1');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected ready result');
    const output = result.output as { spec: unknown; status: { authenticated: boolean; user: unknown; error: unknown } };
    expect(output.status.authenticated).toBe(true);
    for (const value of [output.spec, output.status.user, output.status.error]) expect(() => JSON.stringify(value)).toThrow('Hidden values');
  });
});
