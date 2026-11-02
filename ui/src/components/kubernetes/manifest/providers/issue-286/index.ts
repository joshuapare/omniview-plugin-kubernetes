import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { storageVersionTarget, storageVersionUnavailable } from './storageVersion';

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: [storageVersionTarget],
  intents: ['inspect', 'edit'],
  label: 'Storage version reports',
  sections: [
    { id: 'reports', label: 'Server reports' },
    { id: 'conditions', label: 'Conditions' },
    { id: 'ownership', label: 'Ownership & availability' },
  ],
  ownedPaths: [],
  sensitivePaths: [
    ['metadata', 'annotations'],
    ['status', 'conditions', '*', 'reason'],
    ['status', 'conditions', '*', 'message'],
  ],
  readOnly: () => true,
  formUnavailable: storageVersionUnavailable,
  component: lazy(() => import('./StorageVersionInspector')),
}];
