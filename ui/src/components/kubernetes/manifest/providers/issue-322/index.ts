import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { operationReadOnly, pipelineRoot, validateOperation } from './model';

const component = lazy(() => import('./Operations'));
const resources = [
  ['CronOperation', 'cronoperations'],
  ['WatchOperation', 'watchoperations'],
  ['Operation', 'operations'],
] as const;
export const resourceEditors: readonly ResourceEditorContribution[] = resources.map(([kind, resource]) => {
  const root = pipelineRoot(kind);
  return {
    contractVersion: 1,
    targets: [{ group: 'ops.crossplane.io', version: 'v1alpha1', kind, resource, scope: 'Cluster' }],
    intents: ['create', 'edit', 'inspect'],
    ownershipPolicy: kind === 'Operation' ? 'conditional' : 'declarative',
    label: `Crossplane ${kind}`,
    sections: [{ id: 'settings', label: kind === 'CronOperation' ? 'Schedule' : kind === 'WatchOperation' ? 'Watch' : 'Execution' }, { id: 'pipeline', label: 'Function pipeline' }, { id: 'advanced', label: 'Advanced' }, { id: 'history', label: 'Execution history' }],
    ownedPaths: kind === 'Operation' ? [['spec', 'mode'], ['spec', 'pipeline'], ['spec', 'retryLimit']] : [['spec', 'schedule'], ['spec', 'startingDeadlineSeconds'], ['spec', 'watch'], ['spec', 'concurrencyPolicy'], ['spec', 'successfulHistoryLimit'], ['spec', 'failedHistoryLimit'], ['spec', 'operationTemplate', 'spec'], ['spec', 'operationTemplate', 'metadata', 'labels']],
    sensitivePaths: [[...root, 'pipeline', '*', 'input'], [...root, 'pipeline', '*', 'credentials'], ['spec', 'operationTemplate', 'metadata', 'annotations'], ['status', 'pipeline', '*', 'output'], ['status', 'conditions', '*', 'message']],
    component,
    readOnly: operationReadOnly,
    validate: validateOperation,
    formUnavailable(draft) {
      const pipeline = draft.get([...root, 'pipeline']);
      if (pipeline !== undefined && !Array.isArray(pipeline)) return 'Pipeline is not a supported list. Source remains unchanged.';
      if (draft.has([...root, 'mode']) && draft.get([...root, 'mode']) !== 'Pipeline') return 'Unsupported execution mode. Keep original source.';
      if (Array.isArray(pipeline) && pipeline.some((_, index) => typeof draft.get([...root, 'pipeline', index, 'step']) !== 'string' || typeof draft.get([...root, 'pipeline', index, 'functionRef', 'name']) !== 'string')) return 'Unsupported pipeline step shape. Keep original source.';
      return null;
    },
  };
});
