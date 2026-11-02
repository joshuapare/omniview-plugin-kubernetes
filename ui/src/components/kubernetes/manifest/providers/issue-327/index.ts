import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { unsupported, validate } from './policy';

const Policy = lazy(() => import('./forms').then(module => ({ default: module.PolicyForm })));
const Cleanup = lazy(() => import('./forms').then(module => ({ default: module.CleanupForm })));
const Exception = lazy(() => import('./forms').then(module => ({ default: module.ExceptionForm })));
const Context = lazy(() => import('./forms').then(module => ({ default: module.ContextForm })));
const Request = lazy(() => import('./forms').then(module => ({ default: module.UpdateRequestForm })));
const definition = (
  kind: string, resource: string, scope: 'Namespaced' | 'Cluster', versions: string[],
  component: ResourceEditorContribution['component'],
): ResourceEditorContribution => ({
  contractVersion: 1,
  label: `Kyverno ${kind}`,
  targets: versions.map(version => ({ group: 'kyverno.io', version, kind, resource, scope })),
  intents: kind === 'UpdateRequest' ? ['inspect'] : ['create', 'edit', 'inspect'],
  ownershipPolicy: kind === 'UpdateRequest' ? 'controller' : 'declarative',
  sections: [{ id: 'domain', label: kind === 'UpdateRequest' ? 'Controller work' : 'Configuration' }],
  ownedPaths: kind === 'UpdateRequest' ? [] : kind === 'GlobalContextEntry'
    ? [['spec', 'kubernetesResource'], ['spec', 'apiCall']]
    : kind === 'PolicyException' ? [['spec', 'exceptions'], ['spec', 'match'], ['spec', 'background']]
      : kind.endsWith('CleanupPolicy') ? [['spec', 'schedule'], ['spec', 'deletionPropagationPolicy'], ['spec', 'match'], ['spec', 'exclude']]
        : [['spec', 'rules'], ['spec', 'background']],
  sensitivePaths: kind === 'UpdateRequest' ? [['spec', 'context'], ['status', 'message']]
    : kind === 'GlobalContextEntry' ? [['spec', 'apiCall', 'service'], ['spec', 'apiCall', 'data']]
      : kind === 'Policy' || kind === 'ClusterPolicy' ? [['spec', 'rules', '*', 'context']] : [],
  component,
  validate,
  formUnavailable: unsupported,
  readOnly: (_draft, context) => kind === 'UpdateRequest' || context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system',
});

export const resourceEditors: readonly ResourceEditorContribution[] = [
  definition('Policy', 'policies', 'Namespaced', ['v1', 'v2beta1'], Policy),
  definition('ClusterPolicy', 'clusterpolicies', 'Cluster', ['v1', 'v2beta1'], Policy),
  definition('CleanupPolicy', 'cleanuppolicies', 'Namespaced', ['v2', 'v2beta1'], Cleanup),
  definition('ClusterCleanupPolicy', 'clustercleanuppolicies', 'Cluster', ['v2', 'v2beta1'], Cleanup),
  definition('PolicyException', 'policyexceptions', 'Namespaced', ['v2', 'v2beta1'], Exception),
  definition('GlobalContextEntry', 'globalcontextentries', 'Cluster', ['v2alpha1'], Context),
  definition('UpdateRequest', 'updaterequests', 'Namespaced', ['v2', 'v1beta1'], Request),
];
