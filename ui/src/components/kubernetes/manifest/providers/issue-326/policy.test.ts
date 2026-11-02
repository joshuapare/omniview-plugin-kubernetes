import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { validate, unavailable } from './policy';
const draft = (value: unknown): ResourceEditorDraft => ({ sessionID: 'fixture', revision: 0, get: path => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, value), has(path) { return this.get(path) !== undefined; } });
const context = (kind: string, intent = 'create') => ({ kind, intent } as ResourceEditorContext);
describe('group snapshot source and import safety', () => {
  it('rejects ambiguous sources without discarding either branch', () => {
    const source = { selector: {}, volumeGroupSnapshotContentName: 'existing' };
    const input = draft({ spec: { source } });
    expect(validate(input, context('VolumeGroupSnapshot')).some(issue => issue.path.join('.') === 'spec.source')).toBe(true);
    expect(input.get(['spec', 'source'])).toBe(source);
  });
  it('accepts omitted class but rejects explicit empty class', () => {
    expect(validate(draft({ spec: { source: { selector: {} } } }), context('VolumeGroupSnapshot'))).toEqual([]);
    expect(validate(draft({ spec: { source: { selector: {} }, volumeGroupSnapshotClassName: '' } }), context('VolumeGroupSnapshot'))).toHaveLength(1);
  });
  it('does not expose dynamic content as import authoring', () => {
    const input = draft({ spec: { source: { volumeHandles: ['volume'] } } });
    expect(unavailable(input, context('VolumeGroupSnapshotContent'))).toContain('Controller-created');
    expect(unavailable(input, context('VolumeGroupSnapshotContent', 'inspect'))).toBeNull();
  });
  it('requires member handles and both binding fields for import', () => {
    const input = draft({ spec: { driver: 'driver', deletionPolicy: 'Retain', source: { groupSnapshotHandles: { volumeGroupSnapshotHandle: 'group', volumeSnapshotHandles: [''] } }, volumeGroupSnapshotRef: { name: 'request' } } });
    expect(validate(input, context('VolumeGroupSnapshotContent')).map(issue => issue.path.join('.'))).toEqual(['spec.source.groupSnapshotHandles.volumeSnapshotHandles', 'spec.volumeGroupSnapshotRef.namespace']);
  });
});
