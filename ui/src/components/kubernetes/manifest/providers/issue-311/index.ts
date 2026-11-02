import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { validate } from './semantics';
export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  ownershipPolicy: 'declarative',
  targets: [{ group: 'helm.toolkit.fluxcd.io', version: 'v2', kind: 'HelmRelease', resource: 'helmreleases', scope: 'Namespaced' }],
  intents: ['create', 'edit', 'inspect'], label: 'Flux Helm release',
  sections: [{ id: 'chart', label: 'Chart' }, { id: 'values', label: 'Values' }, { id: 'dependencies', label: 'Dependencies' }, { id: 'lifecycle', label: 'Lifecycle' }, { id: 'advanced', label: 'Advanced' }],
  ownedPaths: [ ['spec', 'interval'], ['spec', 'chart'], ['spec', 'chartRef'], ['spec', 'releaseName'], ['spec', 'targetNamespace'], ['spec', 'storageNamespace'], ['spec', 'valuesFrom'], ['spec', 'dependsOn'], ['spec', 'upgrade'], ['spec', 'driftDetection', 'mode'], ['spec', 'timeout'], ['spec', 'serviceAccountName'], ['spec', 'suspend'], ...['requestedAt', 'resetAt', 'forceAt'].map(key => ['metadata', 'annotations', `reconcile.fluxcd.io/${key}`]) ],
  sensitivePaths: [['spec', 'values'], ['spec', 'kubeConfig'], ['spec', 'postRenderers'], ['spec', 'commonMetadata', 'annotations'], ['spec', 'chart', 'metadata', 'annotations']],
  requirements: { schema: { paths: [['spec', 'interval']] } },
  readOnly: (_draft, context) => context.intent === 'inspect' || context.ownership?.status !== 'application',
  formUnavailable: draft => {
    for (const path of [['spec'], ['spec', 'chart'], ['spec', 'chartRef'], ['spec', 'upgrade']]) {
      const value = draft.get(path);
      if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) return 'Unsupported source shape. Keep protected YAML editing.';
    }
    for (const key of ['valuesFrom', 'dependsOn']) {
      const value = draft.get(['spec', key]);
      if (value !== undefined && (!Array.isArray(value) || value.some(row => row === null || typeof row !== 'object' || Array.isArray(row)))) return 'Unsupported reference rows. Keep protected YAML editing.';
    }
    return null;
  },
  validate,
  component: lazy(() => import('./HelmReleaseForm')),
}];
