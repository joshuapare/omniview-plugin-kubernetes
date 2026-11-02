import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { lazy } from 'react';

import { controllerPath, podGroupsPath, priorityUnavailable, schedulingReadOnly, validatePriority, validateWorkload, workloadUnavailable } from './model';

const PriorityClassForm = lazy(() => import('./PriorityClassForm'));
const WorkloadForm = lazy(() => import('./WorkloadForm'));

export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1,
    targets: [{ group: 'scheduling.k8s.io', version: 'v1', kind: 'PriorityClass', resource: 'priorityclasses', scope: 'Cluster' }],
    intents: ['create', 'edit', 'inspect'],
    label: 'Priority class',
    sections: [{ id: 'scheduling', label: 'Priority and preemption' }],
    ownedPaths: [['value'], ['preemptionPolicy'], ['globalDefault'], ['description']],
    ownershipPolicy: 'declarative',
    component: PriorityClassForm,
    validate: validatePriority,
    formUnavailable: priorityUnavailable,
    readOnly: schedulingReadOnly,
  },
  {
    contractVersion: 1,
    targets: [{ group: 'scheduling.k8s.io', version: 'v1alpha1', kind: 'Workload', resource: 'workloads', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'],
    label: 'Workload scheduling',
    sections: [{ id: 'scheduling', label: 'Pod groups' }],
    ownedPaths: [podGroupsPath, controllerPath],
    ownershipPolicy: 'conditional',
    component: WorkloadForm,
    validate: validateWorkload,
    formUnavailable: workloadUnavailable,
    readOnly: schedulingReadOnly,
  },
];
