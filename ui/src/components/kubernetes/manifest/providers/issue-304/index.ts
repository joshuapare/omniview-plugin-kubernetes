import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { backingCatalog } from './catalog';
const BackingInspector = lazy(() => import('./BackingInspector'));
export const resourceEditors: readonly ResourceEditorContribution[] = backingCatalog.map(resource => ({
  contractVersion: 1,
  ownershipPolicy: 'system',
  targets: [{ group: 'crd.projectcalico.org', version: 'v1', kind: resource.kind, resource: resource.resource, scope: resource.scope }],
  intents: ['inspect', 'edit'],
  label: resource.kind + ' backing record',
  sections: [{ id: 'observed', label: 'Observed configuration' }, { id: 'ownership', label: 'Ownership & destination' }, { id: 'advanced', label: 'Advanced fields' }],
  ownedPaths: [],
  sensitivePaths: [['metadata', 'annotations'], ...resource.sensitiveFields.map(key => ['spec', key])],
  readOnly: () => true,
  component: BackingInspector,
}));
