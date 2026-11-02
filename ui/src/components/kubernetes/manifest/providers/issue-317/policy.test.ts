import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { allocatorReadOnly, boundedInteger, duration, ratio, toggleMember } from './policy';

const draft = (owners?: unknown): ResourceEditorDraft => ({ sessionID: 'fixture', revision: 1, get: () => owners, has: () => owners !== undefined });
const context = (status: 'application' | 'unknown' | 'controller') => ({ ownership: { status } }) as ResourceEditorContext;
describe('OpenTelemetry domain safety', () => {
  it('keeps generated and unresolved allocators read-only', () => {
    expect(allocatorReadOnly(draft([{ kind: 'OpenTelemetryCollector', controller: true }]), context('application'))).toBe(true);
    expect(allocatorReadOnly(draft(), context('unknown'))).toBe(true);
    expect(allocatorReadOnly(draft(), context('application'))).toBe(false);
  });
  it('rejects partial and out-of-bound replicas without numeric precision conversion', () => {
    expect(boundedInteger('1.', 1).valid).toBe(false);
    expect(boundedInteger('2', 1).valid).toBe(false);
    expect(boundedInteger('9007199254740993').valid).toBe(false);
    expect(boundedInteger('1', 1)).toEqual({ valid: true, value: 1n });
  });
  it('retains sampler arguments as exact strings', () => {
    expect(ratio('0.1234567890123456789')).toEqual({ valid: true, value: '0.1234567890123456789' });
    expect(ratio('1.1').valid).toBe(false);
    expect(ratio('0.').valid).toBe(false);
  });
  it('changes one propagation node without replacing unknown siblings', () => {
    expect(toggleMember(['spec', 'propagators'], ['custom', 'b3', 'tracecontext'], 'b3')).toEqual([{ op: 'remove', path: ['spec', 'propagators', 1] }]);
    expect(toggleMember(['spec', 'propagators'], ['custom'], 'b3')).toEqual([{ op: 'insert', path: ['spec', 'propagators'], index: 1, value: 'b3' }]);
    expect(toggleMember(['spec', 'propagators'], [{ opaque: true }], 'b3')).toEqual([]);
  });
  it('rejects partial durations', () => {
    expect(duration('1m30s').valid).toBe(true);
    expect(duration('30').valid).toBe(false);
  });
});
