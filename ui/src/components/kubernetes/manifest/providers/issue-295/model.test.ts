import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { validate } from './model';
function draft(value: unknown): ResourceEditorDraft {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((node, key) => node !== null && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, value);
  return { sessionID: 'fixture', revision: 0, get, has: path => get(path) !== undefined };
}
const context = (kind: string) => ({ kind } as ResourceEditorContext);
describe('Experimental Gateway semantics', () => {
  it('rejects permanent session cookies without absolute timeout', () => {
    const value = draft({ spec: { targetRefs: [{ group: '', kind: 'Service', name: 'backend' }], sessionPersistence: { type: 'Cookie', cookieConfig: { lifetimeType: 'Permanent' } } } });
    expect(validate(value, context('XBackendTrafficPolicy')).map(issue => issue.path.join('.'))).toContain('spec.sessionPersistence.absoluteTimeout');
  });
  it('accepts omitted dynamic listener ports', () => {
    expect(validate(draft({ spec: { parentRef: { name: 'edge' }, listeners: [{ name: 'http', protocol: 'HTTP' }] } }), context('XListenerSet'))).toEqual([]);
  });
  it('rejects duplicate listener names and TCP hostnames', () => {
    const issues = validate(draft({ spec: { parentRef: { name: 'edge' }, listeners: [{ name: 'same', protocol: 'HTTP' }, { name: 'same', protocol: 'TCP', hostname: 'example.test' }] } }), context('XListenerSet'));
    expect(issues.map(issue => issue.path.join('.'))).toEqual(['spec.listeners.1.name', 'spec.listeners.1.hostname']);
  });
  it('requires a domain-prefixed mesh controller and bounded description', () => {
    expect(validate(draft({ spec: { controllerName: 'unqualified', description: 'x'.repeat(65) } }), context('XMesh'))).toHaveLength(2);
    expect(validate(draft({ spec: { controllerName: 'mesh.example.test/controller' } }), context('XMesh'))).toEqual([]);
  });
});
