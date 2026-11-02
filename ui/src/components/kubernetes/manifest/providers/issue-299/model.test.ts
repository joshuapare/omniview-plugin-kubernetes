import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { validate, unavailable } from './model';
function draft(spec: unknown): ResourceEditorDraft {
  const root = { spec };
  const get = (path: readonly (string | number)[]): unknown => path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined, root);
  return { sessionID: 'fixture', revision: 1, get, has: path => get(path) !== undefined };
}
const context = { kind: 'PeerAuthentication', discovery: { status: 'available', features: { 'istio.ambient': 'available' } } } as ResourceEditorContext;
describe('Istio security policy constraints', () => {
  it('rejects ambient DISABLE without blocking STRICT', () => {
    expect(validate(draft({ mtls: { mode: 'DISABLE' } }), context).map(issue => issue.message)).toContain('Ambient does not support DISABLE.');
    expect(validate(draft({ mtls: { mode: 'STRICT' } }), context)).toEqual([]);
  });
  it('requires workload selection and validates workload port bounds', () => {
    expect(validate(draft({ portLevelMtls: { '65536': { mode: 'STRICT' } } }), context)).toHaveLength(2);
    expect(validate(draft({ selector: { matchLabels: { app: 'api' } }, portLevelMtls: { '8080': { mode: 'STRICT' } } }), context)).toEqual([]);
  });
  it('does not equate missing JWT with failed authentication', () => {
    expect(validate(draft({ jwtRules: [] }), { ...context, kind: 'RequestAuthentication' })).toEqual([]);
  });
  it('rejects ambiguous JWKS sources and empty issuer', () => {
    expect(validate(draft({ jwtRules: [{ issuer: '', jwks: '{}', jwksUri: 'https://issuer.invalid/keys' }] }), { ...context, kind: 'RequestAuthentication' })).toHaveLength(2);
  });
  it('keeps malformed specs in source fallback', () => {
    expect(unavailable(draft('unsupported'))).not.toBeNull();
    expect(unavailable(draft({ futureField: { exact: '9007199254740993' } }))).toBeNull();
  });
});
