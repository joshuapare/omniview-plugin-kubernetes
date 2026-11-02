import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { ownershipReason, validate } from './policy';

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  ownershipPolicy: 'declarative',
  targets: [{ group: 'kustomize.toolkit.fluxcd.io', version: 'v1', kind: 'Kustomization', resource: 'kustomizations', scope: 'Namespaced' }],
  intents: ['create', 'edit', 'inspect'],
  label: 'Flux Kustomization',
  sections: [{ id: 'source', label: 'Source & destination' }, { id: 'reconciliation', label: 'Reconciliation' }, { id: 'health', label: 'Dependencies & health' }, { id: 'substitutions', label: 'Substitution references' }, { id: 'decryption', label: 'Decryption & identity' }, { id: 'advanced', label: 'Advanced & inventory' }],
  ownedPaths: ['sourceRef', 'path', 'interval', 'targetNamespace', 'prune', 'deletionPolicy', 'wait', 'force', 'suspend', 'timeout', 'retryInterval', 'dependsOn', 'healthChecks', 'postBuild', 'decryption', 'serviceAccountName'].map(key => ['spec', key]),
  sensitivePaths: [['spec', 'postBuild', 'substitute'], ['spec', 'patches'], ['spec', 'commonMetadata', 'annotations']],
  component: lazy(() => import('./KustomizationEditor')),
  validate,
  readOnly: (draft, context) => context.intent === 'inspect' || ownershipReason(draft, context) !== null,
}];
