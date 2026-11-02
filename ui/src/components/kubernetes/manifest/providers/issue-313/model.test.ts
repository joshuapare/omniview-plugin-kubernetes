import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { duration, timeout, policyOperations, validate, readOnly } from './model';
function draft(spec: Record<string, unknown>): ResourceEditorDraft {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined, { spec });
  return { sessionID: 'fixture', revision: 0, get, has: path => get(path) !== undefined };
}
const context = { kind: 'ImagePolicy', intent: 'edit', ownership: { status: 'application' } } as ResourceEditorContext;
describe('Flux image authoring constraints', () => {
  it('requires digest interval in Always mode, rejects it in Never mode', () => {
    const base = { imageRepositoryRef: { name: 'fixture' }, policy: { semver: { range: '>=1' } } };
    expect(validate(draft({ ...base, digestReflectionPolicy: 'Always' }), context).some(issue => issue.path.join('.') === 'spec.interval')).toBe(true);
    expect(validate(draft({ ...base, digestReflectionPolicy: 'Always', interval: '10m' }), context)).toEqual([]);
    expect(validate(draft({ ...base, digestReflectionPolicy: 'Never', interval: '10m' }), context).length).toBe(1);
  });
  it('switches only rule branches without replacing policy container', () => {
    const operations = policyOperations('numerical');
    expect(operations).toContainEqual({ op: 'remove', path: ['spec', 'policy', 'semver'] });
    expect(operations).toContainEqual({ op: 'set', path: ['spec', 'policy', 'numerical'], value: { order: 'asc' } });
    expect(operations.some(operation => operation.path.length < 3)).toBe(false);
  });
  it('distinguishes scan timeout and interval units', () => {
    expect(duration.test('1h30m')).toBe(true);
    expect(timeout.test('1h')).toBe(false);
    expect(duration.test('10')).toBe(false);
  });
  it('locks untrusted ownership and controller-owned resources', () => {
    expect(readOnly(draft({}), { ...context, ownership: undefined })).toBe(true);
    expect(readOnly(draft({}), { ...context, ownership: { status: 'controller' } })).toBe(true);
    expect(readOnly(draft({}), context)).toBe(false);
  });
});
