import type { ResourceEditorDraft } from '@omniviewdev/runtime';

export const outcomes = ['pass', 'fail', 'warn', 'error', 'skip'] as const;
export function scalar(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : 'Unsupported numeric precision';
  return 'Not recorded';
}
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function rows(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
/** Read only explicit public facts. Never project free-text messages, properties or annotations. */
export function resultFacts(draft: ResourceEditorDraft, index: number) {
  const get = (key: string) => scalar(draft.get(['spec', 'results', index, key]));
  return { index, policy: get('policy'), rule: get('rule'), result: get('result'), severity: get('severity') };
}
export function filterResults(draft: ResourceEditorDraft, query: string, outcome: string) {
  const needle = query.toLocaleLowerCase();
  return rows(draft.get(['spec', 'results'])).map((_, index) => resultFacts(draft, index)).filter(item =>
    (outcome === 'all' || item.result === outcome) && [item.policy, item.rule, item.severity].some(value => value.toLocaleLowerCase().includes(needle)));
}
export function timestamp(seconds: unknown, nanos: unknown): string {
  const s = scalar(seconds);
  const n = nanos === undefined ? '0' : scalar(nanos);
  if (!/^-?\d+$/.test(s) || !/^\d{1,9}$/.test(n) || BigInt(n) > 999999999n) return 'Timestamp unavailable or unsupported';
  return `${s} seconds + ${n.padStart(9, '0')} nanoseconds (Unix UTC)`;
}
