import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import { boundedInteger, encodeCABytes, groupError, localOperations, ownershipReason, target, trustOperations, unsupportedShape, validateAPIService } from './apiService';
import { resourceEditors } from './index';

export const context: ResourceEditorContext = { ...target, connectionID: 'fixture-only', intent: 'edit', capabilities: { create: 'available', update: 'available', delete: 'denied', get: 'available', list: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } };
const source = `apiVersion: apiregistration.k8s.io/v1
kind: APIService
metadata:
  name: v1.widgets.example.test
  annotations:
    exact-number: 9007199254740993
spec:
  group: widgets.example.test
  version: v1
  groupPriorityMinimum: 20000 # rank comment
  versionPriority: 1000
  service:
    namespace: extensions
    name: widgets
    port: 443
  caBundle: Zml4dHVyZS1vbmx5
  unknown: {enabled: true}
`;
const contribution = resourceEditors[0];
function apply(controller: ResourceEditorController, operations: Parameters<ResourceEditorController['patch']>[0]['operations']) {
  return controller.patch({ sessionID: controller.sessionID, expectedRevision: controller.revision, operations }, contribution, context);
}

describe('APIService registration safety', () => {
  it('accepts inclusive server bounds without unsafe number coercion', () => {
    expect(boundedInteger('20000', 1, 20000)).toEqual({ value: 20000, error: null });
    expect(boundedInteger('1000', 1, 1000).error).toBeNull();
    expect(boundedInteger('20001', 1, 20000).error).not.toBeNull();
    expect(boundedInteger('9007199254740993', 1, 20000).error).not.toBeNull();
    expect(boundedInteger('1.0', 1, 1000).error).not.toBeNull();
    expect(boundedInteger('', 1, 65535, true)).toEqual({ error: null });
    expect(groupError('', 'v1')).toBeNull();
    expect(groupError('', 'v2')).not.toBeNull();
  });
  it('patches priorities without rewriting CA, comments, unknown siblings or wide integers', () => {
    const controller = new ResourceEditorController(source, 'priority');
    expect(apply(controller, [{ op: 'set', path: ['spec', 'versionPriority'], value: 42 }]).status).toBe('accepted');
    expect(controller.getSource()).toContain('20000 # rank comment');
    expect(controller.getSource()).toContain('9007199254740993');
    expect(controller.getSource()).toContain('caBundle: Zml4dHVyZS1vbmx5');
    expect(controller.draft().get(['spec', 'unknown', 'enabled'])).toBe(true);
  });
  it('switches remote registration to local atomically without hidden TLS fields', () => {
    const controller = new ResourceEditorController(source, 'local');
    expect(apply(controller, localOperations()).status).toBe('accepted');
    expect(controller.draft().has(['spec', 'service'])).toBe(false);
    expect(controller.draft().has(['spec', 'caBundle'])).toBe(false);
    expect(controller.draft().has(['spec', 'insecureSkipTLSVerify'])).toBe(false);
    expect(validateAPIService(controller.draft(), context)).toEqual([]);
    expect(controller.getSource()).toContain('9007199254740993');
  });
  it('changes trust only through explicit CA removal and keeps existing bytes otherwise', () => {
    const controller = new ResourceEditorController(source, 'trust');
    const projected = controller.draft(contribution.sensitivePaths);
    expect(typeof projected.get(['spec', 'caBundle'])).toBe('object');
    expect(apply(controller, trustOperations('insecure')).status).toBe('accepted');
    expect(controller.draft().has(['spec', 'caBundle'])).toBe(false);
    expect(controller.draft().get(['spec', 'insecureSkipTLSVerify'])).toBe(true);
    expect(validateAPIService(controller.draft(), context)).toEqual([]);
    expect(encodeCABytes(new Uint8Array([0, 255, 13, 10]))).toBe('AP8NCg==');
  });
  it('blocks auto-managed and controller-owned registrations without assuming all objects are managed', () => {
    for (const mode of ['true', 'onstart']) {
      const controller = new ResourceEditorController(source.replace('  annotations:', `  labels: {kube-aggregator.kubernetes.io/automanaged: "${mode}"}\n  annotations:`), `managed-${mode}`);
      expect(ownershipReason(controller.draft())).not.toBeNull();
      expect(apply(controller, [{ op: 'set', path: ['spec', 'versionPriority'], value: 20 }]).status).toBe('forbidden');
    }
    const controller = new ResourceEditorController(source, 'unmanaged');
    expect(ownershipReason(controller.draft())).toBeNull();
    expect(contribution.readOnly?.(controller.draft(), { ...context, ownership: { status: 'system' } })).toBe(true);
  });
  it('retains unsupported Service shapes and distinguishes invalid local TLS configuration', () => {
    const controller = new ResourceEditorController(source.replace('    port: 443', '    port: 443\n    extension: {retain: true}'), 'unsupported');
    expect(unsupportedShape(controller.draft())).not.toBeNull();
    const local = new ResourceEditorController(source.replace('  service:\n    namespace: extensions\n    name: widgets\n    port: 443\n', ''), 'invalid-local');
    expect(validateAPIService(local.draft(), context).some(issue => issue.path.join('.') === 'spec.service')).toBe(true);
  });
});
