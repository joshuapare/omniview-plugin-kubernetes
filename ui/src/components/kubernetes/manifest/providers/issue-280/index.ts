import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { ownershipReason, target, unsupportedShape, validateAPIService } from './apiService';

const APIServiceForm = lazy(() => import('./APIServiceForm'));

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: [target],
  intents: ['create', 'edit', 'inspect'],
  label: 'APIService registration',
  ownershipPolicy: 'declarative',
  sections: [{ id: 'registration', label: 'Registration' }, { id: 'service', label: 'Service & TLS' }, { id: 'metadata', label: 'Labels' }, { id: 'availability', label: 'Availability' }],
  ownedPaths: [['spec', 'group'], ['spec', 'version'], ['spec', 'groupPriorityMinimum'], ['spec', 'versionPriority'], ['spec', 'service'], ['spec', 'caBundle'], ['spec', 'insecureSkipTLSVerify'], ['metadata', 'labels']],
  sensitivePaths: [['spec', 'caBundle'], ['metadata', 'annotations', '*'], ['status', 'conditions', '*', 'message']],
  requirements: { schema: { paths: [['spec', 'group'], ['spec', 'version'], ['spec', 'service'], ['spec', 'groupPriorityMinimum'], ['spec', 'versionPriority']] } },
  component: APIServiceForm,
  validate: validateAPIService,
  formUnavailable: unsupportedShape,
  readOnly: (draft, context) => context.intent === 'inspect' || !!ownershipReason(draft) || context.ownership?.status === 'controller' || context.ownership?.status === 'system',
}];
