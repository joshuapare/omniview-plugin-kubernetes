import { describe, expect, it } from 'vitest';
import { ResourceEditorController } from '../../resourceEditorController';
import type { ResourceEditorPatch } from '@omniviewdev/runtime';
import { annotationPath, formUnavailable, ownership, parseInt32, parseTokens, protectedPolicy, responseChanges, subjectChanges, validate } from './domain';
import { exemptSource, fixtureContext, flowSource, prioritySource } from './fixtures';
import { resourceEditors } from './index';

function apply(controller: ResourceEditorController, operations: readonly ResourceEditorPatch[] | string, priority = false) {
  if (typeof operations === 'string') throw new Error(operations);
  return controller.patch({ sessionID: controller.sessionID, expectedRevision: controller.revision, operations }, resourceEditors[priority ? 1 : 0], fixtureContext(priority ? 'PriorityLevelConfiguration' : 'FlowSchema'));
}
describe('APF domain behavior through canonical controller', () => {
  it('keeps omitted integers distinct from zero and rejects partial or unsafe integer text', () => {
    expect(parseInt32('')).toBeNull();
    expect(parseInt32('0')).toBe(0);
    expect(parseInt32('-')).toBe('Enter a whole number.');
    expect(parseInt32('9007199254740993')).toBe('Use 0–2147483647.');
    expect(parseTokens('"", apps', true)).toEqual(['', 'apps']);
    expect(parseTokens('apps,', true)).toMatch(/empty entries/);
    expect(parseTokens('*, apps')).toBe('Use * alone.');
  });
  it('edits one matching group without flattening other groups, comments, or exact integers', () => {
    const controller = new ResourceEditorController(flowSource);
    expect(validate(controller.draft(), fixtureContext('FlowSchema'))).toEqual([]);
    expect(apply(controller, [{ op: 'set', path: ['spec', 'rules', 0, 'resourceRules', 0, 'verbs'], value: ['get', 'watch'] }]).status).toBe('accepted');
    expect(controller.draft().get(['spec', 'rules', 1, 'nonResourceRules', 0, 'nonResourceURLs'])).toEqual(['/healthz', '/readyz/*']);
    expect(controller.draft().get(['spec', 'vendor', 'exact'])).toBe(9007199254740993n);
    expect(controller.getSource()).toContain('# keep exact unknown');
    expect(controller.getSource()).toContain('# keep annotation');
    expect(controller.getSource()).toContain('# keep precedence');
  });
  it('switches overload response atomically and restores only known queue leaves', () => {
    const controller = new ResourceEditorController(prioritySource);
    expect(validate(controller.draft(), fixtureContext('PriorityLevelConfiguration'))).toEqual([]);
    expect(apply(controller, responseChanges(controller.draft(), 'Reject'), true).status).toBe('accepted');
    expect(controller.draft().has(['spec', 'limited', 'limitResponse', 'queuing'])).toBe(false);
    expect(controller.draft().get(['spec', 'limited', 'vendor', 'exact'])).toBe(9007199254740993n);
    expect(apply(controller, responseChanges(controller.draft(), 'Queue', { queues: 64n, handSize: 8n, queueLengthLimit: 50n }), true).status).toBe('accepted');
    expect(controller.draft().get(['spec', 'limited', 'limitResponse', 'queuing', 'handSize'])).toBe(8n);
    expect(controller.getSource()).toContain('# keep shares');
    expect(validate(controller.draft(), fixtureContext('PriorityLevelConfiguration'))).toEqual([]);
  });
  it('blocks destructive branch changes when an unsupported child would be lost', () => {
    const controller = new ResourceEditorController(prioritySource.replace('queues: 64', 'queues: 64\n        futurePolicy: preserve'));
    const original = controller.getSource();
    expect(responseChanges(controller.draft(), 'Reject')).toMatch(/unsupported fields/);
    expect(controller.getSource()).toBe(original);
    const flow = new ResourceEditorController(flowSource.replace('name: engineering', 'name: engineering\n            futureField: preserve'));
    expect(subjectChanges(flow.draft(), ['spec', 'rules', 0, 'subjects', 0], 'User')).toMatch(/unsupported fields/);
  });
  it('protects mandatory FlowSchemas and permits only exempt priority tuning', () => {
    const flow = new ResourceEditorController(flowSource.replace('name: tenant-routing', 'name: exempt'));
    expect(protectedPolicy(flow.draft(), fixtureContext('FlowSchema'))).toBe(true);
    expect(apply(flow, [{ op: 'set', path: ['spec', 'matchingPrecedence'], value: 20 }]).status).toBe('forbidden');
    const exempt = new ResourceEditorController(exemptSource);
    expect(protectedPolicy(exempt.draft(), fixtureContext('PriorityLevelConfiguration'))).toBe(false);
    expect(apply(exempt, [{ op: 'set', path: ['spec', 'exempt', 'lendablePercent'], value: 25 }], true).status).toBe('accepted');
    expect(validate(exempt.draft(), fixtureContext('PriorityLevelConfiguration'))).toEqual([]);
    expect(formUnavailable(exempt.draft(), fixtureContext('PriorityLevelConfiguration', 'create'))).toMatch(/server-managed/);
  });
  it('classifies exact suggested names and requires explicit reconciliation opt-out', () => {
    const suggested = new ResourceEditorController(flowSource.replace('name: tenant-routing', 'name: system-nodes'));
    expect(ownership(suggested.draft(), fixtureContext('FlowSchema'))).toBe('suggested');
    expect(validate(suggested.draft(), fixtureContext('FlowSchema'))[0].message).toMatch(/Opt out/);
    expect(apply(suggested, [{ op: 'set', path: annotationPath, value: 'false' }]).status).toBe('accepted');
    expect(validate(suggested.draft(), fixtureContext('FlowSchema'))).toEqual([]);
    const custom = new ResourceEditorController(flowSource.replace('name: tenant-routing', 'name: constructor'));
    expect(ownership(custom.draft(), fixtureContext('FlowSchema'))).toBe('administrator');
    expect(protectedPolicy(custom.draft(), { ...fixtureContext('FlowSchema'), ownership: { status: 'controller' } })).toBe(true);
  });
  it('validates namespace-less matching and queue hand bounds using exact parsed integers', () => {
    const flow = new ResourceEditorController(flowSource.replace('namespaces: [team-a]', 'namespaces: []'));
    expect(validate(flow.draft(), fixtureContext('FlowSchema')).some(issue => issue.path.at(-1) === 'namespaces')).toBe(true);
    apply(flow, [{ op: 'set', path: ['spec', 'rules', 0, 'resourceRules', 0, 'clusterScope'], value: true }]);
    expect(validate(flow.draft(), fixtureContext('FlowSchema'))).toEqual([]);
    const priority = new ResourceEditorController(prioritySource.replace('queues: 64', 'queues: 4'));
    expect(validate(priority.draft(), fixtureContext('PriorityLevelConfiguration')).some(issue => issue.message.includes('Hand size'))).toBe(true);
    const malformed = new ResourceEditorController(flowSource.replace('verbs: [get, list]', 'verbs: 12'));
    expect(formUnavailable(malformed.draft(), fixtureContext('FlowSchema'))).toMatch(/Unsupported match list/);
  });
});
