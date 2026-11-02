import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  label: 'Strimzi Pod set inspection',
  targets: [{ group: 'core.strimzi.io', version: 'v1beta2', kind: 'StrimziPodSet', resource: 'strimzipodsets', scope: 'Namespaced' }],
  intents: ['inspect', 'edit'],
  sections: [{ id: 'overview', label: 'Overview' }, { id: 'membership', label: 'Pod membership' }, { id: 'ownership', label: 'Ownership' }, { id: 'reconciliation', label: 'Reconciliation' }],
  ownedPaths: [],
  sensitivePaths: [['spec', 'pods', '*', 'spec'], ['spec', 'pods', '*', 'metadata', 'annotations'], ['metadata', 'annotations'], ['status', 'conditions', '*', 'message']],
  ownershipPolicy: 'controller',
  requirements: { capabilities: ['get'] },
  readOnly: () => true,
  component: lazy(() => import('./StrimziPodSetEditor')),
}];
