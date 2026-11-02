import { describe, expect, it } from 'vitest';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
import { validatePolicy, validateMutationBranches } from './domain';
const draft = (value: unknown): ResourceEditorDraft => ({ sessionID: 'fixture', revision: 0, get: path => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, value), has(path) { return this.get(path) !== undefined; } });
describe('Kyverno alpha policy validation', () => {
  it('requires the selected mutation branch expression, not the inactive branch', () => {
    const input = draft({ spec: { mutations: [{ patchType: 'JSONPatch', applyConfiguration: { expression: 'unchanged' } }] } });
    expect(validateMutationBranches(input)[0].path).toEqual(['spec', 'mutations', 0, 'jsonPatch', 'expression']);
    expect(input.get(['spec', 'mutations', 0, 'applyConfiguration', 'expression'])).toBe('unchanged');
  });
  it('rejects missing policy references without inventing an expiration field', () => {
    expect(validatePolicy(draft({ spec: { matchConditions: [] } }), 'PolicyException')).toEqual([{ path: ['spec', 'policyRefs'], message: 'Add at least one entry.' }]);
  });
  it('reports incomplete repeated CEL rows at the correct index', () => {
    const issues = validatePolicy(draft({ spec: { generate: [{ expression: 'resources' }, { expression: '' }] } }), 'GeneratingPolicy');
    expect(issues.map(issue => issue.path)).toContainEqual(['spec', 'generate', 1, 'expression']);
  });
});
