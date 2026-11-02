import type { ResourceEditorDraft } from '@omniviewdev/runtime';

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function rows(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
// Do not surface arbitrary messages, annotations, labels, or embedded Pod payloads.
export function identifier(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,252}$/.test(value) ? value : 'Unknown';
}
export function exactCount(value: unknown): string {
  return typeof value === 'bigint' && value >= 0n ? value.toString() : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : 'Unknown';
}
export function generationState(generation: unknown, observed: unknown): string {
  const current = exactCount(generation); const seen = exactCount(observed);
  if (current === 'Unknown' || seen === 'Unknown') return 'Observation unknown';
  return BigInt(seen) < BigInt(current) ? 'Awaiting observation' : BigInt(seen) === BigInt(current) ? 'Generation observed' : 'Observation ahead of source';
}
export function desiredNames(draft: ResourceEditorDraft): readonly string[] {
  return rows(draft.get(['spec', 'pods'])).map((_, index) => identifier(draft.get(['spec', 'pods', index, 'metadata', 'name'])));
}
export function hasIgnoredExpressions(draft: ResourceEditorDraft): boolean {
  return rows(draft.get(['spec', 'selector', 'matchExpressions'])).length > 0;
}
