import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { annotationPath, formUnavailable, protectedPolicy, validate } from './domain';

const group = 'flowcontrol.apiserver.k8s.io';
const FlowSchemaForm = lazy(() => import('./FlowSchemaForm'));
const PriorityLevelForm = lazy(() => import('./PriorityLevelForm'));
export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    targets: [{ group, version: 'v1', kind: 'FlowSchema', resource: 'flowschemas', scope: 'Cluster' }],
    intents: ['create', 'edit', 'inspect'],
    label: 'API request routing',
    sections: [{ id: 'routing', label: 'Routing' }, { id: 'matching', label: 'Matching' }, { id: 'status', label: 'Status' }],
    ownedPaths: [['spec', 'priorityLevelConfiguration', 'name'], ['spec', 'matchingPrecedence'], ['spec', 'distinguisherMethod'], ['spec', 'rules'], annotationPath],
    component: FlowSchemaForm,
    formUnavailable,
    readOnly: protectedPolicy,
    validate,
  },
  {
    contractVersion: 1,
    targets: [{ group, version: 'v1', kind: 'PriorityLevelConfiguration', resource: 'prioritylevelconfigurations', scope: 'Cluster' }],
    ownershipPolicy: 'declarative',
    intents: ['create', 'edit', 'inspect'],
    label: 'API concurrency policy',
    sections: [{ id: 'capacity', label: 'Capacity and overload' }, { id: 'status', label: 'Status' }],
    ownedPaths: [['spec', 'type'], ['spec', 'limited'], ['spec', 'exempt', 'nominalConcurrencyShares'], ['spec', 'exempt', 'lendablePercent'], annotationPath],
    component: PriorityLevelForm,
    formUnavailable,
    readOnly: protectedPolicy,
    validate,
  },
];
