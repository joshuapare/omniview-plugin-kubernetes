import { describe, expect, it } from 'vitest';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
import { certificateIssues, durationSeconds, issuerIssues } from './domain';
function draft(spec: unknown): ResourceEditorDraft {
  const root = { spec };
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, root);
  return { sessionID: 'test', revision: 1, get, has: path => get(path) !== undefined };
}
const certificate = { secretName: 'output', issuerRef: { name: 'issuer' }, dnsNames: ['fixture.invalid'] };
describe('Certificate issuance validation', () => {
  it('accepts compound and fractional Go durations, not day syntax', () => {
    expect(durationSeconds('1h30m')).toBe(5400);
    expect(durationSeconds('.5h')).toBe(1800);
    expect(durationSeconds('90d')).toBeNull();
    expect(durationSeconds('1hgarbage')).toBeNull();
  });
  it('preserves omitted controller policy without forcing defaults', () => {
    const spec = { ...certificate, privateKey: { algorithm: 'Ed25519' } };
    expect(certificateIssues(draft(spec))).toEqual([]);
    expect(spec).not.toHaveProperty('duration');
  });
  it('preserves Ed25519 size even though the controller ignores it', () => {
    expect(certificateIssues(draft({ ...certificate, privateKey: { algorithm: 'Ed25519', size: 2048 } }))).toEqual([]);
  });
  it('rejects mutually exclusive renewal policies and too-small effective window', () => {
    expect(certificateIssues(draft({ ...certificate, duration: '1h', renewBefore: '10m', renewBeforePercentage: 1 })).map(issue => issue.path.join('.'))).toEqual(['spec.renewBefore', 'spec.renewBeforePercentage']);
  });
  it('rejects incompatible subject and algorithm-size settings', () => {
    const issues = certificateIssues(draft({ ...certificate, commonName: 'fixture.invalid', literalSubject: 'CN=fixture.invalid', privateKey: { algorithm: 'ECDSA', size: 2048 } }));
    expect(issues.map(issue => issue.path.join('.'))).toEqual(['spec.literalSubject', 'spec.privateKey']);
  });
});
describe('Issuer backend boundaries', () => {
  it('requires one backend without treating selfSigned as missing config', () => {
    expect(issuerIssues(draft({ selfSigned: {} }))).toEqual([]);
    expect(issuerIssues(draft({ selfSigned: {}, ca: { secretName: 'ca' } }))).toHaveLength(1);
  });
  it('requires actual Vault auth keys rather than generic credential path', () => {
    const issues = issuerIssues(draft({ vault: { server: 'https://vault.invalid', path: 'pki/sign/fixture', auth: { appRole: { path: 'approle', roleId: 'role', secretRef: { name: 'reference-only' } } } } }));
    expect(issues.map(issue => issue.path.join('.'))).toEqual(['spec.vault.auth.appRole.secretRef.key']);
  });
  it('rejects both Venafi platforms and requires cloud key selector', () => {
    const issues = issuerIssues(draft({ venafi: { zone: 'fixture', cloud: { apiTokenSecretRef: { name: 'reference-only' } } } }));
    expect(issues.map(issue => issue.path.join('.'))).toEqual(['spec.venafi.cloud.apiTokenSecretRef.key']);
  });
});
