import { describe, expect, it } from 'vitest';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
import { canRemoveBranch, requestOperations, validate } from './semantics';
function draft(spec: unknown): ResourceEditorDraft {
  const root = { spec };
  return { sessionID: 'fixture', revision: 0, get(path) { return path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined, root); }, has(path) { return this.get(path) !== undefined; } };
}
describe('HelmRelease authoring boundaries', () => {
  it('pairs force and reset with the same reconciliation token', () => {
    for (const action of ['force', 'reset'] as const) {
      const operations = requestOperations(action, 'fixture-token');
      expect(operations.map(operation => operation.op === 'set' ? operation.value : undefined)).toEqual(['fixture-token', 'fixture-token']);
      expect(operations[1].path).toEqual(['metadata', 'annotations', `reconcile.fluxcd.io/${action}At`]);
    }
  });
  it('blocks simultaneous source branches without rejecting valid OCI chart references', () => {
    expect(validate(draft({ interval: '5m', chartRef: { kind: 'OCIRepository', name: 'chart' } }))).toEqual([]);
    expect(validate(draft({ interval: '5m', chart: {}, chartRef: { name: 'chart' } })).some(error => error.message === 'Choose exactly one chart source.')).toBe(true);
  });
  it('keeps malformed durations out of submission', () => {
    expect(validate(draft({ interval: '5', chartRef: { name: 'chart' } }))[0].path).toEqual(['spec', 'interval']);
  });
  it('does not permit branch deletion when source-owned or opaque siblings exist', () => {
    expect(canRemoveBranch({ spec: {}, metadata: { annotations: {} } }, ['spec'])).toBe(false);
    expect(canRemoveBranch({ kind: 'OCIRepository', name: 'chart' }, ['kind', 'name', 'namespace'])).toBe(true);
  });
});
