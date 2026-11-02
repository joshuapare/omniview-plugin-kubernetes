import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import { authoringReason, unsupportedShape, validCIDR, validatePolicy } from './model';
import { resourceEditors } from './index';
const context: ResourceEditorContext = {
  group: 'policy.networking.k8s.io', version: 'v1alpha1', kind: 'AdminNetworkPolicy', resource: 'adminnetworkpolicies', scope: 'Cluster', connectionID: 'fixture', intent: 'edit',
  ownership: { status: 'application' }, capabilities: { create: 'available', update: 'available', delete: 'unknown', list: 'available', get: 'available', actions: {} },
  discovery: { status: 'available', features: { 'admin-network-policy-enforcement': 'available' } }, schema: { status: 'available' },
};
const source = 'apiVersion: policy.networking.k8s.io/v1alpha1\nkind: AdminNetworkPolicy\nmetadata:\n  name: fixture-policy\nspec:\n  priority: 10 # precedence\n  future: 9007199254740993 # exact unknown\n  subject:\n    namespaces: {}\n  ingress:\n    - action: Pass\n      from:\n        - namespaces: {}\n';
describe('administrative policy safety', () => {
  it('keeps malformed peer unions and container scalars in source fallback', () => {
    const controller = new ResourceEditorController(source.replace('namespaces: {}', 'namespaces: wrong-shape'), 'shape');
    expect(unsupportedShape(controller.draft())).toContain('subject');
    expect(controller.getSource()).toContain('namespaces: wrong-shape');
    const valid = new ResourceEditorController(source, 'supported');
    expect(unsupportedShape(valid.draft())).toBeNull();
  });
  it('validates address families and prefix bounds without accepting mixed addresses', () => {
    expect(validCIDR('192.0.2.0/24')).toBe(true);
    expect(validCIDR('2001:db8::/32')).toBe(true);
    for (const value of ['192.0.2.0/33', '999.0.0.0/8', '::ffff:192.0.2.0/96', '2001::db8::/32', '2001:db8/32', '::/129']) expect(validCIDR(value)).toBe(false);
  });
  it('requires trusted enforcement beyond installed schema and verbs', () => {
    expect(authoringReason(context)).toBeNull();
    expect(authoringReason({ ...context, discovery: { status: 'available', features: {} } })).toContain('unconfirmed');
    expect(authoringReason({ ...context, ownership: { status: 'controller' } })).toContain('ownership');
    expect(authoringReason({ ...context, capabilities: { ...context.capabilities, update: 'denied' } })).toContain('permission');
  });
  it('changes priority without changing exact unknown values or comments', () => {
    const controller = new ResourceEditorController(source, 'anp');
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'priority'], value: 20 }] }, resourceEditors[0], context).status).toBe('accepted');
    expect(controller.draft().get(['spec', 'future'])).toBe(9007199254740993n);
    expect(controller.getSource()).toContain('# precedence');
    expect(controller.getSource()).toContain('# exact unknown');
    expect(validatePolicy(controller.draft(), context)).toEqual([]);
  });
  it('rejects baseline Pass and wrong singleton identity', () => {
    const controller = new ResourceEditorController(source, 'baseline');
    const issues = validatePolicy(controller.draft(), { ...context, kind: 'BaselineAdminNetworkPolicy' });
    expect(issues.some(issue => issue.path.join('.') === 'metadata.name')).toBe(true);
    expect(issues.some(issue => issue.path.join('.') === 'spec.ingress.0.action')).toBe(true);
  });
  it('rejects named-port node conflicts and unknown extended implementation support', () => {
    const controller = new ResourceEditorController(source + '  egress:\n    - action: Deny\n      to:\n        - nodes: {}\n      ports:\n        - namedPort: web\n', 'ports');
    const issues = validatePolicy(controller.draft(), context);
    expect(issues.some(issue => issue.message.includes('cannot target'))).toBe(true);
    expect(issues.some(issue => issue.message.includes('unconfirmed'))).toBe(true);
  });
});
