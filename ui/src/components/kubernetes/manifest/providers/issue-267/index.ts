import { lazy } from 'react';
import type { ResourceEditorContribution, ResourceEditorPath } from '@omniviewdev/runtime';
import { batchReadOnly, batchUnavailable, validateBatch } from './batchModel';

const JobEditor = lazy(() => import('./BatchForm').then(module => ({ default: module.JobEditor })));
const CronJobEditor = lazy(() => import('./BatchForm').then(module => ({ default: module.CronJobEditor })));

const jobFields = ['parallelism', 'completions', 'backoffLimit', 'activeDeadlineSeconds', 'ttlSecondsAfterFinished', 'completionMode', 'backoffLimitPerIndex', 'maxFailedIndexes', 'podReplacementPolicy', 'managedBy'] as const;
function executionPaths(base: ResourceEditorPath): readonly ResourceEditorPath[] {
  return [
    ...jobFields.map(field => [...base, field]),
    [...base, 'template', 'spec', 'containers'],
    [...base, 'template', 'spec', 'restartPolicy'],
    [...base, 'template', 'metadata', 'labels'],
  ];
}

export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1,
    targets: [{ group: 'batch', version: 'v1', kind: 'Job', resource: 'jobs', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'],
    label: 'Job',
    ownershipPolicy: 'declarative',
    sections: [{ id: 'template', label: 'Pod template' }, { id: 'execution', label: 'Execution' }, { id: 'status', label: 'Observed status' }],
    ownedPaths: [...executionPaths(['spec']), ['spec', 'suspend']],
    sensitivePaths: [['spec', 'template', 'spec', 'containers', '*', 'env'], ['spec', 'template', 'spec', 'initContainers', '*', 'env']],
    component: JobEditor,
    validate: validateBatch,
    readOnly: batchReadOnly,
    formUnavailable: batchUnavailable,
  },
  {
    contractVersion: 1,
    targets: [{ group: 'batch', version: 'v1', kind: 'CronJob', resource: 'cronjobs', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'],
    label: 'CronJob',
    ownershipPolicy: 'declarative',
    sections: [{ id: 'schedule', label: 'Schedule & history' }, { id: 'template', label: 'Future Pod template' }, { id: 'execution', label: 'Future Job execution' }, { id: 'workflow', label: 'Manual execution' }, { id: 'status', label: 'Observed status' }],
    ownedPaths: [
      ...executionPaths(['spec', 'jobTemplate', 'spec']),
      ...['schedule', 'timeZone', 'concurrencyPolicy', 'suspend', 'startingDeadlineSeconds', 'successfulJobsHistoryLimit', 'failedJobsHistoryLimit'].map(field => ['spec', field]),
    ],
    sensitivePaths: [['spec', 'jobTemplate', 'spec', 'template', 'spec', 'containers', '*', 'env'], ['spec', 'jobTemplate', 'spec', 'template', 'spec', 'initContainers', '*', 'env']],
    component: CronJobEditor,
    validate: validateBatch,
    readOnly: batchReadOnly,
    formUnavailable: batchUnavailable,
  },
];
