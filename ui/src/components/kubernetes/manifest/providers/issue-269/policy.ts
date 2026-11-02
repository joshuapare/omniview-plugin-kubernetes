import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch } from '@omniviewdev/runtime';

export type BudgetRule = 'minAvailable' | 'maxUnavailable';
export type BudgetUnit = 'pods' | 'percent';
export const expressionOperators = ['In', 'NotIn', 'Exists', 'DoesNotExist'] as const;
export const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const present = (value: unknown) => value !== undefined && value !== null;

export function parseBudget(text: string, unit: BudgetUnit): { valid: true; value: bigint | string } | { valid: false; error: string } {
  if (!/^\d+$/.test(text)) return { valid: false, error: 'Enter a nonnegative whole number.' };
  const amount = BigInt(text);
  if (unit === 'percent') return amount <= 100n ? { valid: true, value: `${text}%` } : { valid: false, error: 'Percentage must be 0–100.' };
  return amount <= 2147483647n ? { valid: true, value: amount } : { valid: false, error: 'Pod count must not exceed 2147483647.' };
}

export function budgetOperations(rule: BudgetRule, value: bigint | string): ResourceEditorPatch[] {
  return [
    { op: 'remove', path: ['spec', rule === 'minAvailable' ? 'maxUnavailable' : 'minAvailable'] },
    { op: 'set', path: ['spec', rule], value },
  ];
}

export function validLabelKey(key: string): boolean {
  const parts = key.split('/');
  if (parts.length > 2) return false;
  const name = parts[parts.length - 1];
  if (!name || name.length > 63 || !/^[A-Za-z0-9]([A-Za-z0-9_.-]*[A-Za-z0-9])?$/.test(name)) return false;
  return parts.length === 1 || (parts[0].length <= 253 && parts[0].split('.').every(part => part.length > 0 && part.length <= 63 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(part)));
}
export const validLabelValue = (value: string): boolean => value.length <= 63 && (value === '' || /^[A-Za-z0-9]([A-Za-z0-9_.-]*[A-Za-z0-9])?$/.test(value));

export function selectorMode(draft: ResourceEditorDraft): 'omitted' | 'none' | 'all' | 'labels' {
  if (!draft.has(['spec', 'selector'])) return 'omitted';
  const selector = draft.get(['spec', 'selector']);
  if (selector === null) return 'none';
  return record(selector) && Object.keys(record(selector.matchLabels) ? selector.matchLabels : {}).length === 0 && (!Array.isArray(selector.matchExpressions) || selector.matchExpressions.length === 0) ? 'all' : 'labels';
}

/** Unknown sibling spec fields are intentionally untouched. Unsupported owned shapes stay in YAML. */
export function policyFormUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') return 'policy/v1 PodDisruptionBudget discovery is not available. Draft retained.';
  if (context.schema.status !== 'available') return 'PodDisruptionBudget schema is not available. Draft retained in YAML.';
  const spec = draft.get(['spec']);
  if (present(spec) && !record(spec)) return 'Unsupported budget specification. Use YAML; source is retained.';
  for (const rule of ['minAvailable', 'maxUnavailable']) {
    const value = draft.get(['spec', rule]);
    if (present(value) && typeof value !== 'bigint' && !(typeof value === 'number' && Number.isSafeInteger(value)) && typeof value !== 'string') return 'Unsupported budget amount. Use YAML; source is retained.';
    if (typeof value === 'string' && !/^\d+%$/.test(value)) return 'Unsupported budget string. Use YAML; source is retained.';
  }
  const selector = draft.get(['spec', 'selector']);
  if (present(selector)) {
    if (!record(selector) || Object.keys(selector).some(key => !['matchLabels', 'matchExpressions'].includes(key))) return 'Unsupported selector fields. Use YAML; source is retained.';
    if (present(selector.matchLabels) && (!record(selector.matchLabels) || Object.values(selector.matchLabels).some(value => typeof value !== 'string'))) return 'Unsupported label selector. Use YAML; source is retained.';
    if (present(selector.matchExpressions) && (!Array.isArray(selector.matchExpressions) || selector.matchExpressions.some(row => !record(row) || Object.keys(row).some(key => !['key', 'operator', 'values'].includes(key)) || typeof row.key !== 'string' || !expressionOperators.includes(row.operator as typeof expressionOperators[number]) || (present(row.values) && (!Array.isArray(row.values) || row.values.some(value => typeof value !== 'string')))))) return 'Unsupported selector expression. Use YAML; source is retained.';
  }
  const policy = draft.get(['spec', 'unhealthyPodEvictionPolicy']);
  if (present(policy) && policy !== 'AlwaysAllow' && policy !== 'IfHealthyBudget') return 'Unrecognized unhealthy-pod policy. Use YAML; source is retained.';
  return null;
}

