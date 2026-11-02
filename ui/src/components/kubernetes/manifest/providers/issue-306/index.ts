import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { authoringReason, unsupportedShape, validatePolicy } from './model';
const component = lazy(() => import('./NetworkPolicyEditor'));
export const resourceEditors: readonly ResourceEditorContribution[] = [
  ['AdminNetworkPolicy', 'adminnetworkpolicies'],
  ['BaselineAdminNetworkPolicy', 'baselineadminnetworkpolicies'],
].map<ResourceEditorContribution>(([kind, resource]) => ({
  contractVersion: 1,
  targets: [{ group: 'policy.networking.k8s.io', version: 'v1alpha1', kind, resource, scope: 'Cluster' }],
  intents: ['create', 'edit', 'inspect'],
  label: kind,
  ownershipPolicy: 'declarative',
  sections: [{ id: 'subject', label: 'Subject & precedence' }, { id: 'ingress', label: 'Ingress' }, { id: 'egress', label: 'Egress' }],
  ownedPaths: [['spec', 'subject'], ['spec', 'ingress'], ['spec', 'egress'], ...(kind === 'AdminNetworkPolicy' ? [['spec', 'priority']] : [])],
  component,
  validate: validatePolicy,
  formUnavailable: unsupportedShape,
  readOnly: (_draft, context) => authoringReason(context) !== null,
}));
