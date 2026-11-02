import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { durationError, ownershipReason, validate } from './policy';
function draft(value: unknown): ResourceEditorDraft {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, value);
  return { sessionID: 'fixture', revision: 0, get, has: path => get(path) !== undefined };
}
const context = { intent: 'edit', ownership: { status: 'application' } } as ResourceEditorContext;
describe('Flux Kustomization safety', () => {
  it('accepts compound durations without converting precision', () => {
    expect(durationError('1h30m0.001s')).toBeNull();
    expect(durationError('1day')).not.toBeNull();
    expect(durationError('-1m')).not.toBeNull();
  });
  it('does not mistake explicit false prune for an omitted required choice', () => {
    const spec = { interval: '5m', prune: false, sourceRef: { kind: 'GitRepository', name: 'app' } };
    expect(validate(draft({ spec }))).toEqual([]);
    expect(validate(draft({ spec: { ...spec, prune: undefined } }))).toContainEqual({ path: ['spec', 'prune'], message: 'Choose whether to prune removed resources.' });
  });
  it('locks Git-managed and unknown-ownership edits', () => {
    expect(ownershipReason(draft({ metadata: { labels: { 'kustomize.toolkit.fluxcd.io/name': 'root' } } }), context)).not.toBeNull();
    expect(ownershipReason(draft({}), { ...context, ownership: undefined })).not.toBeNull();
    expect(ownershipReason(draft({}), context)).toBeNull();
  });
  it('rejects partial health and substitution references without changing source', () => {
    const source = { spec: { interval: '1m', prune: false, sourceRef: { kind: 'Bucket', name: 'source' }, healthChecks: [{ kind: 'Deployment' }], postBuild: { substituteFrom: [{ kind: 'Secret' }] } } };
    const before = JSON.stringify(source);
    expect(validate(draft(source)).map(issue => issue.path)).toContainEqual(['spec', 'healthChecks', 0, 'name']);
    expect(validate(draft(source)).map(issue => issue.path)).toContainEqual(['spec', 'postBuild', 'substituteFrom', 0, 'name']);
    expect(JSON.stringify(source)).toBe(before);
  });
});