export function controllerOwned(draft: ResourceEditorDraft): boolean {
  const owners = draft.get(['metadata', 'ownerReferences']);
  return Array.isArray(owners) && owners.some(owner => record(owner) && owner.controller === true);
}
export function policyReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  return context.intent === 'inspect' || context.intent === 'action' || controllerOwned(draft) || context.ownership?.status === 'controller' || context.ownership?.status === 'system' || (context.intent === 'create' ? context.capabilities.create : context.capabilities.update) !== 'available';
}

export function validatePolicy(draft: ResourceEditorDraft): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const min = draft.get(['spec', 'minAvailable']);
  const max = draft.get(['spec', 'maxUnavailable']);
  if (present(min) && present(max)) issues.push({ path: ['spec'], message: 'Choose minimum available or maximum unavailable, not both.' });
  for (const rule of ['minAvailable', 'maxUnavailable']) {
    const value = draft.get(['spec', rule]);
    if (!present(value)) continue;
    const unit = typeof value === 'string' ? 'percent' : 'pods';
    const parsed = parseBudget(typeof value === 'string' && value.endsWith('%') ? value.slice(0, -1) : String(value), unit);
    if (!parsed.valid) issues.push({ path: ['spec', rule], message: parsed.error });
  }
  const selector = draft.get(['spec', 'selector']);
  if (record(selector)) {
    if (record(selector.matchLabels)) Object.entries(selector.matchLabels).forEach(([key, value]) => {
      if (!validLabelKey(key) || typeof value !== 'string' || !validLabelValue(value)) issues.push({ path: ['spec', 'selector', 'matchLabels', key], message: 'Use a valid Kubernetes label key and value.' });
    });
    if (Array.isArray(selector.matchExpressions)) selector.matchExpressions.forEach((row, index) => {
      if (!record(row)) return;
      if (typeof row.key !== 'string' || !validLabelKey(row.key)) issues.push({ path: ['spec', 'selector', 'matchExpressions', index, 'key'], message: 'Enter a valid Kubernetes label key.' });
      if (row.operator === 'In' || row.operator === 'NotIn') {
        if (!Array.isArray(row.values) || !row.values.length || row.values.some(value => typeof value !== 'string' || !validLabelValue(value))) issues.push({ path: ['spec', 'selector', 'matchExpressions', index, 'values'], message: 'Add at least one valid label value.' });
      } else if ((row.operator === 'Exists' || row.operator === 'DoesNotExist') && Array.isArray(row.values) && row.values.length) issues.push({ path: ['spec', 'selector', 'matchExpressions', index, 'values'], message: 'Existence requirements must omit values.' });
    });
  }
  return issues;
}

export function matchesSelector(labels: Readonly<Record<string, string>>, selector: unknown): boolean {
  if (!record(selector)) return false;
  if (record(selector.matchLabels) && Object.entries(selector.matchLabels).some(([key, value]) => labels[key] !== value)) return false;
  return !Array.isArray(selector.matchExpressions) || selector.matchExpressions.every(row => {
    if (!record(row) || typeof row.key !== 'string') return false;
    const exists = Object.hasOwn(labels, row.key);
    const included = Array.isArray(row.values) && row.values.includes(labels[row.key]);
    switch (row.operator) {
      case 'In': return exists && included;
      case 'NotIn': return !exists || !included;
      case 'Exists': return exists;
      case 'DoesNotExist': return !exists;
      default: return false;
    }
  });
}

export function statusIsCurrent(draft: ResourceEditorDraft): boolean {
  const generation = draft.get(['metadata', 'generation']);
  const observed = draft.get(['status', 'observedGeneration']);
  return (typeof generation === 'bigint' || (typeof generation === 'number' && Number.isSafeInteger(generation))) && (typeof observed === 'bigint' || (typeof observed === 'number' && Number.isSafeInteger(observed))) && String(generation) === String(observed);
}
