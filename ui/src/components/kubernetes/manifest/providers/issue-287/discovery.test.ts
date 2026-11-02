import { describe, expect, it } from 'vitest';
import { migrationTargets } from './discovery';

const resource = { resource: 'deployments', verbs: ['list', 'update'] };
describe('storage migration target discovery', () => {
  it('uses the exact advertised plural and deduplicates versions of one GroupResource', () => {
    expect(migrationTargets({ kind: 'APIGroupDiscoveryList', items: [{ metadata: { name: 'apps' }, versions: [
      { version: 'v1', freshness: 'Current', resources: [resource] },
      { version: 'v1beta1', freshness: 'Current', resources: [resource] },
    ] }] })).toEqual([{ group: 'apps', resource: 'deployments' }]);
  });
  it('accepts core discovery omitted name without inventing a group', () => {
    expect(migrationTargets({ kind: 'APIGroupDiscoveryList', items: [{ metadata: {}, versions: [{ freshness: 'Current', resources: [{ resource: 'configmaps', verbs: ['list', 'update'] }] }] }] }))
      .toEqual([{ group: '', resource: 'configmaps' }]);
  });
  it('does not offer stale versions, status subresources, or read-only APIs', () => {
    expect(migrationTargets({ kind: 'APIGroupDiscoveryList', items: [{ metadata: { name: 'apps' }, versions: [
      { freshness: 'Stale', resources: [resource] },
      { freshness: 'Current', resources: [{ resource: 'deployments/status', verbs: ['list', 'update'] }, { resource: 'observations', verbs: ['get', 'list'] }] },
    ] }] })).toEqual([]);
  });
  it('distinguishes a real empty list from invalid or unsupported discovery representations', () => {
    expect(migrationTargets({ kind: 'APIGroupDiscoveryList', items: [] })).toEqual([]);
    expect(migrationTargets({ kind: 'APIGroupDiscoveryList', items: [{ metadata: {}, versions: [] }] })).toEqual([]);
    expect(migrationTargets({ kind: 'APIResourceList', resources: [] })).toBeNull();
    expect(migrationTargets({ kind: 'APIGroupDiscoveryList', items: [{ versions: [null] }] })).toBeNull();
  });
});
