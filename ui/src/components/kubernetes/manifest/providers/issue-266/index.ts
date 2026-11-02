import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { appsReadOnly, appsUnavailable, validateApps } from './model';

const DaemonSetEditor = lazy(() => import('./WorkloadEditor').then(module => ({ default: module.DaemonSetEditor })));
const ReplicaSetEditor = lazy(() => import('./WorkloadEditor').then(module => ({ default: module.ReplicaSetEditor })));
const ControllerRevisionEditor = lazy(() => import('./OwnerInspection'));
const sections = [{ id: 'workload', label: 'Workload' }, { id: 'containers', label: 'Containers' }, { id: 'placement', label: 'Placement' }, { id: 'status', label: 'Status' }] as const;
const workloadPaths = [
  ['spec', 'selector', 'matchLabels'],
  ['spec', 'template', 'metadata', 'labels'],
  ['spec', 'template', 'spec', 'containers'],
  ['spec', 'template', 'spec', 'nodeSelector', 'kubernetes.io/os'],
  ['spec', 'minReadySeconds'],
] as const;
const sensitivePaths = [
  ['metadata', 'annotations'],
  ['spec', 'template', 'metadata', 'annotations'],
  ['spec', 'template', 'spec', 'containers', '*', 'env', '*', 'value'],
  ['spec', 'template', 'spec', 'initContainers', '*', 'env', '*', 'value'],
] as const;

export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1,
    targets: [{ group: 'apps', version: 'v1', kind: 'DaemonSet', resource: 'daemonsets', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'], label: 'DaemonSet', sections,
    ownershipPolicy: 'declarative',
    ownedPaths: [...workloadPaths, ['spec', 'updateStrategy'], ['spec', 'revisionHistoryLimit']],
    sensitivePaths, component: DaemonSetEditor, validate: validateApps, readOnly: appsReadOnly, formUnavailable: appsUnavailable,
  },
  {
    contractVersion: 1,
    targets: [{ group: 'apps', version: 'v1', kind: 'ReplicaSet', resource: 'replicasets', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'], label: 'ReplicaSet', sections,
    ownershipPolicy: 'declarative',
    ownedPaths: [...workloadPaths, ['spec', 'replicas']], sensitivePaths,
    component: ReplicaSetEditor, validate: validateApps, readOnly: appsReadOnly, formUnavailable: appsUnavailable,
  },
  {
    contractVersion: 1,
    targets: [{ group: 'apps', version: 'v1', kind: 'ControllerRevision', resource: 'controllerrevisions', scope: 'Namespaced' }],
    intents: ['inspect'], label: 'Controller revision', sections: [{ id: 'revision', label: 'Revision and owner' }],
    ownershipPolicy: 'controller',
    ownedPaths: [], sensitivePaths: [['data'], ['metadata', 'annotations']],
    component: ControllerRevisionEditor, readOnly: () => true,
  },
];
