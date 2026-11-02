import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export const GROUP = 'custom.metrics.k8s.io';
export const PROTOCOL = 'kubernetes.metrics.v1';
export type MetricVersion = 'v1beta1' | 'v1beta2';
export interface DiscoveredMetric { name: string; resource: string; metric: string; namespaced: boolean; }
export interface MetricQuery {
  operation: 'query'; group: typeof GROUP; version: MetricVersion; resource: string; metric: string; name: string;
  namespace?: string; labelSelector?: string; metricLabelSelector?: string;
}
export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function supportedVersion(value: string): value is MetricVersion { return value === 'v1beta1' || value === 'v1beta2'; }
const segment = /^[a-zA-Z0-9_][a-zA-Z0-9_.:-]*$/;
const hasControl = (value: string): boolean => Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

export function parseQueryText(field: string, value: string, required = false): { valid: true; value: string } | { valid: false; error: string } {
  if (hasControl(value)) return { valid: false, error: 'Control characters are not allowed.' };
  if (required && !value) return { valid: false, error: 'Enter a value.' };
  if (field === 'namespace' && !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value)) return { valid: false, error: 'Enter a namespace.' };
  if (field === 'name' && !segment.test(value)) return { valid: false, error: 'Enter an object name.' };
  return { valid: true, value };
}

export function queryUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (!supportedVersion(context.version)) return 'Unsupported custom metrics version.';
  if (!draft.has(['query'])) return null;
  const query = record(draft.get(['query']));
  if (!query) return 'Query configuration is not a supported mapping. Source remains unchanged.';
  for (const field of ['resource', 'metric', 'name', 'namespace', 'labelSelector', 'metricLabelSelector']) {
    if (query[field] !== undefined && typeof query[field] !== 'string') return 'Unsupported query field type. Source remains unchanged.';
  }
  if (query.namespaced !== undefined && typeof query.namespaced !== 'boolean') return 'Unsupported resource scope. Source remains unchanged.';
  if (query.metricLabels !== undefined && (!record(query.metricLabels) || Object.values(record(query.metricLabels)!).some(value => typeof value !== 'string'))) return 'Unsupported metric label filters. Source remains unchanged.';
  return null;
}

/** Discovery supplies exact group-qualified resources and scope, never a guessed plural. */
export function discoveredMetrics(output: unknown, version: MetricVersion): DiscoveredMetric[] | null {
  const body = record(output);
  if (!body || body.groupVersion !== `${GROUP}/${version}` || !Array.isArray(body.resources)) return null;
  const result: DiscoveredMetric[] = [];
  for (const value of body.resources) {
    const item = record(value);
    if (!item || item.kind !== 'MetricValueList' || typeof item.namespaced !== 'boolean' || !Array.isArray(item.verbs) || !item.verbs.includes('get')) continue;
    const parts = text(item.name).split('/');
    if (parts.length !== 2 || !parts.every(part => segment.test(part))) continue;
    if (!result.some(entry => entry.name === item.name)) result.push({ name: text(item.name), resource: parts[0], metric: parts[1], namespaced: item.namespaced });
  }
  return result;
}

export function queryFromDraft(draft: ResourceEditorDraft, context: ResourceEditorContext): MetricQuery {
  const labels = record(draft.get(['query', 'metricLabels']));
  const equality = labels ? Object.entries(labels).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([key, value]) => `${key}=${value}`) : [];
  const advanced = text(draft.get(['query', 'metricLabelSelector']));
  const metricSelector = [...equality, ...(advanced ? [advanced] : [])].join(',');
  return {
    operation: 'query', group: GROUP, version: context.version as MetricVersion,
    resource: text(draft.get(['query', 'resource'])), metric: text(draft.get(['query', 'metric'])),
    name: text(draft.get(['query', 'name'])),
    ...(draft.get(['query', 'namespaced']) === true ? { namespace: text(draft.get(['query', 'namespace'])) } : {}),
    ...(text(draft.get(['query', 'labelSelector'])) ? { labelSelector: text(draft.get(['query', 'labelSelector'])) } : {}),
    ...(metricSelector ? { metricLabelSelector: metricSelector } : {}),
  };
}
export function queryIssues(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const query = queryFromDraft(draft, context);
  const issues: ResourceEditorFieldIssue[] = [];
  const add = (field: string, message: string) => issues.push({ path: ['query', field], message });
  if (!supportedVersion(query.version)) add('version', 'This response version is not supported.');
  if (!segment.test(query.resource) || !segment.test(query.metric)) add('resource', 'Select a discovered resource and metric.');
  if (draft.get(['query', 'namespaced']) !== true && draft.get(['query', 'namespaced']) !== false) add('resource', 'Resource scope must come from discovery.');
  if (!query.name || (query.name !== '*' && !segment.test(query.name))) add('name', 'Enter an object name, or select matching objects.');
  if (query.namespace !== undefined && !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(query.namespace)) add('namespace', 'Enter a namespace.');
  if (query.resource === 'namespaces' && query.name === '*') add('name', 'Namespace metrics require one namespace.');
  const labels = draft.get(['query', 'metricLabels']);
  if (labels !== undefined && (!record(labels) || Object.values(record(labels)!).some(value => typeof value !== 'string'))) add('metricLabels', 'Metric label filters must contain text values.');
  if (query.name !== '*' && query.labelSelector) add('labelSelector', 'Object filters apply only to matching objects.');
  for (const field of ['labelSelector', 'metricLabelSelector'] as const) {
    if (hasControl(query[field] ?? '')) add(field, 'Selectors cannot contain control characters.');
  }
  return issues;
}
export function buildMetricInput(draft: ResourceEditorDraft, context: ResourceEditorContext): MetricQuery {
  if (queryIssues(draft, context).length) throw new Error('Complete the custom metrics query.');
  return queryFromDraft(draft, context);
}
export function queryPath(query: MetricQuery): string {
  const prefix = `/apis/${GROUP}/${query.version}`;
  const encode = encodeURIComponent;
  const destination = query.resource === 'namespaces'
    ? `/namespaces/${encode(query.name)}/metrics/${encode(query.metric)}`
    : `${query.namespace !== undefined ? `/namespaces/${encode(query.namespace)}` : ''}/${encode(query.resource)}/${query.name === '*' ? '*' : encode(query.name)}/${encode(query.metric)}`;
  const params = new URLSearchParams();
  if (query.labelSelector) params.set('labelSelector', query.labelSelector);
  if (query.metricLabelSelector) params.set('metricLabelSelector', query.metricLabelSelector);
  return `${prefix}${destination}${params.size ? `?${params}` : ''}`;
}

