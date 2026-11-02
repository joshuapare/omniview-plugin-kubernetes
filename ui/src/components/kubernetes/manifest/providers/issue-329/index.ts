import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';

const component = lazy(() => import('./EphemeralReportInspector'));

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: [
    { group: 'reports.kyverno.io', version: 'v1', kind: 'EphemeralReport', resource: 'ephemeralreports', scope: 'Namespaced' },
    { group: 'reports.kyverno.io', version: 'v1', kind: 'ClusterEphemeralReport', resource: 'clusterephemeralreports', scope: 'Cluster' },
  ],
  intents: ['edit', 'inspect'],
  label: 'Kyverno transient evidence',
  sections: [{ id: 'outcomes', label: 'Rule outcomes' }, { id: 'ownership', label: 'Owner & provenance' }, { id: 'boundary', label: 'Action boundary' }],
  ownedPaths: [],
  sensitivePaths: [['metadata', 'annotations'], ['spec', 'results', '*', 'message'], ['spec', 'results', '*', 'properties']],
  ownershipPolicy: 'controller',
  requirements: { capabilities: ['get'] },
  readOnly: () => true,
  component,
}];
