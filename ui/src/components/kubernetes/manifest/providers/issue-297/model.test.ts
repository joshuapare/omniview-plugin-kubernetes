import { describe, expect, it } from 'vitest';
import { observedState, scalar, items } from './model';
import { ResourceEditorController } from '../../resourceEditorController';
import { resourceEditors } from './index';

describe('ACME lifecycle safety', () => {
  it('does not infer success from arbitrary controller state', () => {
    expect(observedState('certificate-issued')).toBe('Unknown');
    expect(observedState('pending')).toBe('pending');
    expect(observedState(undefined)).toBe('Unknown');
  });
  it('does not stringify opaque values or coerce omitted boolean observations', () => {
    expect(scalar(Object.create(null))).toBe('Not observed');
    expect(scalar(undefined)).toBe('Not observed');
    expect(scalar(false)).toBe('No');
    expect(items([null, 'token', { identifier: 'example.test' }])).toEqual([{ identifier: 'example.test' }]);
  });
  it('keeps authorization facts while withholding credential and endpoint values', () => {
    const controller = new ResourceEditorController('apiVersion: acme.cert-manager.io/v1\nkind: Order\nspec:\n  request: PRIVATE\nstatus:\n  authorizations:\n    - identifier: example.test\n      url: PRIVATE\n      challenges:\n        - type: dns-01\n          token: PRIVATE\n          url: PRIVATE\n');
    const draft = controller.draft(resourceEditors[0].sensitivePaths);
    expect(draft.get(['status', 'authorizations', 0, 'identifier'])).toBe('example.test');
    expect(draft.get(['status', 'authorizations', 0, 'challenges', 0, 'type'])).toBe('dns-01');
    expect(scalar(draft.get(['spec', 'request']))).toBe('Not observed');
    expect(scalar(draft.get(['status', 'authorizations', 0, 'challenges', 0, 'token']))).toBe('Not observed');
  });
  it('rejects orphan lifecycle writes without changing canonical comments or wide integers', () => {
    const source = '# keep\napiVersion: acme.cert-manager.io/v1\nkind: Challenge\nspec:\n  dnsName: example.test\nunknown: 9007199254740993\n';
    const controller = new ResourceEditorController(source);
    const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'dnsName'], value: 'changed.test' }] }, resourceEditors[1], {
      ...resourceEditors[1].targets[0], intent: 'edit', connectionID: 'fixture', ownership: { status: 'unknown' },
      capabilities: { create: 'available', update: 'available', delete: 'available', get: 'available', list: 'available', actions: {} },
      discovery: { status: 'available', features: {} }, schema: { status: 'available' },
    });
    expect(result.status).toBe('forbidden');
    expect(controller.getSource()).toBe(source);
  });
});
