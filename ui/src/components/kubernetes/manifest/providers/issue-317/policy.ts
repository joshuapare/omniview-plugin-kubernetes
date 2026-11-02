import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorPatch } from '@omniviewdev/runtime';

export function allocatorReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  const owners = draft.get(['metadata', 'ownerReferences']);
  return context.ownership?.status !== 'application' || (Array.isArray(owners) && owners.length > 0);
}
export function boundedInteger(text: string, maximum = 2147483647) {
  if (!/^\d+$/.test(text) || BigInt(text) > BigInt(maximum)) return { valid: false as const, error: `Enter a whole number from 0 to ${maximum}.` };
  return { valid: true as const, value: BigInt(text) };
}
export function ratio(text: string) {
  return /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(text) ? { valid: true as const, value: text } : { valid: false as const, error: 'Enter a ratio from 0 to 1.' };
}
export function duration(text: string) {
  return /^(?:\d+(?:\.\d+)?(?:h|m|s|ms|us|µs|ns))+$/.test(text) ? { valid: true as const, value: text } : { valid: false as const, error: 'Enter a duration with units.' };
}
export function toggleMember(path: readonly (string | number)[], value: unknown, member: string): ResourceEditorPatch[] {
  if (value === undefined) return [{ op: 'set', path, value: [member] }];
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return [];
  const index = value.indexOf(member);
  return index < 0 ? [{ op: 'insert', path, index: value.length, value: member }] : [{ op: 'remove', path: [...path, index] }];
}
