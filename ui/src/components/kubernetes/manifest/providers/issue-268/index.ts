import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { hpaReadOnly, hpaUnavailable, validateHPA } from './model';

const HorizontalPodAutoscalerEditor = lazy(() => import('./HorizontalPodAutoscalerEditor'));

export const resourceEditors: readonly ResourceEditorContribution[] = ['v2', 'v1'].map((version): ResourceEditorContribution => ({
  contractVersion: 1,
  ownershipPolicy: 'declarative',
  label: version === 'v1' ? 'Horizontal Pod Autoscaler · CPU compatibility' : 'Horizontal Pod Autoscaler',
  targets: [{ group: 'autoscaling', version, kind: 'HorizontalPodAutoscaler', resource: 'horizontalpodautoscalers', scope: 'Namespaced' }],
  intents: ['create', 'edit', 'inspect'],
  sections: [
    { id: 'target', label: 'Scale target' },
    { id: 'bounds', label: 'Replica bounds' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'behavior', label: 'Behavior' },
    { id: 'status', label: 'Status' },
  ],
  ownedPaths: [
    ['spec', 'scaleTargetRef', 'apiVersion'], ['spec', 'scaleTargetRef', 'kind'], ['spec', 'scaleTargetRef', 'name'],
    ['spec', 'minReplicas'], ['spec', 'maxReplicas'],
    ...(version === 'v2' ? [['spec', 'metrics'], ['spec', 'behavior', 'scaleUp'], ['spec', 'behavior', 'scaleDown']] : [['spec', 'targetCPUUtilizationPercentage']]),
  ],
  component: HorizontalPodAutoscalerEditor,
  readOnly: hpaReadOnly,
  formUnavailable: hpaUnavailable,
  validate: validateHPA,
}));
