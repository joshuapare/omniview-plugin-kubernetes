import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export const target = { group: 'node.k8s.io', version: 'v1', kind: 'RuntimeClass', resource: 'runtimeclasses', scope: 'Cluster' } as const;
export const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const text = (value: unknown): string => typeof value === 'string' || typeof value === 'bigint' || typeof value === 'number' ? String(value) : '';
export const handlerError = (value: string): string | null => value.length > 0 && value.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(value) ? null : 'Enter a lowercase DNS label, up to 63 characters.';
export function labelKeyError(value: string): string | null {
  const parts = value.split('/');
  const name = parts.at(-1)!;
  const prefix = parts.length === 2 ? parts[0] : undefined;
  if (parts.length > 2 || !name || name.length > 63 || !/^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(name)) return 'Enter a valid label key.';
  if (prefix !== undefined && (!prefix || prefix.length > 253 || !prefix.split('.').every(part => !handlerError(part)))) return 'Enter a valid DNS prefix.';
  return null;
}
export const labelValueError = (value: string): string | null => value === '' || value.length <= 63 && /^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(value) ? null : 'Enter a label value, up to 63 characters.';
/** Quantity grammar, not a server-side resource admission guarantee. Keep the original spelling. */
export const quantityError = (value: string): string | null => value === '' || /^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+|[numkMGTPE]|[KMGTPE]i)?$/.test(value) ? null : 'Enter a nonnegative Kubernetes quantity.';
export function secondsError(value: string): string | null {
  if (value === '') return null;
  if (!/^-?\d+$/.test(value)) return 'Enter whole seconds.';
  const seconds = BigInt(value);
  return seconds >= -9223372036854775808n && seconds <= 9223372036854775807n ? null : 'Seconds must fit a signed 64-bit integer.';
}
export function controllerOwned(draft: ResourceEditorDraft): boolean {
  const owners = draft.get(['metadata', 'ownerReferences']);
  return Array.isArray(owners) && owners.some(owner => record(owner) && owner.controller === true);
}
export function readOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  return context.intent === 'inspect' || controllerOwned(draft) || context.ownership?.status === 'controller' || context.ownership?.status === 'system';
}
export function unavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') return `RuntimeClass API discovery is ${context.discovery.status}.`;
  if (context.schema.status !== 'available') return `RuntimeClass schema is ${context.schema.status}.`;
  for (const path of [['overhead'], ['overhead', 'podFixed'], ['scheduling'], ['scheduling', 'nodeSelector']] as const) {
    if (draft.has(path) && !record(draft.get(path))) return 'Unsupported RuntimeClass structure. Keep this document in YAML.';
  }
  const handler = draft.get(['handler']);
  if (handler !== undefined && typeof handler !== 'string') return 'Handler must remain a string. Edit this document in YAML.';
  for (const path of [['metadata', 'labels'], ['scheduling', 'nodeSelector']] as const) {
    const value = draft.get(path);
    if (value !== undefined && (!record(value) || Object.values(value).some(item => typeof item !== 'string'))) return 'Unsupported label value type. Keep this document in YAML.';
  }
  for (const resource of ['cpu', 'memory']) {
    const value = draft.get(['overhead', 'podFixed', resource]);
    if (value !== undefined && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return 'Unsupported overhead quantity. Keep this document in YAML.';
  }
  const tolerations = draft.get(['scheduling', 'tolerations']);
  if (tolerations !== undefined) {
    if (!Array.isArray(tolerations)) return 'Unsupported toleration structure. Keep this document in YAML.';
    for (const value of tolerations) {
      if (!record(value)) return 'Unsupported toleration structure. Keep this document in YAML.';
      if (['key', 'operator', 'value', 'effect'].some(key => value[key] !== undefined && typeof value[key] !== 'string')) return 'Unsupported toleration structure. Keep this document in YAML.';
      if (value.operator !== undefined && value.operator !== 'Equal' && value.operator !== 'Exists') return 'Unsupported toleration structure. Keep this document in YAML.';
      if (value.effect !== undefined && (typeof value.effect !== 'string' || !['', 'NoSchedule', 'PreferNoSchedule', 'NoExecute'].includes(value.effect))) return 'Unsupported toleration structure. Keep this document in YAML.';
      if (value.tolerationSeconds !== undefined && typeof value.tolerationSeconds !== 'bigint' && !(typeof value.tolerationSeconds === 'number' && Number.isSafeInteger(value.tolerationSeconds))) return 'Unsupported toleration structure. Keep this document in YAML.';
    }
  }
  return null;
}
export function tolerationError(value: Record<string, unknown>): string | null {
  const operator = text(value.operator) || 'Equal';
  const key = text(value.key);
  if (!key && operator !== 'Exists') return 'A taint key is required unless operator is Exists.';
  if (key && labelKeyError(key)) return labelKeyError(key);
  if (operator === 'Exists' && text(value.value)) return 'Exists cannot include a taint value.';
  if (operator !== 'Exists' && labelValueError(text(value.value))) return 'Enter a valid taint value.';
  if (value.tolerationSeconds !== undefined && text(value.effect) !== 'NoExecute') return 'Seconds apply only to NoExecute.';
  return secondsError(text(value.tolerationSeconds));
}
export const tolerationIdentity = (value: Record<string, unknown>): string => JSON.stringify([text(value.key), text(value.operator) || 'Equal', text(value.value), text(value.effect)]);
export function duplicateToleration(rows: readonly unknown[], value: Record<string, unknown>, except = -1): boolean {
  return rows.some((row, index) => index !== except && record(row) && tolerationIdentity(row) === tolerationIdentity(value));
}
export function validate(draft: ResourceEditorDraft): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const add = (path: readonly (string | number)[], message: string | null) => { if (message) issues.push({ path, message }); };
  add(['handler'], handlerError(text(draft.get(['handler']))));
  for (const name of ['cpu', 'memory']) add(['overhead', 'podFixed', name], quantityError(text(draft.get(['overhead', 'podFixed', name]))));
  for (const path of [['metadata', 'labels'], ['scheduling', 'nodeSelector']] as const) {
    const labels = draft.get(path);
    if (record(labels)) for (const [key, value] of Object.entries(labels)) { add([...path, key], labelKeyError(key)); add([...path, key], labelValueError(text(value))); }
  }
  const rows = draft.get(['scheduling', 'tolerations']);
  if (Array.isArray(rows)) rows.forEach((row, index) => { if (record(row)) add(['scheduling', 'tolerations', index], tolerationError(row) ?? (duplicateToleration(rows, row, index) ? 'This toleration already exists.' : null)); });
  return issues;
}
