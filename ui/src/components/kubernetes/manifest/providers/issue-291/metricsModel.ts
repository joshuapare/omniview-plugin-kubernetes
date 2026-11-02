import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';

export type MetricsKind = 'NodeMetrics' | 'PodMetrics';
export interface UsageRow { name: string; cpu: string; memory: string }
export interface MetricsSample {
  name: string;
  namespace?: string;
  timestamp: string;
  window: string;
  rows: readonly UsageRow[];
}
export type MetricsRead = { status: 'ready'; samples: readonly MetricsSample[] } | { status: 'unsupported'; message: string };
const unsupported: MetricsRead = { status: 'unsupported', message: 'Unsupported metrics shape. Inspect the read-only source.' };
const quantity = /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:(?:[eE][+-]?\d+)|(?:[numkKMGTP]i?|Ei?))?$/;
const duration = /^(?:\d+(?:\.\d+)?(?:ns|us|µs|μs|ms|s|m|h))+$/;
const namePattern = /^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const safeName = (value: unknown): value is string => typeof value === 'string' && value.length <= 253 && namePattern.test(value);
function usage(value: unknown): { cpu: string; memory: string } | null {
  if (!record(value)) return null;
  const read = (key: string) => value[key] === undefined ? 'Not reported' : typeof value[key] === 'string' && quantity.test(value[key]) ? value[key] : null;
  const cpu = read('cpu');
  const memory = read('memory');
  return cpu !== null && memory !== null ? { cpu, memory } : null;
}
function sample(value: unknown, kind: MetricsKind, fromList = false): MetricsSample | null {
  if (!record(value) || (value.apiVersion !== 'metrics.k8s.io/v1beta1' && !(fromList && value.apiVersion === undefined)) || (value.kind !== kind && !(fromList && value.kind === undefined)) || !record(value.metadata) || !safeName(value.metadata.name)) return null;
  if (kind === 'PodMetrics' && !safeName(value.metadata.namespace)) return null;
  if (typeof value.timestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value.timestamp) || !Number.isFinite(Date.parse(value.timestamp))) return null;
  if (typeof value.window !== 'string' || !duration.test(value.window)) return null;
  let rows: UsageRow[];
  if (kind === 'NodeMetrics') {
    const quantities = usage(value.usage);
    if (!quantities) return null;
    rows = [{ name: value.metadata.name, ...quantities }];
  } else {
    if (!Array.isArray(value.containers)) return null;
    rows = [];
    for (const container of value.containers) {
      if (!record(container) || !safeName(container.name)) return null;
      const quantities = usage(container.usage);
      if (!quantities) return null;
      rows.push({ name: container.name, ...quantities });
    }
  }
  return { name: value.metadata.name, namespace: kind === 'PodMetrics' ? value.metadata.namespace as string : undefined, timestamp: value.timestamp, window: value.window, rows };
}

/** Read only explicit non-sensitive metric leaves; never serialize arbitrary metadata or projections. */
export function readDraftMetrics(draft: ResourceEditorDraft, kind: MetricsKind): MetricsRead {
  const value = {
    apiVersion: draft.get(['apiVersion']), kind: draft.get(['kind']),
    metadata: { name: draft.get(['metadata', 'name']), namespace: draft.get(['metadata', 'namespace']) },
    timestamp: draft.get(['timestamp']), window: draft.get(['window']),
    usage: draft.get(['usage']), containers: draft.get(['containers']),
  };
  const result = sample(value, kind);
  return result ? { status: 'ready', samples: [result] } : unsupported;
}

/** Metrics protocol returns a Kubernetes list. Do not coerce error/unknown payloads into zero usage. */
export function readMetricsResponse(output: unknown, kind: MetricsKind, context: ResourceEditorContext): MetricsRead {
  if (!record(output) || output.apiVersion !== 'metrics.k8s.io/v1beta1' || output.kind !== `${kind}List` || !Array.isArray(output.items)) return unsupported;
  const samples: MetricsSample[] = [];
  for (const item of output.items) {
    const result = sample(item, kind, true);
    if (!result) return unsupported;
    if (context.name && result.name !== context.name) continue;
    if (context.namespace && result.namespace !== context.namespace) continue;
    samples.push(result);
  }
  return { status: 'ready', samples };
}

export function metricsAccess(context: ResourceEditorContext): string | null {
  const state = context.discovery.status;
  if (state === 'absent') return 'Metrics API is not installed or not served.';
  if (state === 'denied') return 'Metrics API discovery is denied.';
  if (state === 'unavailable') return 'Metrics API discovery is unavailable.';
  if (state === 'unknown') return 'Metrics API availability is unknown.';
  return null;
}
export function metricsQueryAccess(context: ResourceEditorContext): string | null {
  const discovery = metricsAccess(context);
  if (discovery) return discovery;
  const permission = context.capabilities.actions['kubernetes.metrics.v1'];
  if (permission === 'available') return null;
  if (permission === 'denied') return 'Metrics query is not authorized.';
  if (permission === 'absent') return 'Metrics query transport is not available.';
  if (permission === 'unavailable') return 'Metrics query service is unavailable.';
  return 'Metrics query permission is unknown.';
}
