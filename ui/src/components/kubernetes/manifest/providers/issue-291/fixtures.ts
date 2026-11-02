import type { ResourceEditorContext } from '@omniviewdev/runtime';

/** Synthetic, non-sensitive verification fixtures. Never used as production query defaults. */
export const nodeMetricsFixture = {
  apiVersion: 'metrics.k8s.io/v1beta1', kind: 'NodeMetrics',
  metadata: { name: 'preview-node' }, timestamp: '2026-11-01T12:00:00Z', window: '30s',
  usage: { cpu: '123456789n', memory: '9007199254740993Ki', 'example.test/extra': '7' },
};
export const podMetricsFixture = {
  apiVersion: 'metrics.k8s.io/v1beta1', kind: 'PodMetrics',
  metadata: { name: 'preview-pod', namespace: 'preview' }, timestamp: '2026-11-01T12:00:00Z', window: '30s',
  containers: [
    { name: 'frontend', usage: { cpu: '120m', memory: '96Mi' } },
    { name: 'sidecar', usage: { cpu: '2500000n', memory: '16384Ki' } },
  ],
};
export const nodeMetricsListFixture = { apiVersion: 'metrics.k8s.io/v1beta1', kind: 'NodeMetricsList', items: [nodeMetricsFixture] };
export const podMetricsListFixture = { apiVersion: 'metrics.k8s.io/v1beta1', kind: 'PodMetricsList', items: [podMetricsFixture] };
export const metricsFixtureContext: ResourceEditorContext = {
  group: 'metrics.k8s.io', version: 'v1beta1', kind: 'NodeMetrics', resource: 'nodes', scope: 'Cluster',
  connectionID: 'fixture-only', intent: 'inspect',
  capabilities: { create: 'absent', update: 'absent', delete: 'absent', get: 'available', list: 'available', actions: { 'kubernetes.metrics.v1': 'available' } },
  discovery: { status: 'available', features: {} }, schema: { status: 'available' },
};
export const nodeMetricsSource = `# Synthetic read-only measurement; no live effects.
apiVersion: metrics.k8s.io/v1beta1
kind: NodeMetrics
metadata:
  name: preview-node
timestamp: '2026-11-01T12:00:00Z'
window: 30s
usage:
  cpu: 123456789n
  memory: 9007199254740993Ki
  example.test/extra: '7'
`;
export const podMetricsSource = `# Synthetic read-only measurement; no live effects.
apiVersion: metrics.k8s.io/v1beta1
kind: PodMetrics
metadata:
  name: preview-pod
  namespace: preview
timestamp: '2026-11-01T12:00:00Z'
window: 30s
containers:
  - name: frontend
    usage:
      cpu: 120m
      memory: 96Mi
  - name: sidecar
    usage:
      cpu: 2500000n
      memory: 16384Ki
`;
