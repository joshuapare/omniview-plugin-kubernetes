import type { ResourceEditorContext } from '@omniviewdev/runtime';

import { describe, expect, it } from 'vitest';

import { ResourceEditorController } from '../../resourceEditorController';

import { budgetOperations, matchesSelector, parseBudget, policyFormUnavailable, policyReadOnly, selectionOperations, selectorMode, statusIsCurrent, validatePolicy, validLabelKey, validLabelValue } from './policy';

import { resourceEditors } from './index';

const contribution = resourceEditors[0];
const context: ResourceEditorContext = {
  group: 'policy', version: 'v1', kind: 'PodDisruptionBudget', resource: 'poddisruptionbudgets', scope: 'Namespaced',
  connectionID: 'fixture', namespace: 'sandbox', intent: 'edit',
  capabilities: { create: 'available', update: 'available', delete: 'unknown', get: 'available', list: 'available', actions: {} },
  discovery: { status: 'available', features: {} }, schema: { status: 'available' },
};
const initial = 'apiVersion: policy/v1\nkind: PodDisruptionBudget\nmetadata:\n  name: worker-budget\n  namespace: sandbox\n  generation: 9007199254740993\nspec:\n  minAvailable: 2 # preserve budget comment\n  selector:\n    matchLabels: {app: worker}\n  futureOption: 9007199254740995 # preserve unknown exact integer\nstatus:\n  observedGeneration: 9007199254740992\n';

