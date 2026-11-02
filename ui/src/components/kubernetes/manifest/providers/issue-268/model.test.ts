import { describe, expect, it } from 'vitest';
import { ResourceEditorController } from '../../resourceEditorController';
import { resourceEditors } from './index';
import { hpaFixture, hpaFixtureContext, hpaV1Fixture } from './fixtures';
import { hpaReadOnly, hpaUnavailable, parseInteger, sourceChange, targetChange, validQuantity, validateHPA } from './model';

const contribution = resourceEditors[0];
describe('HorizontalPodAutoscaler domain behavior', () => {
  it('preserves unknown integers, comments, selectors and unedited metric siblings', () => {
    const controller = new ResourceEditorController(hpaFixture, 'hpa-test');
    const metric = controller.draft().get(['spec', 'metrics', 1]);
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'maxReplicas'], value: 20 }] }, contribution, hpaFixtureContext).status).toBe('accepted');
    expect(controller.getSource()).toContain('# capacity ceiling');
    expect(controller.getSource()).toContain('# retain exact vendor data');
    expect(controller.draft().get(['spec', 'vendor', 'exact'])).toBe(9007199254740993n);
    expect(controller.draft().get(['spec', 'metrics', 1])).toEqual(metric);
  });
  it('switches only the selected metric branch atomically', () => {
    const controller = new ResourceEditorController(hpaFixture, 'hpa-branch');
    const external = controller.draft().get(['spec', 'metrics', 1]);
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: sourceChange(0, 'ContainerResource') }, contribution, hpaFixtureContext).status).toBe('accepted');
    expect(controller.draft().has(['spec', 'metrics', 0, 'resource'])).toBe(false);
    expect(controller.draft().get(['spec', 'metrics', 0, 'type'])).toBe('ContainerResource');
    expect(controller.draft().get(['spec', 'metrics', 1])).toEqual(external);
  });
  it('switches target measures without copying or deleting unknown target siblings', () => {
    const source = hpaFixture.replace('averageUtilization: 70', 'averageUtilization: 70\n          vendorLimit: 9007199254740993');
    const controller = new ResourceEditorController(source, 'hpa-target');
    const target = ['spec', 'metrics', 0, 'resource', 'target'];
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: targetChange(target, 'AverageValue') }, contribution, hpaFixtureContext).status).toBe('accepted');
    expect(controller.draft().has([...target, 'averageUtilization'])).toBe(false);
    expect(controller.draft().get([...target, 'vendorLimit'])).toBe(9007199254740993n);
  });
  it('requires both verified zero gate and Object or External metric', () => {
    const controller = new ResourceEditorController(hpaFixture.replace('minReplicas: 2', 'minReplicas: 0'));
    expect(validateHPA(controller.draft(), hpaFixtureContext).some(issue => issue.message.includes('Zero requires'))).toBe(true);
    const context = { ...hpaFixtureContext, discovery: { status: 'available' as const, features: { HPAScaleToZero: 'available' as const } } };
    expect(validateHPA(controller.draft(), context)).toEqual([]);
    controller.syncSource(controller.getSource().replace('type: External', 'type: Pods').replace('external:', 'pods:'));
    expect(validateHPA(controller.draft(), context).some(issue => issue.message.includes('Zero requires'))).toBe(true);
  });
  it('enforces bounds and each policy time range', () => {
    const controller = new ResourceEditorController(hpaFixture.replace('minReplicas: 2', 'minReplicas: 13').replace('periodSeconds: 60', 'periodSeconds: 1801'));
    expect(validateHPA(controller.draft(), hpaFixtureContext).map(issue => issue.path.join('.'))).toEqual(expect.arrayContaining(['spec.maxReplicas', 'spec.behavior.scaleDown.policies.0.periodSeconds']));
    expect(parseInteger('2147483648')).toBeNull();
    expect(parseInteger('9007199254740993')).toBeNull();
    expect(parseInteger('1e3')).toBeNull();
  });
  it('keeps exact quantity spelling and rejects partial or nonpositive quantities', () => {
    for (const value of ['9007199254740993m', '1e3', '1Gi', '.25', '1E']) expect(validQuantity(value)).toBe(true);
    for (const value of ['0', '1e', '-1', '1GiB', '']) expect(validQuantity(value)).toBe(false);
    expect(validQuantity('0', true)).toBe(true);
  });
  it('locks controller-owned, trusted system ownership and unavailable update', () => {
    const source = hpaFixture.replace('spec:\n', '  ownerReferences:\n    - apiVersion: keda.sh/v1alpha1\n      kind: ScaledObject\n      name: upstream\n      controller: true\nspec:\n');
    const managed = new ResourceEditorController(source);
    expect(hpaReadOnly(managed.draft(), hpaFixtureContext)).toBe(true);
    expect(hpaReadOnly(new ResourceEditorController(hpaFixture).draft(), { ...hpaFixtureContext, ownership: { status: 'system' } })).toBe(true);
    expect(hpaReadOnly(new ResourceEditorController(hpaFixture).draft(), { ...hpaFixtureContext, capabilities: { ...hpaFixtureContext.capabilities, update: 'unknown' } })).toBe(true);
  });
  it('never grants a status patch and rejects stale callbacks', () => {
    const controller = new ResourceEditorController(hpaFixture, 'hpa-status');
    const request = { sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set' as const, path: ['status', 'desiredReplicas'], value: 10 }] };
    expect(controller.patch(request, contribution, hpaFixtureContext).status).toBe('forbidden');
    controller.invalidate();
    expect(controller.patch(request, contribution, hpaFixtureContext).status).toBe('stale');
  });
  it('retains unsupported source through honest fallback and keeps v1 CPU distinct', () => {
    const unsupported = new ResourceEditorController(hpaFixture.replace('type: Resource', 'type: FutureMetric'));
    const before = unsupported.getSource();
    expect(hpaUnavailable(unsupported.draft(), hpaFixtureContext)).toContain('Unsupported metric');
    expect(unsupported.getSource()).toBe(before);
    expect(validateHPA(new ResourceEditorController(hpaV1Fixture).draft(), { ...hpaFixtureContext, version: 'v1' })).toEqual([]);
  });
});
