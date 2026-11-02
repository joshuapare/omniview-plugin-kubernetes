import { describe, expect, it } from 'vitest';
import { desiredNames, exactCount, generationState, hasIgnoredExpressions, identifier } from './model';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
function draft(source: unknown): ResourceEditorDraft {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((value, key) => value !== null && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined, source);
  return { sessionID: 'fixture', revision: 0, get, has: path => get(path) !== undefined };
}
describe('Strimzi PodSet inspection', () => {
  it('does not equate missing counts or observations with zero or success', () => {
    expect(exactCount(undefined)).toBe('Unknown');
    expect(generationState(4, undefined)).toBe('Observation unknown');
    expect(generationState(4, 3)).toBe('Awaiting observation');
    expect(generationState(4, 4)).toBe('Generation observed');
  });
  it('preserves exact wide generation comparisons without rounding', () => {
    expect(generationState(9007199254740993n, 9007199254740992n)).toBe('Awaiting observation');
    expect(exactCount(Number.MAX_SAFE_INTEGER + 1)).toBe('Unknown');
  });
  it('projects only membership names, not opaque Pod payloads', () => {
    const source = { spec: { pods: [{ metadata: { name: 'broker-0' }, spec: { containers: [{ env: [{ value: 'private value' }] }] } }] } };
    expect(desiredNames(draft(source))).toEqual(['broker-0']);
    expect(source.spec.pods[0].spec.containers[0].env[0].value).toBe('private value');
  });
  it('flags expressions ignored by Strimzi and rejects free-text identifiers', () => {
    expect(hasIgnoredExpressions(draft({ spec: { selector: { matchExpressions: [{ key: 'role' }] } } }))).toBe(true);
    expect(hasIgnoredExpressions(draft({ spec: { selector: { matchLabels: {} } } }))).toBe(false);
    expect(identifier('message with private material')).toBe('Unknown');
  });
});
