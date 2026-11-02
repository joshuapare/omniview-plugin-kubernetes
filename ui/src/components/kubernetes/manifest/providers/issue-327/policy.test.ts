import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { validate, unsupported } from './policy';
function draft(value: unknown): ResourceEditorDraft {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((node, key) => node !== null && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, value);
  return { sessionID: 'test', revision: 0, get, has: path => get(path) !== undefined };
}
const context = (kind: string) => ({ kind } as ResourceEditorContext);
describe('Kyverno domain safety', () => {
  it('rejects absent rules and conflicting operations', () => {
    expect(validate(draft({ spec: { rules: [] } }), context('Policy'))).toHaveLength(1);
    expect(validate(draft({ spec: { rules: [{ name: 'guard', match: {}, validate: {}, mutate: {} }] } }), context('ClusterPolicy')).map(issue => issue.message)).toContain('Choose exactly one rule operation.');
  });
  it('rejects both global context sources without converting either', () => {
    const value = { spec: { apiCall: { urlPath: '/api/v1/namespaces' }, kubernetesResource: { version: 'v1', resource: 'pods' } } };
    expect(validate(draft(value), context('GlobalContextEntry'))[0].message).toBe('Choose exactly one context source.');
    expect(value.spec.apiCall.urlPath).toBe('/api/v1/namespaces');
  });
  it('requires five cron fields without claiming controller validation', () => {
    expect(validate(draft({ spec: { schedule: '* *', match: {} } }), context('CleanupPolicy')).some(issue => issue.message === 'Use five cron fields.')).toBe(true);
    expect(validate(draft({ spec: { schedule: '0 3 * * *', match: {} } }), context('ClusterCleanupPolicy'))).toEqual([]);
  });
  it('never validates controller work as an authoring request', () => {
    expect(validate(draft({ spec: {} }), context('UpdateRequest'))).toEqual([]);
  });
  it('declines scalar specs rather than replacing them', () => {
    expect(unsupported(draft({ spec: 'unsupported' }))).toBeTruthy();
    expect(unsupported(draft({ spec: { retained: 9007199254740993n } }))).toBeNull();
  });
});
