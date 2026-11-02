import type { ResourceEditorDraft, ResourceEditorContext } from '@omniviewdev/runtime';

export const protocol = 'kubernetes.metrics.v1';
export const group = 'external.metrics.k8s.io';
export const version = 'v1beta1';
export const text = (value: unknown): string => typeof value === 'string' ? value : '';
export const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function queryInput(draft: ResourceEditorDraft, context: ResourceEditorContext) {
  return { group, version, operation: 'query', resource: text(draft.get(['query', 'metric'])), namespace: text(draft.get(['query', 'namespace'])) || context.namespace || '', labelSelector: text(draft.get(['query', 'labelSelector'])) };
}
export function validateQuery(draft: ResourceEditorDraft, context: ResourceEditorContext) {
  const input = queryInput(draft, context);
  const issues = [];
  if (!input.namespace) issues.push({ path: ['query', 'namespace'], message: 'Choose a namespace.' });
  if (!input.resource || /[/?#\s]/.test(input.resource)) issues.push({ path: ['query', 'metric'], message: 'Choose an advertised metric name.' });
  return issues;
}
export function discoveredMetrics(output: unknown): string[] {
  const resources = record(output).resources;
  if (!Array.isArray(resources)) return [];
  return resources.flatMap(value => {
    const item = record(value);
    return item.namespaced === true && typeof item.name === 'string' && !item.name.includes('/') && Array.isArray(item.verbs) && item.verbs.includes('list') ? [item.name] : [];
  });
}
export function metricRows(output: unknown): Record<string, unknown>[] {
  const root = record(output);
  return Array.isArray(root.items) ? root.items.map(record) : typeof root.metricName === 'string' ? [root] : [];
}
export function exactWindow(value: unknown): string {
  if (value === undefined) return 'Not supplied';
  if (typeof value === 'bigint' || typeof value === 'string' && /^\d+$/.test(value) || typeof value === 'number' && Number.isSafeInteger(value)) return `${String(value)} s`;
  return 'Exact value unavailable';
}
