import { describe, expect, it } from 'vitest';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
import { unsupportedShape, validateArtifact } from './domain';
function draft(spec: unknown): ResourceEditorDraft {
  const source = { spec };
  const get: ResourceEditorDraft['get'] = path => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined, source);
  return { sessionID: 'fixture', revision: 1, get, has: path => get(path) !== undefined };
}
const source = { alias: 'repo', kind: 'GitRepository', name: 'repo' };
const output = { name: 'bundle', copy: [{ from: '@repo/**', to: '@artifact/', strategy: 'Merge' }] };
describe('ArtifactGenerator composition validation', () => {
  it('accepts omitted digest revision and explicit Helm merge', () => {
    expect(validateArtifact(draft({ sources: [source], artifacts: [output] }))).toEqual([]);
  });
  it('rejects alias collisions and dangling copy references', () => {
    const issues = validateArtifact(draft({ sources: [source, source], artifacts: [{ ...output, copy: [{ from: '@missing/**', to: '@artifact/' }] }] }));
    expect(issues.map(issue => issue.path.join('.'))).toEqual(['spec.sources.1.alias', 'spec.artifacts.0.copy.0.from']);
  });
  it('rejects malformed revision references and destination roots', () => {
    const issues = validateArtifact(draft({ sources: [source], artifacts: [{ name: 'bundle', revision: 'xrepo', originRevision: '@missing', copy: [{ from: '@repo/**', to: '/tmp' }] }] }));
    expect(issues.map(issue => issue.path.join('.'))).toEqual(['spec.artifacts.0.revision', 'spec.artifacts.0.originRevision', 'spec.artifacts.0.copy.0.to']);
  });
  it('preserves unsupported source shapes rather than treating them as empty lists', () => {
    const original = draft({ sources: { opaque: true }, artifacts: [output] });
    expect(unsupportedShape(original)).not.toBeNull();
    expect(original.get(['spec', 'sources'])).toEqual({ opaque: true });
  });
  it('allows unknown siblings without normalizing their scalar types', () => {
    const original = draft({ sources: [{ ...source, futureField: 9007199254740993n }], artifacts: [output] });
    expect(unsupportedShape(original)).toBeNull();
    expect(validateArtifact(original)).toEqual([]);
    expect(original.get(['spec', 'sources', 0, 'futureField'])).toBe(9007199254740993n);
  });
});
