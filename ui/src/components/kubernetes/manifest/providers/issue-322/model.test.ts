import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { exactNonnegative, operationReadOnly, validateOperation } from './model';
import { ResourceEditorController } from '../../resourceEditorController';
import { resourceEditors } from './index';

const context = (kind = 'Operation', intent: ResourceEditorContext['intent'] = 'create'): ResourceEditorContext => ({ group: 'ops.crossplane.io', version: 'v1alpha1', kind, resource: kind === 'Operation' ? 'operations' : kind === 'CronOperation' ? 'cronoperations' : 'watchoperations', scope: 'Cluster', connectionID: 'fixture', intent, ownership: { status: 'application' }, discovery: { status: 'available', features: {} }, schema: { status: 'available' }, capabilities: { create: 'available', update: 'available', delete: 'available', get: 'available', list: 'available', actions: {} } });
function draft(value: unknown): ResourceEditorDraft {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((node, key) => node !== null && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, value);
  return { sessionID: 'fixture', revision: 0, get, has: path => get(path) !== undefined };
}
describe('Crossplane Operations boundaries', () => {
  it('keeps int64 values exact and rejects partial, fractional, unsafe and overflow input', () => {
    expect(exactNonnegative('9223372036854775807', 64)).toEqual({ valid: true, value: 9223372036854775807n });
    for (const value of ['9223372036854775808', '-1', '1.2', '1e5', '']) expect(exactNonnegative(value, 64).valid).toBe(false);
    expect(exactNonnegative('2147483648', 32).valid).toBe(false);
  });
  it('never permits an existing run to become editable merely because status is missing', () => {
    expect(operationReadOnly(draft({}), context('Operation', 'edit'))).toBe(true);
    expect(operationReadOnly(draft({}), context())).toBe(false);
    for (const kind of ['CronOperation', 'WatchOperation']) expect(operationReadOnly(draft({ metadata: { ownerReferences: [{ kind, name: 'parent' }] } }), context())).toBe(true);
  });
  it('blocks ambiguous pipeline names and missing Function references', () => {
    const issues = validateOperation(draft({ spec: { pipeline: [{ step: 'same', functionRef: { name: 'installed' } }, { step: 'same', functionRef: {} }] } }), context());
    expect(issues.map(issue => issue.path)).toEqual([['spec', 'pipeline', 1, 'step'], ['spec', 'pipeline', 1, 'functionRef', 'name']]);
  });
  it('requires a watched GVK without inventing namespace or labels', () => {
    const issues = validateOperation(draft({ spec: { watch: {}, operationTemplate: { spec: { pipeline: [{ step: 'run', functionRef: { name: 'installed' } }] } } } }), context('WatchOperation'));
    expect(issues.map(issue => issue.path)).toEqual([['spec', 'watch', 'apiVersion'], ['spec', 'watch', 'kind']]);
  });
  it('patches a step leaf without replacing arbitrary input, exact siblings or comments', () => {
    const source = 'apiVersion: ops.crossplane.io/v1alpha1\nkind: CronOperation\nmetadata:\n  name: nightly\nspec:\n  schedule: "0 2 * * *"\n  operationTemplate:\n    spec:\n      retryLimit: 9223372036854775807 # exact\n      pipeline:\n        - step: first\n          functionRef:\n            name: old\n          input:\n            apiVersion: example.test/v1\n            kind: Input\n            opaque: retain\n';
    const controller = new ResourceEditorController(source);
    const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'operationTemplate', 'spec', 'pipeline', 0, 'functionRef', 'name'], value: 'new' }] }, resourceEditors[0], context('CronOperation', 'edit'));
    expect(result.status).toBe('accepted');
    expect(controller.getSource()).toContain('9223372036854775807 # exact');
    expect(controller.getSource()).toContain('opaque: retain');
    expect(controller.getSource()).toContain('name: new');
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [] }, resourceEditors[0], context('CronOperation', 'edit')).status).toBe('stale');
  });
});
