import { describe, expect, it } from 'vitest';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
import { clusterProblem, passwordIssues } from './policy';

function draft(spec: unknown): ResourceEditorDraft {
  const root = { spec };
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, root);
  return { sessionID: 'fixture', revision: 0, get, has: path => get(path) !== undefined };
}
describe('External Secrets generator constraints', () => {
  it('rejects digit and symbol totals beyond password length', () => {
    expect(passwordIssues(draft({ length: 12, digits: 8, symbols: 8 }))).toHaveLength(1);
    expect(passwordIssues(draft({ length: 12, digits: 6, symbols: 6 }))).toEqual([]);
  });
  it('keeps large integer constraints exact', () => {
    expect(passwordIssues(draft({ length: 9007199254740993n, digits: 9007199254740992n, symbols: 1n }))).toEqual([]);
    expect(passwordIssues(draft({ length: 9007199254740993n, digits: 9007199254740992n, symbols: 2n }))).toHaveLength(1);
  });
  it('rejects rounded numeric and structured constraints without coercion', () => {
    expect(passwordIssues(draft({ length: Number.MAX_SAFE_INTEGER + 1 }))).toHaveLength(1);
    expect(passwordIssues(draft({ length: { toString() { throw new Error('Must not coerce protected projections'); } } }))).toHaveLength(1);
    expect(passwordIssues(draft({ length: '9007199254740993', digits: '9007199254740992', symbols: '1' }))).toEqual([]);
  });
  it('applies omitted digit and symbol defaults without writing defaults', () => {
    expect(passwordIssues(draft({ length: 24 }))).toEqual([]);
    expect(passwordIssues(draft({ length: 0 }))).toHaveLength(1);
  });
  it('does not enable cluster MFA from an unused schema member', () => {
    expect(clusterProblem(draft({ kind: 'MFA', generator: { mfaSpec: {} } }))).not.toBeNull();
  });
  it('keeps mismatched and extra cluster branches in source fallback', () => {
    expect(clusterProblem(draft({ kind: 'Password', generator: { passwordSpec: {}, webhookSpec: {} } }))).not.toBeNull();
    expect(clusterProblem(draft({ kind: 'Password', generator: { passwordSpec: {} } }))).toBeNull();
  });
});
