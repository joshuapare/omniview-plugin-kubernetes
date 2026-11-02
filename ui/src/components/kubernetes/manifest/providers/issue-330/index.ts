import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';

const PolicyReport = lazy(() => import('./PolicyReport'));
export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: [
    { group: 'wgpolicyk8s.io', version: 'v1alpha2', kind: 'PolicyReport', resource: 'policyreports', scope: 'Namespaced' },
    { group: 'wgpolicyk8s.io', version: 'v1alpha2', kind: 'ClusterPolicyReport', resource: 'clusterpolicyreports', scope: 'Cluster' },
  ],
  intents: ['inspect', 'edit'],
  label: 'Policy report inspection',
  sections: [{ id: 'results', label: 'Results' }, { id: 'ownership', label: 'Ownership' }],
  ownedPaths: [],
  sensitivePaths: [['metadata', 'annotations'], ['results', '*', 'message'], ['results', '*', 'properties']],
  ownershipPolicy: 'controller',
  requirements: { capabilities: ['get'] },
  component: PolicyReport,
  readOnly: () => true,
}];
