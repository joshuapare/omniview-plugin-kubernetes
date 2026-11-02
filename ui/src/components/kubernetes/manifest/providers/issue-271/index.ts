import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { lazy } from 'react';

import { formUnavailable, isReadOnly, validate } from './model';

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: [{ group: 'discovery.k8s.io', version: 'v1', kind: 'EndpointSlice', resource: 'endpointslices', scope: 'Namespaced' }],
  intents: ['create', 'edit', 'inspect'],
  label: 'EndpointSlice',
  ownershipPolicy: 'conditional',
  sections: [{ id: 'association', label: 'Ownership & Service' }, { id: 'endpoints', label: 'Backends' }, { id: 'ports', label: 'Backend ports' }],
  ownedPaths: [['addressType'], ['endpoints'], ['ports'], ['metadata', 'labels', 'kubernetes.io/service-name'], ['metadata', 'labels', 'endpointslice.kubernetes.io/managed-by']],
  component: lazy(() => import('./EndpointSliceForm')),
  formUnavailable,
  readOnly: isReadOnly,
  validate,
}];
