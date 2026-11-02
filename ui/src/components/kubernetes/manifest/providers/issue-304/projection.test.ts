import { describe, expect, it } from 'vitest';
import { allocationCounts, observedValue } from './projection';

describe('Calico backing inspection privacy', () => {
  it('never renders unknown children or arbitrary credential map keys', () => {
    expect(observedValue({ cidr: '10.0.0.0/26', surprise: 'private' }, { type: 'object', properties: { cidr: { type: 'string' } } })).toEqual({ cidr: '10.0.0.0/26' });
    expect(observedValue({ 'private-map-key': 'private' }, { type: 'object', additionalProperties: { type: 'string' } })).toBe('Opaque map preserved in source');
  });
  it('masks credential subtrees before traversing children', () => {
    expect(observedValue({ secretKeyRef: { name: 'private', key: 'private' } }, { type: 'object' }, 'nodeMeshPassword')).toBe('••••');
    expect(observedValue('private', { type: 'string' }, 'handleID')).toBe('••••');
  });
  it('keeps exact wide counters and rejects opaque markers', () => {
    expect(observedValue(9007199254740993n, { type: 'integer' })).toBe(9007199254740993n);
    expect(observedValue({ protected: true }, { type: 'integer' })).toBe('Unsupported or protected value');
    expect(observedValue(false, { type: 'boolean' })).toBe(false);
  });
  it('keeps canonical integers exact for numeric schema fields', () => {
    expect(observedValue(10n, { type: 'number' })).toBe(10n);
    expect(observedValue(9007199254740993n, { type: 'number' })).toBe(9007199254740993n);
    expect(observedValue(0.5, { type: 'number' })).toBe(0.5);
    expect(observedValue(Infinity, { type: 'number' })).toBe('Unsupported or protected value');
    expect(observedValue({ protected: true }, { type: 'number' })).toBe('Unsupported or protected value');
  });
  it('counts zero allocation indices as allocated, without treating null as allocated', () => {
    expect(allocationCounts([0, null, 1, null], [1, 3])).toEqual({ allocated: 2, free: 2 });
    expect(allocationCounts({}, [])).toBeNull();
  });
});
