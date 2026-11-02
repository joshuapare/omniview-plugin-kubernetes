import type { FieldSchema } from './inventory';

export const sensitiveField = (name: string) => /password|secret|token|credential|privatekey|handleID|annotation/i.test(name);
export type SafeValue = string | boolean | number | bigint | null | SafeValue[] | { [key: string]: SafeValue };
/** Schema allowlist only. Unknown children and opaque host markers never reach text or ARIA. */
export function observedValue(value: unknown, schema: FieldSchema, name = ''): SafeValue {
  if (sensitiveField(name)) return '••••';
  if (value === undefined) return 'Not recorded';
  if (value === null) return null;
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return 'Unsupported shape';
    return value.map(item => observedValue(item, schema.items ?? {}));
  }
  if (schema.type === 'object' || schema.properties) {
    if (typeof value !== 'object' || Array.isArray(value)) return 'Unsupported shape';
    const record = value as Record<string, unknown>;
    // Unknown map keys can carry credentials. Do not render arbitrary keys or values.
    if (!schema.properties) return 'Opaque map preserved in source';
    return Object.fromEntries(Object.entries(schema.properties).filter(([key]) => Object.hasOwn(record, key)).map(([key, child]) => [key, observedValue(record[key], child, key)]));
  }
  if (schema.type === 'integer' && (typeof value === 'bigint' || typeof value === 'number' && Number.isSafeInteger(value))) return value;
  if (schema.type === 'number' && (typeof value === 'bigint' || typeof value === 'number' && Number.isFinite(value))) return value;
  if (schema.type === 'string' && typeof value === 'string') return value;
  if (schema.type === 'boolean' && typeof value === 'boolean') return value;
  return 'Unsupported or protected value';
}

export function allocationCounts(allocations: unknown, unallocated: unknown) {
  if (!Array.isArray(allocations) || !Array.isArray(unallocated)) return null;
  return { allocated: allocations.filter(value => value !== null).length, free: unallocated.length };
}