describe('PodDisruptionBudget policy behavior', () => {
  it('keeps percent strings distinct from exact pod counts and rejects partial or out-of-range values', () => {
    expect(parseBudget('0', 'pods')).toEqual({ valid: true, value: 0n });
    expect(parseBudget('30', 'percent')).toEqual({ valid: true, value: '30%' });
    expect(parseBudget('', 'pods').valid).toBe(false);
    expect(parseBudget('1.5', 'pods').valid).toBe(false);
    expect(parseBudget('-1', 'pods').valid).toBe(false);
    expect(parseBudget('101', 'percent').valid).toBe(false);
    expect(parseBudget('2147483648', 'pods').valid).toBe(false);
  });
  it('switches exclusive budget rules atomically without rewriting unknown siblings', () => {
    const controller = new ResourceEditorController(initial, 'policy-switch');
    const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: budgetOperations('maxUnavailable', '25%') }, contribution, context);
    expect(result.status).toBe('accepted');
    expect(controller.draft().has(['spec', 'minAvailable'])).toBe(false);
    expect(controller.draft().get(['spec', 'maxUnavailable'])).toBe('25%');
    expect(controller.draft().get(['spec', 'futureOption'])).toBe(9007199254740995n);
    expect(controller.getSource()).toContain('# preserve unknown exact integer');
    expect(controller.draft().get(['metadata', 'generation'])).toBe(9007199254740993n);
  });
  it('guards stale updates without losing the current budget', () => {
    const controller = new ResourceEditorController(initial, 'policy-stale');
    controller.syncSource(initial.replace('minAvailable: 2', 'minAvailable: 3'));
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: budgetOperations('maxUnavailable', 1n) }, contribution, context).status).toBe('stale');
    expect(controller.draft().get(['spec', 'minAvailable'])).toBe(3n);
  });
  it('distinguishes empty, null and omitted selectors and does not turn NotIn into In', () => {
    const controller = new ResourceEditorController(initial);
    expect(selectorMode(controller.draft())).toBe('labels');
    controller.syncSource(initial.replace('selector:\n    matchLabels: {app: worker}', 'selector: {}'));
    expect(selectorMode(controller.draft())).toBe('all');
    expect(matchesSelector({ app: 'worker' }, {})).toBe(true);
    controller.syncSource(initial.replace('selector:\n    matchLabels: {app: worker}', 'selector: null'));
    expect(selectorMode(controller.draft())).toBe('none');
    expect(matchesSelector({ app: 'worker' }, null)).toBe(false);
    controller.syncSource(initial.replace('  selector:\n    matchLabels: {app: worker}\n', ''));
    expect(selectorMode(controller.draft())).toBe('omitted');
    expect(matchesSelector({}, { matchExpressions: [{ key: 'tier', operator: 'NotIn', values: ['batch'] }] })).toBe(true);
    expect(matchesSelector({ tier: 'batch' }, { matchExpressions: [{ key: 'tier', operator: 'NotIn', values: ['batch'] }] })).toBe(false);
    expect(matchesSelector({}, { matchExpressions: [{ key: 'tier', operator: 'Exists' }] })).toBe(false);
  });
  it('applies explicit selector scope transitions without treating omitted map keys as deletions', () => {
    const controller = new ResourceEditorController(initial.replace('matchLabels: {app: worker}', 'matchLabels: {app: worker}\n    matchExpressions: [{key: zone, operator: In, values: [west]}]'));
    for (const mode of ['all', 'none', 'all', 'omitted'] as const) {
      const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: controller.revision, operations: selectionOperations(controller.draft(), mode) }, contribution, context);
      expect(result.status).toBe('accepted');
      expect(selectorMode(controller.draft())).toBe(mode);
      expect(controller.draft().get(['spec', 'futureOption'])).toBe(9007199254740995n);
      expect(controller.draft().get(['spec', 'minAvailable'])).toBe(2n);
      expect(controller.getSource()).toContain('# preserve budget comment');
      expect(controller.getSource()).toContain('# preserve unknown exact integer');
    }
  });
  it('preserves row siblings and comments through a leaf edit and expression insertion', () => {
    const controller = new ResourceEditorController(initial.replace('matchLabels: {app: worker}', 'matchLabels: {app: worker, track: stable}\n    matchExpressions:\n      - key: zone # retain row comment\n        operator: In\n        values: [west]'));
    const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [
      { op: 'set', path: ['spec', 'selector', 'matchExpressions', 0, 'key'], value: 'region' },
      { op: 'insert', path: ['spec', 'selector', 'matchExpressions'], index: 1, value: { key: 'paused', operator: 'DoesNotExist' } },
    ] }, contribution, context);
    expect(result.status).toBe('accepted');
    expect(controller.draft().get(['spec', 'selector', 'matchLabels', 'track'])).toBe('stable');
    expect(controller.draft().get(['spec', 'selector', 'matchExpressions', 0, 'values', 0])).toBe('west');
    expect(controller.getSource()).toContain('# retain row comment');
    expect(controller.draft().has(['spec', 'selector', 'matchExpressions', 1, 'values'])).toBe(false);
  });
  it('keeps future owned shapes in lossless fallback but permits unknown unowned siblings', () => {
    const controller = new ResourceEditorController(initial);
    expect(policyFormUnavailable(controller.draft(), context)).toBeNull();
    controller.syncSource(initial.replace('matchLabels: {app: worker}', 'futureSelector: true'));
    expect(policyFormUnavailable(controller.draft(), context)).toContain('Unsupported selector');
    expect(controller.getSource()).toContain('futureSelector: true');
    expect(policyFormUnavailable(controller.draft(), { ...context, discovery: { status: 'unknown', features: {} } })).toContain('discovery');
  });
  it('locks controller-owned and denied edits without allowing status mutation', () => {
    const controller = new ResourceEditorController(initial);
    expect(policyReadOnly(controller.draft(), context)).toBe(false);
    expect(policyReadOnly(controller.draft(), { ...context, ownership: { status: 'controller' } })).toBe(true);
    expect(policyReadOnly(controller.draft(), { ...context, capabilities: { ...context.capabilities, update: 'unknown' } })).toBe(true);
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['status', 'disruptionsAllowed'], value: 8n }] }, contribution, context).status).toBe('forbidden');
  });
  it('compares generation exactly and validates selector operator value constraints', () => {
    const controller = new ResourceEditorController(initial);
    expect(statusIsCurrent(controller.draft())).toBe(false);
    controller.syncSource(initial.replace('observedGeneration: 9007199254740992', 'observedGeneration: 9007199254740993'));
    expect(statusIsCurrent(controller.draft())).toBe(true);
    controller.syncSource(initial.replace('matchLabels: {app: worker}', 'matchExpressions: [{key: app, operator: Exists, values: [worker]}]'));
    expect(validatePolicy(controller.draft()).some(issue => issue.message.includes('omit values'))).toBe(true);
    expect(validLabelKey('example.org/application')).toBe(true);
    expect(validLabelKey('Bad_Prefix/application')).toBe(false);
    expect(validLabelValue('')).toBe(true);
    expect(validLabelValue('bad value')).toBe(false);
  });
});
