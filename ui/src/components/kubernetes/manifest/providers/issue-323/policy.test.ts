import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { protectionReadOnly, validateProtection } from './policy';
function draft(value: unknown): ResourceEditorDraft {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, value);
  return { sessionID: 'fixture', revision: 1, get, has: path => get(path) !== undefined };
}
const manual = { kind: 'Usage', intent: 'edit', ownership: { status: 'application' } } as ResourceEditorContext;
describe('Crossplane protection policy', () => {
  it('does not allow ownership policy to override owner references', () => {
    expect(protectionReadOnly(draft({ metadata: { ownerReferences: [{ kind: 'Composition' }] } }), manual)).toBe(true);
    expect(protectionReadOnly(draft({}), manual)).toBe(false);
    expect(protectionReadOnly(draft({}), { ...manual, ownership: { status: 'unknown' } })).toBe(true);
  });
  it('rejects reason-only namespace overrides but admits explicit dependencies', () => {
    const of = { apiVersion: 'v1', kind: 'ConfigMap', resourceRef: { name: 'used', namespace: 'other' } };
    expect(validateProtection(draft({ spec: { of, reason: 'retain' } }), manual).some(issue => issue.path.join('.') === 'spec.of')).toBe(true);
    expect(validateProtection(draft({ spec: { of, by: { apiVersion: 'apps/v1', kind: 'Deployment', resourceRef: { name: 'using' } } } }), manual)).toEqual([]);
  });
  it('requires a reason or using resource and respects reference precedence', () => {
    const of = { apiVersion: 'v1', kind: 'ConfigMap', resourceRef: { name: '' }, resourceSelector: { matchLabels: { app: 'fixture' } } };
    const errors = validateProtection(draft({ spec: { of } }), { ...manual, intent: 'create' });
    expect(errors.some(issue => issue.path.join('.') === 'spec.reason')).toBe(true);
    expect(errors.some(issue => issue.path.join('.') === 'spec.of.resourceRef.name')).toBe(true);
  });
  it('does not demand editable validity for generated relationships', () => {
    expect(validateProtection(draft({}), { ...manual, ownership: { status: 'controller' } })).toEqual([]);
  });
  it('protects controller-resolved selector references during edit', () => {
    expect(protectionReadOnly(draft({ spec: { of: { resourceRef: { name: 'resolved' }, resourceSelector: {} } } }), manual)).toBe(true);
  });
});
