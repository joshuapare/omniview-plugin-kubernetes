import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';

export const podPath = ['spec', 'template', 'spec'] as const;
export const containersPath = [...podPath, 'containers'] as const;
export const selectorPath = ['spec', 'selector', 'matchLabels'] as const;
export const labelsPath = ['spec', 'template', 'metadata', 'labels'] as const;
export const rollingPath = ['spec', 'updateStrategy', 'rollingUpdate'] as const;
export const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const text = (value: unknown): string => typeof value === 'string' || typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value)) ? String(value) : '';
export const labelValue = (value: string): boolean => value.length <= 63 && (value === '' || /^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(value));
export const labelKey = (value: string): boolean => {
  const parts = value.split('/');
  const name = parts.at(-1) ?? '';
  return parts.length <= 2 && name.length > 0 && labelValue(name) && (parts.length === 1 || (parts[0].length <= 253 && parts[0].split('.').every(part => part.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(part))));
};
export function parseNonnegative(textValue: string): bigint | null {
  if (!/^\d+$/.test(textValue)) return null;
  const value = BigInt(textValue);
  return value <= 2147483647n ? value : null;
}
export function parseBudget(value: string, percent: boolean): bigint | string | null {
  const count = parseNonnegative(value);
  if (count === null || (percent && count > 100n)) return null;
  return percent ? `${count}%` : count;
}
function integerValue(value: unknown): bigint | null {
  return typeof value === 'bigint' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : null;
}
function budgetValid(value: unknown): boolean {
  if (typeof value === 'string') return /^\d+%$/.test(value) && BigInt(value.slice(0, -1)) <= 100n;
  const number = integerValue(value);
  return number !== null && number >= 0n && number <= 2147483647n;
}
const budgetPositive = (value: unknown): boolean => typeof value === 'string' ? /^\d+%$/.test(value) && BigInt(value.slice(0, -1)) > 0n : (integerValue(value) ?? 0n) > 0n;