export interface MetricSample {
  object: { apiVersion: string; kind: string; name: string; namespace: string };
  metric: string; selector: string; timestamp: string; window: string; value: string;
}
export type MetricResponse = { status: 'ready'; samples: readonly MetricSample[] } | { status: 'unsupported'; message: string };
function exactWindow(value: unknown): string | null {
  if (value === undefined || value === null) return 'Not reported';
  if (typeof value === 'bigint') return value >= 0n && value <= 9223372036854775807n ? `${value} s` : null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? `${value} s` : null;
  if (typeof value === 'string' && /^\d+$/.test(value) && BigInt(value) <= 9223372036854775807n) return `${value} s`;
  return null;
}
function selectorText(value: unknown): string | null {
  if (value === undefined || value === null) return 'Not reported';
  const selector = record(value);
  if (!selector) return null;
  const labels = selector.matchLabels === undefined ? {} : record(selector.matchLabels);
  if (!labels || Object.values(labels).some(value => typeof value !== 'string')) return null;
  const result: string[] = [];
  for (const [key, value] of Object.entries(labels)) {
    if (typeof value !== 'string') return null;
    result.push(`${key}=${value}`);
  }
  if (selector.matchExpressions !== undefined) {
    if (!Array.isArray(selector.matchExpressions)) return null;
    for (const raw of selector.matchExpressions) {
      const expression = record(raw);
      if (!expression || typeof expression.key !== 'string' || !['In', 'NotIn', 'Exists', 'DoesNotExist'].includes(text(expression.operator))) return null;
      const values = expression.values === undefined ? [] : expression.values;
      if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) return null;
      if (expression.operator === 'Exists') result.push(expression.key);
      else if (expression.operator === 'DoesNotExist') result.push(`!${expression.key}`);
      else result.push(`${expression.key} ${expression.operator === 'In' ? 'in' : 'notin'} (${values.join(',')})`);
    }
  }
  return result.join(', ') || 'All metric labels';
}
/** Project only known response fields. Never expose annotations, opaque values or raw server bodies. */
export function inspectMetricResponse(output: unknown, version: MetricVersion): MetricResponse {
  const body = record(output);
  const unsupported = (): MetricResponse => ({ status: 'unsupported', message: 'Unsupported metric response. Original source remains unchanged.' });
  if (!body || body.apiVersion !== `${GROUP}/${version}`) return unsupported();
  const items = body.kind === 'MetricValueList' ? body.items : body.kind === 'MetricValue' ? [body] : undefined;
  if (!Array.isArray(items)) return unsupported();
  const samples: MetricSample[] = [];
  for (const raw of items) {
    const item = record(raw);
    const object = record(item?.describedObject);
    const metric = record(item?.metric);
    const name = version === 'v1beta2' ? metric?.name : item?.metricName;
    const selector = selectorText(version === 'v1beta2' ? metric?.selector : item?.selector);
    const window = exactWindow(version === 'v1beta2' ? item?.windowSeconds : item?.window);
    if (!item || !object || !text(object.name) || !text(object.kind) || !text(object.apiVersion) || typeof name !== 'string' || !name || typeof item.value !== 'string' || !item.value || typeof item.timestamp !== 'string' || !item.timestamp || window === null || selector === null) return unsupported();
    samples.push({ object: { apiVersion: text(object.apiVersion), kind: text(object.kind), name: text(object.name), namespace: text(object.namespace) }, metric: name, selector, timestamp: item.timestamp, window, value: item.value });
  }
  return { status: 'ready', samples };
}
