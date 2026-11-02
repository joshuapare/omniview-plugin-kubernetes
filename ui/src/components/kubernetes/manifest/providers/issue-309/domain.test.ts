import { describe, it, expect } from 'vitest';
import type { ResourceEditorDraft, ResourceEditorContext } from '@omniviewdev/runtime';
import { validate, isReadOnly } from './domain';
const context = (kind: string, ownership: 'application' | 'controller' | 'unknown' = 'application') => ({ kind, ownership: { status: ownership } }) as ResourceEditorContext;
function draft(spec: Record<string, unknown>, owners?: unknown[]): ResourceEditorDraft {
 const source = { spec, metadata: { ownerReferences: owners } };
 return { sessionID: 'test', revision: 1, get: path => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined, source), has: path => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined, source) !== undefined };
}
describe('Flux ownership and provider admission', () => {
 it('blocks generated and unknown-ownership chart edits', () => {
  expect(isReadOnly(draft({}), context('HelmChart', 'unknown'))).toBe(true);
  expect(isReadOnly(draft({}, [{ kind: 'HelmRelease', name: 'release' }]), context('HelmChart'))).toBe(true);
  expect(isReadOnly(draft({}), context('HelmChart'))).toBe(false);
  expect(isReadOnly(draft({}), context('ExternalArtifact'))).toBe(true);
 });
 it('rejects conflicting Bucket credential strategies without echoing credentials', () => {
  const result = validate(draft({ bucketName: 'archive', endpoint: 's3.example.invalid', interval: '1m', provider: 'aws', secretRef: { name: 'credentials' }, serviceAccountName: 'identity', sts: { provider: 'ldap', endpoint: 'https://sts.example.invalid' } }), context('Bucket'));
  expect(result.map(issue => issue.path.join('.'))).toEqual(['spec.serviceAccountName', 'spec.sts.provider']);
 });
 it('requires Azure before Git workload identity', () => {
  expect(validate(draft({ url: 'https://example.invalid/git', interval: '5m', provider: 'generic', serviceAccountName: 'identity' }), context('GitRepository'))).toContainEqual({ path: ['spec', 'serviceAccountName'], message: 'Git service account requires Azure provider.' });
 });
 it('rejects partial duration and retains original draft', () => {
  const source = draft({ url: 'oci://example.invalid/source', interval: '5' });
  expect(validate(source, context('OCIRepository'))).toContainEqual({ path: ['spec', 'interval'], message: 'Enter a duration such as 5m.' });
  expect(source.get(['spec', 'interval'])).toBe('5');
 });
});