export interface ControllerOwner { apiVersion: string; kind: string; name: string; uid: string }
export function ownership(draft: ResourceEditorDraft): { state: 'standalone' | 'owned' | 'unknown'; owner?: ControllerOwner } {
  const refs = draft.get(['metadata', 'ownerReferences']);
  if (refs === undefined && !draft.has(['metadata', 'ownerReferences'])) return { state: 'standalone' };
  if (!Array.isArray(refs)) return { state: 'unknown' };
  let owner: ControllerOwner | undefined;
  for (const raw of refs) {
    const ref = object(raw);
    if (typeof ref.apiVersion !== 'string' || typeof ref.kind !== 'string' || typeof ref.name !== 'string' || typeof ref.uid !== 'string' || (ref.controller !== undefined && typeof ref.controller !== 'boolean')) return { state: 'unknown' };
    if (ref.controller === true) {
      if (owner) return { state: 'unknown' };
      owner = { apiVersion: ref.apiVersion, kind: ref.kind, name: ref.name, uid: ref.uid };
    }
  }
  return owner ? { state: 'owned', owner } : { state: 'standalone' };
}
export function appsReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  return context.intent === 'inspect' || context.intent === 'action'
    || context.ownership?.status === 'controller' || context.ownership?.status === 'system'
    || (context.intent === 'edit' && context.ownership?.status !== 'application')
    || (context.kind === 'ReplicaSet' && ownership(draft).state !== 'standalone');
}
export function strategyPatch(draft: ResourceEditorDraft, next: string): readonly ResourceEditorPatch[] | null {
  if (!['', 'RollingUpdate', 'OnDelete'].includes(next)) return null;
  const branch = draft.get(rollingPath);
  if (next === 'OnDelete' && branch !== undefined && (typeof branch !== 'object' || branch === null || Array.isArray(branch) || Object.keys(branch).some(key => !['maxUnavailable', 'maxSurge'].includes(key)))) return null;
  const operations: ResourceEditorPatch[] = next === '' ? [{ op: 'remove', path: ['spec', 'updateStrategy', 'type'] }] : [{ op: 'set', path: ['spec', 'updateStrategy', 'type'], value: next }];
  if (next === 'OnDelete' && draft.has(rollingPath)) operations.push({ op: 'remove', path: rollingPath });
  return operations;
}
export function linkLabel(key: string, value: string): readonly ResourceEditorPatch[] {
  return [{ op: 'set', path: [...selectorPath, key], value }, { op: 'set', path: [...labelsPath, key], value }];
}
export function appsUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (appsReadOnly(draft, context)) return null;
  if (context.schema.status !== 'available') return 'Installed schema is not available. Keep source unchanged until schema discovery is ready.';
  const containers = draft.get(containersPath);
  if (containers !== undefined && (!Array.isArray(containers) || containers.some(value => !value || typeof value !== 'object' || Array.isArray(value)))) return 'Container shape cannot be edited safely. Continue in YAML.';
  const selector = draft.get(['spec', 'selector']);
  if (selector !== undefined && (!selector || typeof selector !== 'object' || Array.isArray(selector))) return 'Selector shape cannot be edited safely. Continue in YAML.';
  const strategy = draft.get(['spec', 'updateStrategy', 'type']);
  if (context.kind === 'DaemonSet' && strategy !== undefined && strategy !== 'RollingUpdate' && strategy !== 'OnDelete') return 'Unsupported update strategy retained in YAML.';
  return null;
}
export function validateApps(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (appsReadOnly(draft, context)) return [];
  const issues: ResourceEditorFieldIssue[] = [];
  const issue = (path: ResourceEditorPath, message: string) => issues.push({ path, message });
  for (const field of context.kind === 'DaemonSet' ? ['minReadySeconds', 'revisionHistoryLimit'] : ['minReadySeconds', 'replicas']) {
    const value = draft.get(['spec', field]);
    if (value !== undefined && (integerValue(value) === null || integerValue(value)! < 0n || integerValue(value)! > 2147483647n)) issue(['spec', field], 'Use a whole number from 0 to 2147483647.');
  }
  const labels = object(draft.get(selectorPath));
  const expressions = rows(draft.get(['spec', 'selector', 'matchExpressions']));
  if (!Object.keys(labels).length && !expressions.length) issue(selectorPath, 'Add a nonempty Pod selector.');
  for (const [key, value] of Object.entries(labels)) {
    if (!labelKey(key) || typeof value !== 'string' || !labelValue(value)) issue([...selectorPath, key], 'Use a valid Kubernetes label key and value.');
    if (draft.get([...labelsPath, key]) !== value) issue([...labelsPath, key], 'Pod labels must match the selector.');
  }
  const templateLabels = object(draft.get(labelsPath));
  for (const [index, expression] of expressions.entries()) {
    const item = object(expression);
    const key = typeof item.key === 'string' ? item.key : '';
    const values = Array.isArray(item.values) ? item.values : [];
    const validValues = values.every(value => typeof value === 'string' && labelValue(value));
    const present = Object.hasOwn(templateLabels, key);
    const value = templateLabels[key];
    const matches = item.operator === 'In' ? values.length > 0 && present && values.includes(value)
      : item.operator === 'NotIn' ? values.length > 0 && (!present || !values.includes(value))
        : item.operator === 'Exists' ? values.length === 0 && present
          : item.operator === 'DoesNotExist' ? values.length === 0 && !present : false;
    if (!labelKey(key) || !validValues || !matches) issue(['spec', 'selector', 'matchExpressions', index], 'Selector expression must be valid and match Pod labels. Edit this expression in YAML.');
  }
  const restartPolicy = draft.get([...podPath, 'restartPolicy']);
  if (restartPolicy !== undefined && restartPolicy !== 'Always') issue([...podPath, 'restartPolicy'], 'Controller Pods require restartPolicy Always.');
  if (draft.has([...podPath, 'activeDeadlineSeconds'])) issue([...podPath, 'activeDeadlineSeconds'], 'Controller Pods do not support activeDeadlineSeconds.');
  const containers = rows(draft.get(containersPath));
  if (!containers.length) issue(containersPath, 'Add a container.');
  const names = new Set<string>();
  containers.forEach((raw, index) => {
    const container = object(raw);
    const name = text(container.name);
    if (name.length > 63 || !/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(name) || names.has(name)) issue([...containersPath, index, 'name'], 'Use a unique container DNS label.');
    names.add(name);
    if (typeof container.image !== 'string' || !container.image.trim()) issue([...containersPath, index, 'image'], 'Enter a container image.');
  });
  if (context.kind === 'DaemonSet') {
    const strategy = draft.get(['spec', 'updateStrategy', 'type']);
    if (strategy !== undefined && strategy !== 'RollingUpdate' && strategy !== 'OnDelete') issue(['spec', 'updateStrategy', 'type'], 'Use a supported update strategy.');
    if (strategy !== 'OnDelete') {
      const unavailable = draft.get([...rollingPath, 'maxUnavailable']) ?? 1n;
      const surge = draft.get([...rollingPath, 'maxSurge']) ?? 0n;
      for (const [field, value] of [['maxUnavailable', unavailable], ['maxSurge', surge]] as const) if (!budgetValid(value)) issue([...rollingPath, field], 'Use an integer count or percentage from 0% to 100%.');
      if (budgetValid(unavailable) && budgetValid(surge) && budgetPositive(unavailable) === budgetPositive(surge)) issue(rollingPath, 'Exactly one rollout budget must be greater than zero.');
    }
  }
  return issues;
}
