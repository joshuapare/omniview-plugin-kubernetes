import type { ResourceEditorContribution } from '@omniviewdev/runtime';

import { lazy } from 'react';

import { policyFormUnavailable, policyReadOnly, validatePolicy } from './policy';

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: [{ group: 'policy', version: 'v1', kind: 'PodDisruptionBudget', resource: 'poddisruptionbudgets', scope: 'Namespaced' }],
  intents: ['create', 'edit', 'inspect'],
  ownershipPolicy: 'declarative',
  label: 'Pod disruption budget',
  sections: [{ id: 'budget', label: 'Budget' }, { id: 'selector', label: 'Pod selection' }, { id: 'status', label: 'Disruption status' }],
  ownedPaths: [['spec', 'minAvailable'], ['spec', 'maxUnavailable'], ['spec', 'selector'], ['spec', 'unhealthyPodEvictionPolicy']],
  component: lazy(() => import('./PodDisruptionBudgetForm')),
  formUnavailable: policyFormUnavailable,
  readOnly: policyReadOnly,
  validate: validatePolicy,
}];
