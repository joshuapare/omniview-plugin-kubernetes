import type { ResourceEditorContext } from '@omniviewdev/runtime';
import { describe, expect, it } from 'vitest';

import { ResourceEditorController } from '../../resourceEditorController';

import { discoveryQuery, validateDiscoveryQuery } from './request';

import { resourceEditors } from './index';

const source = `apiVersion: apidiscovery.k8s.io/v2
kind: APIGroupDiscovery
metadata: {name: apps}
versions:
  - version: v1
    freshness: Current
    resources: []
future: 9007199254740993 # Keep exact server sibling.
`;
const context: ResourceEditorContext = {
  group: 'apidiscovery.k8s.io', version: 'v2', kind: 'APIGroupDiscovery', resource: '', scope: 'Cluster', connectionID: 'fixture', intent: 'action',
  capabilities: { create: 'absent', update: 'absent', delete: 'absent', get: 'absent', list: 'absent', actions: { 'kubernetes.discovery.v1': 'available' } },
  discovery: { status: 'available', features: {} }, schema: { status: 'unknown' },
};

describe('canonical discovery query settings', () => {
  it('patches only query leaves while keeping response fields, wide numbers and comments', () => {
    const controller = new ResourceEditorController(source, 'query');
    const result = controller.patch({ sessionID: 'query', expectedRevision: 0, operations: [{ op: 'set', path: ['query', 'endpoint'], value: '/api' }, { op: 'set', path: ['query', 'version'], value: 'v2beta1' }] }, resourceEditors[1], context);
    expect(result.status).toBe('accepted');
    expect(controller.getSource()).toContain('9007199254740993 # Keep exact server sibling.');
    expect(controller.draft().get(['versions', 0, 'freshness'])).toBe('Current');
    expect(discoveryQuery(controller.draft(), context)).toEqual({ endpoint: '/api', version: 'v2beta1' });
  });
  it('rejects response ownership violations atomically instead of accepting query and replacing server content', () => {
    const controller = new ResourceEditorController(source, 'query');
    const result = controller.patch({ sessionID: 'query', expectedRevision: 0, operations: [{ op: 'set', path: ['query', 'endpoint'], value: '/api' }, { op: 'set', path: ['versions', 0, 'freshness'], value: 'Current' }] }, resourceEditors[1], context);
    expect(result.status).toBe('forbidden');
    expect(controller.getSource()).toBe(source);
  });
  it('rejects stale query choices and keeps inspection fully read-only', () => {
    const controller = new ResourceEditorController(source, 'query');
    controller.invalidate();
    expect(controller.patch({ sessionID: 'query', expectedRevision: 0, operations: [{ op: 'set', path: ['query', 'version'], value: 'v2beta1' }] }, resourceEditors[1], context).status).toBe('stale');
    expect(controller.patch({ sessionID: 'query', expectedRevision: controller.revision, operations: [{ op: 'set', path: ['query', 'endpoint'], value: '/api' }] }, resourceEditors[0], { ...context, intent: 'inspect' }).status).toBe('forbidden');
    expect(controller.getSource()).toBe(source);
  });
  it('reports non-scalar query settings without coercing null-prototype projections or destroying source', () => {
    const invalidSource = `${source}query:\n  endpoint: {unexpected: shape}\n  version: [v2]\n`;
    const controller = new ResourceEditorController(invalidSource, 'invalid-query');
    expect(validateDiscoveryQuery(controller.draft())).toEqual([
      { path: ['query', 'endpoint'], message: 'Choose /api or /apis.' },
      { path: ['query', 'version'], message: 'Choose v2 or v2beta1.' },
    ]);
    expect(controller.getSource()).toBe(invalidSource);
  });
  it('defaults omitted core group name to /api without mistaking a full list for core discovery', () => {
    const core = new ResourceEditorController('apiVersion: apidiscovery.k8s.io/v2\nkind: APIGroupDiscovery\nversions: []\n');
    const inventory = new ResourceEditorController('apiVersion: apidiscovery.k8s.io/v2\nkind: APIGroupDiscoveryList\nitems: []\n');
    expect(discoveryQuery(core.draft(), context).endpoint).toBe('/api');
    expect(discoveryQuery(inventory.draft(), context).endpoint).toBe('/apis');
  });
});
