import { describe, expect, it } from 'vitest';
import { discoveredMetrics, exactWindow, metricRows } from './model';

describe('external adapter response semantics', () => {
  it('keeps exact quantity text and distinct label series', () => {
    const rows = metricRows({ items: [{ metricName: 'queue', metricLabels: { zone: 'a' }, value: '9007199254740993m' }, { metricName: 'queue', metricLabels: { zone: 'b' }, value: '1e3' }] });
    expect(rows).toHaveLength(2);
    expect(rows[0].value).toBe('9007199254740993m');
    expect(rows[1].value).toBe('1e3');
  });
  it('does not treat omitted window as zero or round unsafe integers', () => {
    expect(exactWindow(undefined)).toBe('Not supplied');
    expect(exactWindow(0)).toBe('0 s');
    expect(exactWindow(9007199254740993n)).toBe('9007199254740993 s');
    expect(exactWindow(Number.MAX_SAFE_INTEGER + 1)).toBe('Exact value unavailable');
  });
  it('uses only listable namespaced advertised names, never guessed plurals', () => {
    expect(discoveredMetrics({ resources: [{ name: 'queue_depth', namespaced: true, verbs: ['list'] }, { name: 'forbidden', namespaced: true, verbs: ['get'] }, { name: 'global', namespaced: false, verbs: ['list'] }, { name: 'queue/status', namespaced: true, verbs: ['list'] }] })).toEqual(['queue_depth']);
  });
});
