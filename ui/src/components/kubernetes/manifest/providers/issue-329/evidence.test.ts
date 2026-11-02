import { describe, expect, it } from 'vitest';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
import { filterResults, scalar, timestamp } from './evidence';

function fixture(): ResourceEditorDraft {
  const source = { spec: { results: [{ policy: 'require-label', rule: 'team', result: 'fail', severity: 'high', message: 'private-payload', properties: { token: 'private-payload' } }, { policy: 'restrict-images', rule: 'registry', result: 'pass' }] } };
  return { sessionID: 'fixture', revision: 0, get: path => path.reduce<unknown>((value, key) => value !== null && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined, source), has: () => true };
}
describe('Kyverno transient evidence', () => {
  it('combines outcome and case-insensitive policy filters without exposing payload fields', () => {
    const draft = fixture();
    expect(filterResults(draft, 'LABEL', 'fail')).toEqual([{ index: 0, policy: 'require-label', rule: 'team', result: 'fail', severity: 'high' }]);
    expect(filterResults(draft, 'private-payload', 'all')).toEqual([]);
    expect(filterResults(draft, 'registry', 'fail')).toEqual([]);
    expect(filterResults(draft, '', 'all')).toHaveLength(2);
  });
  it('keeps absent scored distinct from false and refuses opaque markers', () => {
    expect(scalar(false)).toBe('false');
    expect(scalar(undefined)).toBe('Not recorded');
    expect(scalar({ sensitive: true })).toBe('Not recorded');
  });
  it('retains wide timestamp integers and exact nanoseconds', () => {
    expect(timestamp(9223372036854775807n, 42)).toBe('9223372036854775807 seconds + 000000042 nanoseconds (Unix UTC)');
    expect(timestamp(-1, 500000000)).toBe('-1 seconds + 500000000 nanoseconds (Unix UTC)');
    expect(timestamp(1, 1000000000)).toBe('Timestamp unavailable or unsupported');
    expect(timestamp(Number.MAX_SAFE_INTEGER + 1, 0)).toBe('Timestamp unavailable or unsupported');
  });
});
