import { describe, expect, it } from 'vitest';
import { filterResults, summaryMismatch, text } from './report';

describe('policy report inspection', () => {
  const results = [{ policy: 'Require-labels', rule: 'team', source: 'producer-one', result: 'fail', message: 'private-text' }, { policy: 'images', rule: 'registry', source: 'producer-two', result: 'pass' }];
  it('combines policy/rule, producer and outcome filters without searching private messages', () => {
    expect(filterResults(results, 'LABEL', 'fail', 'producer-one').map(row => row.index)).toEqual([0]);
    expect(filterResults(results, 'private-text', '', '')).toEqual([]);
    expect(filterResults(results, 'registry', 'fail', '')).toEqual([]);
    expect(filterResults(results, '', '', 'producer-two').map(row => row.index)).toEqual([1]);
  });
  it('distinguishes absent counters from reported zero and detects producer inconsistencies', () => {
    expect(summaryMismatch(results, {})).toBe(false);
    expect(summaryMismatch(results, { fail: 0 })).toBe(true);
    expect(summaryMismatch(results, { pass: 1n, fail: 1n })).toBe(false);
  });
  it('retains exact integers and false while refusing opaque and unsafe numeric values', () => {
    expect(text(9223372036854775807n)).toBe('9223372036854775807');
    expect(text(false)).toBe('false');
    expect(text(undefined)).toBe('—');
    expect(text({ sensitive: true })).toBe('—');
    expect(text(Number.MAX_SAFE_INTEGER + 1)).toBe('—');
  });
});
