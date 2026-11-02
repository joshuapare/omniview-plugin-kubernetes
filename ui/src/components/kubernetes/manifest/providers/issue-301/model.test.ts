import { describe, expect, it } from 'vitest';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
import { moduleError, validate } from './model';
function draft(spec: unknown): ResourceEditorDraft {
  const root = { spec };
  return { sessionID: 'fixture', revision: 0, get(path) { return path.reduce<unknown>((node, part) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[part] : undefined, root); }, has(path) { return this.get(path) !== undefined; } };
}
describe('Wasm module integrity and attachment', () => {
  it('blocks conflicting OCI and explicit digests', () => {
    expect(moduleError(`oci://registry/module@sha256:${'a'.repeat(64)}`, 'b'.repeat(64))).toContain('must match');
    expect(moduleError(`oci://registry/module@sha256:${'a'.repeat(64)}`, 'a'.repeat(64))).toBeNull();
  });
  it('never accepts embedded HTTP authentication', () => {
    expect(moduleError('https://user:password@host/module.wasm', '')).not.toBeNull();
  });
  it('rejects mixed attachment and duplicate VM identifiers without echoing values', () => {
    const issues = validate(draft({ url: 'oci://registry/module:v1', selector: {}, targetRefs: [{ group: '', kind: 'Service', name: 'service' }], vmConfig: { env: [{ name: 'TOKEN', value: 'never-echo' }, { name: 'TOKEN', value: 'never-echo' }] } }));
    expect(issues.some(issue => issue.message.includes('not both'))).toBe(true);
    expect(issues.some(issue => issue.message.includes('unique'))).toBe(true);
    expect(JSON.stringify(issues)).not.toContain('never-echo');
  });
});
