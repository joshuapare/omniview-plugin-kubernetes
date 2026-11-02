import type { ResourceEditorActionService, ResourceEditorContext } from '@omniviewdev/runtime';
import { GROUP, PROTOCOL, record, type MetricVersion } from './model';

/** Synthetic, non-sensitive test data. No service in this file contacts a cluster. */
export function metricContext(version: MetricVersion = 'v1beta2', intent: 'inspect' | 'action' = 'action'): ResourceEditorContext {
  return { group: GROUP, version, kind: 'MetricValue', resource: '', scope: 'Cluster', connectionID: 'fixture-only', intent,
    capabilities: { create: 'absent', update: 'absent', delete: 'absent', list: 'absent', get: 'available', actions: { [PROTOCOL]: 'available' } },
    discovery: { status: 'available', features: {} }, schema: { status: 'available' } };
}
export const initialQuerySource = `apiVersion: custom.metrics.k8s.io/v1beta2
kind: MetricValue
query: {}
`;
export const populatedQuerySource = `apiVersion: custom.metrics.k8s.io/v1beta2
kind: MetricValue
query:
  resource: pods
  metric: work_items
  namespaced: true
  namespace: fixture-team
  name: fixture-worker
  metricLabels:
    lane: fast
  metricLabelSelector: region in (west,east)
  futureOption: 9007199254740993 # retain exact future option
`;
export const fixtureDiscoveryResources = [
  { name: 'pods/work_items', kind: 'MetricValueList', namespaced: true, verbs: ['get'] },
  { name: 'nodes/work_items', kind: 'MetricValueList', namespaced: false, verbs: ['get'] },
  { name: 'namespaces/work_items', kind: 'MetricValueList', namespaced: false, verbs: ['get'] },
  { name: 'deployments.apps/work_items', kind: 'MetricValueList', namespaced: true, verbs: ['get'] },
];
export function metricResponse(version: MetricVersion = 'v1beta2', window?: unknown) {
  const sample = {
    describedObject: { apiVersion: 'v1', kind: 'Pod', name: 'fixture-worker', namespace: 'fixture-team' },
    ...(version === 'v1beta2' ? { metric: { name: 'work_items', selector: { matchLabels: { lane: 'returned' } } }, ...(window === undefined ? {} : { windowSeconds: window }) } : { metricName: 'work_items', selector: { matchLabels: { lane: 'returned' } }, ...(window === undefined ? {} : { window }) }),
    timestamp: '2026-11-01T12:00:00Z', value: '9007199254740993m',
  };
  return { apiVersion: `${GROUP}/${version}`, kind: 'MetricValueList', metadata: { resourceVersion: 'fixture-version' }, items: [sample] };
}
export type FixtureState = 'ready' | 'empty' | 'denied' | 'absent' | 'unavailable' | 'unsupported' | 'sensitive';
export function fixtureMetricsTransport(state: FixtureState = 'ready'): ResourceEditorActionService {
  return { execute: request => {
    if (request.signal.aborted) return Promise.resolve({ status: 'cancelled', message: 'Fixture request cancelled.' });
    if (request.protocol !== PROTOCOL) return Promise.resolve({ status: 'unavailable', message: 'No fixture protocol configured.' });
    if (state === 'denied' || state === 'absent' || state === 'unavailable') return Promise.resolve({ status: state, message: 'Fixture-only availability state.' });
    const input = record(request.input);
    const version = input?.version === 'v1beta1' ? 'v1beta1' : 'v1beta2';
    if (input?.operation === 'discover') return Promise.resolve({ status: 'ready', output: { groupVersion: `${GROUP}/${version}`, resources: fixtureDiscoveryResources } });
    if (state === 'sensitive') return Promise.resolve({ status: 'ready', sensitive: true, output: {} });
    if (state === 'unsupported') return Promise.resolve({ status: 'ready', output: { apiVersion: `${GROUP}/${version}`, kind: 'UnknownMetricEnvelope' } });
    return Promise.resolve({ status: 'ready', output: { ...metricResponse(version), ...(state === 'empty' ? { items: [] } : {}) } });
  } };
}
