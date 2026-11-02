import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { groupPath, resourcePath, unsupportedMigration, validateMigration } from './model';

const StorageVersionMigrationForm = lazy(() => import('./StorageVersionMigrationForm'));

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: [{ group: 'storagemigration.k8s.io', version: 'v1beta1', kind: 'StorageVersionMigration', resource: 'storageversionmigrations', scope: 'Cluster' }],
  intents: ['create', 'edit', 'inspect'],
  label: 'Storage version migration',
  sections: [{ id: 'target', label: 'Migration target' }, { id: 'progress', label: 'Progress' }],
  ownedPaths: [groupPath, resourcePath],
  sensitivePaths: [['status', 'conditions', '*', 'message']],
  ownershipPolicy: 'conditional',
  component: StorageVersionMigrationForm,
  validate: validateMigration,
  formUnavailable: unsupportedMigration,
  readOnly: (_draft, context) => context.intent !== 'create',
}];
