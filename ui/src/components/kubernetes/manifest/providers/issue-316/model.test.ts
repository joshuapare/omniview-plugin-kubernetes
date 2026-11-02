import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { endpointError, unavailable, validate } from './model';
const draft = (root: unknown): ResourceEditorDraft => ({ sessionID: 'fixture', revision: 0, get: path => path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined, root), has(path) { return this.get(path) !== undefined; } });
const context = { scope: 'Cluster' } as ResourceEditorContext;
describe('KEDA event subscription safety', () => {
  it('accepts independent simultaneous destination branches', () => {
    expect(validate(draft({ spec: { destination: { http: { uri: 'https://events.invalid' }, azureEventGridTopic: { endpoint: 'https://grid.invalid' } } } }), context)).toEqual([]);
  });
  it('rejects embedded credentials without echoing values', () => {
    expect(endpointError('https://user:password@events.invalid')).not.toContain('password');
    expect(endpointError('https://events.invalid?token=hidden')).not.toBeNull();
  });
  it('blocks unresolved cluster namespaced authentication', () => {
    const issues = validate(draft({ spec: { destination: {}, authenticationRef: { name: 'ref' } } }), context);
    expect(issues.some(issue => issue.path.join('.') === 'spec.authenticationRef.kind')).toBe(true);
  });
  it('preserves unknown event filter shapes through fallback', () => {
    expect(unavailable(draft({ spec: { eventSubscription: { includedEventTypes: ['future.event'] } } }))).not.toBeNull();
  });
  it('reports empty active destination branches', () => {
    expect(validate(draft({ spec: { destination: { http: {} } } }), context)).toHaveLength(1);
  });
});
