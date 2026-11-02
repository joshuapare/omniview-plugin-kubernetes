/** Unknown objects include opaque privacy handles and must never be stringified. */
export function scalar(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return 'Not observed';
}
export function items(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object' && !Array.isArray(entry));
}
/** Never render arbitrary controller strings as successful lifecycle states. */
export function observedState(value: unknown): string {
  switch (value) {
    case 'valid': case 'ready': case 'pending': case 'processing': case 'invalid': case 'expired': case 'errored': return value;
    default: return 'Unknown';
  }
}
