import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';

const NodeMetricsInspector = lazy(() => import('./NodeMetricsInspector'));
const PodMetricsInspector = lazy(() => import('./PodMetricsInspector'));

/** Kubernetes metrics v0.35.0: optional aggregated read-only APIs, never authoring resources. */
export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1,
    targets: [{ group: 'metrics.k8s.io', version: 'v1beta1', kind: 'NodeMetrics', resource: 'nodes', scope: 'Cluster' }],
    intents: ['inspect'],
    ownershipPolicy: 'system',
    label: 'Node metrics',
    sections: [{ id: 'usage', label: 'Usage' }, { id: 'access', label: 'Access & ownership' }],
    ownedPaths: [],
    sensitivePaths: [['metadata', 'annotations']],
    readOnly: () => true,
    component: NodeMetricsInspector,
    request: { protocol: 'kubernetes.metrics.v1', buildInput: () => ({}) },
  },
  {
    contractVersion: 1,
    targets: [{ group: 'metrics.k8s.io', version: 'v1beta1', kind: 'PodMetrics', resource: 'pods', scope: 'Namespaced' }],
    intents: ['inspect'],
    ownershipPolicy: 'system',
    label: 'Pod metrics',
    sections: [{ id: 'usage', label: 'Usage' }, { id: 'access', label: 'Access & ownership' }],
    ownedPaths: [],
    sensitivePaths: [['metadata', 'annotations']],
    readOnly: () => true,
    component: PodMetricsInspector,
    request: { protocol: 'kubernetes.metrics.v1', buildInput: () => ({}) },
  },
];
