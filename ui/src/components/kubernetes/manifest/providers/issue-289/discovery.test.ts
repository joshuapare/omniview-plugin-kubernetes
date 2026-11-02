import { describe, expect, it } from 'vitest';

import { discoveryAccept, filterDiscovery, inspectDiscovery, kindLabel } from './discovery';

const response = (versions: unknown[]) => ({ apiVersion: 'apidiscovery.k8s.io/v2', kind: 'APIGroupDiscovery', metadata: { name: 'apps' }, versions });
const resource = { resource: 'deployments', scope: 'Namespaced', singularResource: 'deployment', responseKind: { group: 'apps', version: 'v1', kind: 'Deployment' }, verbs: ['get', 'list'], shortNames: ['deploy'], categories: ['all'], subresources: [{ subresource: 'scale', responseKind: { group: 'autoscaling', version: 'v1', kind: 'Scale' }, acceptedTypes: [{ group: 'autoscaling', version: 'v1', kind: 'Scale' }], verbs: ['get', 'update'] }] };

describe('aggregated discovery inspection', () => {
  it('keeps server preference order and stale capabilities without claiming current availability', () => {
    const result = inspectDiscovery(response([{ version: 'v1', freshness: 'Stale', resources: [resource] }, { version: 'v1beta1', resources: [] }]));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.groups[0].versions.map(item => item.version)).toEqual(['v1', 'v1beta1']);
    expect(result.groups[0].versions.map(item => item.freshness)).toEqual(['Stale', '']);
    expect(result.groups[0].versions[0].resources[0].subresources[0].acceptedTypes[0].group).toBe('autoscaling');
  });
  it('handles full inventories, core group, nullable kinds and absent optional collections', () => {
    const result = inspectDiscovery({ apiVersion: 'apidiscovery.k8s.io/v2beta1', kind: 'APIGroupDiscoveryList', items: [response([]), { metadata: { name: '' }, versions: [{ version: 'v1', resources: [{ resource: 'pods', scope: 'Namespaced', responseKind: null, verbs: null }] }] }] });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.groups.map(item => item.name)).toEqual(['apps', '']);
    const pod = result.groups[1].versions[0].resources[0];
    expect(pod.verbs).toEqual([]);
    expect(kindLabel(pod.responseKind)).toBe('No response kind advertised');
  });
  it('searches aliases and subresources without changing original inventory', () => {
    const result = inspectDiscovery(response([{ version: 'v1', resources: [resource, { ...resource, resource: 'statefulsets', singularResource: 'statefulset', responseKind: { group: 'apps', version: 'v1', kind: 'StatefulSet' }, shortNames: ['sts'], subresources: [] }] }]));
    if (!result.valid) throw new Error('Fixture invalid');
    const original = structuredClone(result.groups);
    expect(filterDiscovery(result.groups, 'deploy')[0].versions[0].resources.map(item => item.resource)).toEqual(['deployments']);
    expect(filterDiscovery(result.groups, 'scale')[0].versions[0].resources.map(item => item.resource)).toEqual(['deployments']);
    expect(filterDiscovery(result.groups, 'nothing')).toEqual([]);
    expect(result.groups[0].versions[0].resources).toHaveLength(2);
    expect(result.groups).toEqual(original);
    expect(filterDiscovery(result.groups, '')).toEqual(original);
    expect(filterDiscovery(result.groups, 'StatefulSet')[0].versions[0].resources.map(item => item.resource)).toEqual(['statefulsets']);
  });
  it('rejects malformed nested fields without echoing untrusted payload in errors', () => {
    const result = inspectDiscovery(response([{ version: 'v1', resources: [{ ...resource, verbs: ['get', { private: 'untrusted-content' }] }] }]));
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.message).toContain('Original source remains available');
    expect(result.message).not.toContain('untrusted-content');
  });
  it('retains future unknown fields without treating unknown freshness as Current', () => {
    const input = response([{ version: 'v1', freshness: 'Future', resources: [{ ...resource, futureField: { exact: 9007199254740993n } }] }]);
    const result = inspectDiscovery(input);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.groups[0].versions[0].freshness).toBe('Future');
    expect(input.versions[0]).toMatchObject({ resources: [{ futureField: { exact: 9007199254740993n } }] });
  });
  it('distinguishes empty inventory from malformed or unnegotiated representation', () => {
    expect(inspectDiscovery({ apiVersion: 'apidiscovery.k8s.io/v2', kind: 'APIGroupDiscoveryList', items: [] })).toEqual({ valid: true, groups: [] });
    expect(inspectDiscovery({ apiVersion: 'apidiscovery.k8s.io/v2', kind: 'APIGroupDiscoveryList' }).valid).toBe(false);
    expect(inspectDiscovery({ apiVersion: 'v1', kind: 'APIGroupList', groups: [] }).valid).toBe(false);
    expect(discoveryAccept('v2beta1')).toBe('application/json;g=apidiscovery.k8s.io;v=v2beta1;as=APIGroupDiscoveryList');
  });
});
