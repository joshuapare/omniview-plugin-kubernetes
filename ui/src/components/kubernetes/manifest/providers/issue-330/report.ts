export const outcomes = ['pass', 'fail', 'warn', 'error', 'skip'] as const;
export type RecordValue = Record<string, unknown>;
export function record(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}
export function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'bigint' || typeof value === 'boolean' || (typeof value === 'number' && Number.isSafeInteger(value)) ? String(value) : '—';
}
export function filterResults(results: readonly unknown[], search: string, outcome: string, producer: string) {
  const query = search.trim().toLocaleLowerCase();
  return results.map((value, index) => ({ value: record(value), index })).filter(({ value }) =>
    (!query || [value.policy, value.rule].some(field => typeof field === 'string' && field.toLocaleLowerCase().includes(query))) &&
    (!outcome || value.result === outcome) && (!producer || value.source === producer));
}
export function summaryMismatch(results: readonly unknown[], summary: unknown): boolean {
  const counts = record(summary);
  return outcomes.some(outcome => {
    const count = counts[outcome];
    if (typeof count !== 'bigint' && !(typeof count === 'number' && Number.isSafeInteger(count))) return false;
    return BigInt(count) !== BigInt(results.filter(value => record(value).result === outcome).length);
  });
}
