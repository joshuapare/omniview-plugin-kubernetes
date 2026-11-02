import { lazy } from 'react';
import type { ResourceEditorContribution, ResourceEditorTarget } from '@omniviewdev/runtime';
import { buildMetricInput, GROUP, PROTOCOL, queryIssues, queryUnavailable, supportedVersion } from './model';

const CustomMetricsForm = lazy(() => import('./CustomMetricsForm'));
// Empty resource identifies a host-owned protocol entrypoint, not a persisted plural.
const targets: readonly ResourceEditorTarget[] = (['v1beta1', 'v1beta2'] as const).flatMap(version =>
  (['Namespaced', 'Cluster'] as const).map(scope => ({ group: GROUP, version, kind: 'MetricValue', resource: '', scope })));
const sensitivePaths = [['metadata', 'annotations'], ['items', '*', 'metadata', 'annotations']] as const;
export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1, targets, intents: ['action'], label: 'Custom metric query',
    // Declarative request configuration only; this never authors a MetricValue response.
    ownershipPolicy: 'declarative',
    sections: [{ id: 'query', label: 'Query' }, { id: 'results', label: 'Metric samples' }],
    ownedPaths: ['resource', 'metric', 'name', 'namespace', 'namespaced', 'labelSelector', 'metricLabelSelector', 'metricLabels'].map(field => ['query', field]),
    sensitivePaths, component: CustomMetricsForm,
    request: { protocol: PROTOCOL, buildInput: buildMetricInput }, validate: queryIssues,
    formUnavailable: queryUnavailable,
  },
  {
    contractVersion: 1, targets, intents: ['inspect'], label: 'Custom metric samples',
    ownershipPolicy: 'controller',
    sections: [{ id: 'results', label: 'Metric samples' }], ownedPaths: [], sensitivePaths,
    component: CustomMetricsForm, readOnly: () => true,
    formUnavailable: (_draft, context) => supportedVersion(context.version) ? null : 'Unsupported custom metrics version.',
  },
];
