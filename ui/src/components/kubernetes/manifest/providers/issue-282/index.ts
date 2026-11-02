import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { lazy } from 'react';

import { readOnly, target, unavailable, validate } from './model';

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: [target],
  intents: ['create', 'edit', 'inspect'],
  ownershipPolicy: 'declarative',
  label: 'RuntimeClass',
  sections: [{ id: 'runtime', label: 'Runtime & overhead' }, { id: 'scheduling', label: 'Scheduling' }, { id: 'metadata', label: 'Labels' }],
  ownedPaths: [['handler'], ['overhead', 'podFixed', 'cpu'], ['overhead', 'podFixed', 'memory'], ['scheduling', 'nodeSelector'], ['scheduling', 'tolerations'], ['metadata', 'labels']],
  sensitivePaths: [['metadata', 'annotations', '*']],
  component: lazy(() => import('./RuntimeClassForm')),
  validate,
  formUnavailable: unavailable,
  readOnly,
}];
