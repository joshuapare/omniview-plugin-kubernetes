import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { inspectOnly, validateSnapshot } from './policy';
const draft = (value: Record<string, unknown>): ResourceEditorDraft => ({ sessionID: 'fixture', revision: 0, get: path => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined, value), has(path) { return this.get(path) !== undefined; } });
const context = (kind: string, intent = 'create'): ResourceEditorContext => ({ group: 'snapshot.storage.k8s.io', version: 'v1', kind, resource: 'volumesnapshots', scope: 'Namespaced', connectionID: 'fixture', intent: intent as ResourceEditorContext['intent'], ownership: { status: 'application' }, capabilities: { create: 'available', update: 'available', delete: 'denied', get: 'available', list: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } });
describe('CSI snapshot authoring boundaries', () => {
  it('rejects missing and ambiguous snapshot sources', () => {
    expect(validateSnapshot(draft({ spec: { source: {} } }), context('VolumeSnapshot'))).toHaveLength(1);
    expect(validateSnapshot(draft({ spec: { source: { persistentVolumeClaimName: 'pvc', volumeSnapshotContentName: 'content' } } }), context('VolumeSnapshot'))).toHaveLength(1);
  });
  it('omits default class but rejects explicit empty class', () => {
    expect(validateSnapshot(draft({ spec: { source: { persistentVolumeClaimName: 'pvc' } } }), context('VolumeSnapshot'))).toEqual([]);
    expect(validateSnapshot(draft({ spec: { source: { persistentVolumeClaimName: 'pvc' }, volumeSnapshotClassName: '' } }), context('VolumeSnapshot'))).toHaveLength(1);
  });
  it('locks generated content even with application ownership', () => {
    expect(inspectOnly(draft({ spec: { source: { volumeHandle: 'not-rendered' } } }), context('VolumeSnapshotContent', 'edit'))).toBe(true);
  });
  it('requires import target and uses top-level class fields', () => {
    expect(validateSnapshot(draft({ spec: { driver: 'driver', deletionPolicy: 'Retain', source: { snapshotHandle: 'fixture' } } }), context('VolumeSnapshotContent'))).toHaveLength(2);
    expect(validateSnapshot(draft({ driver: 'driver', deletionPolicy: 'Retain' }), context('VolumeSnapshotClass'))).toEqual([]);
  });
  it('does not infer edit ownership from absent policy', () => {
    const unknown = { ...context('VolumeSnapshot', 'edit'), ownership: undefined };
    expect(inspectOnly(draft({}), unknown)).toBe(true);
  });
});
