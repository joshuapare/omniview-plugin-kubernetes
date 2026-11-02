import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { validate, unavailable } from './model';
const component = lazy(() => import('./KedaEditor'));
export const resourceEditors: readonly ResourceEditorContribution[] = [
  { kind: 'ScaledObject', resource: 'scaledobjects', scope: 'Namespaced' },
  { kind: 'ScaledJob', resource: 'scaledjobs', scope: 'Namespaced' },
  { kind: 'TriggerAuthentication', resource: 'triggerauthentications', scope: 'Namespaced' },
  { kind: 'ClusterTriggerAuthentication', resource: 'clustertriggerauthentications', scope: 'Cluster' },
].map(target => ({
  contractVersion: 1,
  ownershipPolicy: 'declarative',
  targets: [{ ...target, scope: target.scope as 'Namespaced' | 'Cluster', group: 'keda.sh', version: 'v1alpha1' }],
  intents: ['create', 'edit', 'inspect'],
  label: `KEDA ${target.kind}`,
  sections: [{ id: 'configuration', label: 'Configuration' }],
  ownedPaths: [['spec'], ['metadata', 'annotations', 'autoscaling.keda.sh/paused']],
  sensitivePaths: [['spec', 'triggers', '*', 'metadata', 'host'], ['spec', 'triggers', '*', 'metadata', 'connection'], ['spec', 'hashiCorpVault', 'credential'], ['spec', 'azureKeyVault', 'credentials'], ['spec', 'awsSecretManager', 'credentials'], ['spec', 'gcpSecretManager', 'credentials']],
  component,
  validate,
  formUnavailable: unavailable,
} satisfies ResourceEditorContribution));
