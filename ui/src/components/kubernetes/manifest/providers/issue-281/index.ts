import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { lazy } from 'react';

import { coordinationShapeError, leaseOwnedPaths, leaseWriteBoundary, validateLease } from './coordination';

const LeaseEditor = lazy(() => import('./LeaseEditor'));
const LeaseCandidateEditor = lazy(() => import('./LeaseCandidateEditor'));

export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1,
    targets: [{ group: 'coordination.k8s.io', version: 'v1', kind: 'Lease', resource: 'leases', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'],
    label: 'Lease coordination',
    ownershipPolicy: 'conditional',
    sections: [{ id: 'coordination', label: 'Holder and renewal' }, { id: 'ownership', label: 'Ownership' }],
    ownedPaths: leaseOwnedPaths,
    sensitivePaths: [['metadata', 'annotations', '*']],
    component: LeaseEditor,
    formUnavailable: draft => coordinationShapeError(draft),
    readOnly: (draft, context) => leaseWriteBoundary(draft, context) !== null,
    validate: (draft, context) => leaseWriteBoundary(draft, context) ? [] : validateLease(draft),
  },
  {
    contractVersion: 1,
    targets: [
      { group: 'coordination.k8s.io', version: 'v1beta1', kind: 'LeaseCandidate', resource: 'leasecandidates', scope: 'Namespaced' },
      { group: 'coordination.k8s.io', version: 'v1alpha2', kind: 'LeaseCandidate', resource: 'leasecandidates', scope: 'Namespaced' },
    ],
    intents: ['inspect'],
    label: 'Lease election participant',
    ownershipPolicy: 'controller',
    sections: [{ id: 'participant', label: 'Participant' }, { id: 'ownership', label: 'Gate and ownership' }],
    ownedPaths: [],
    sensitivePaths: [['metadata', 'annotations', '*']],
    component: LeaseCandidateEditor,
    formUnavailable: draft => coordinationShapeError(draft, true),
    readOnly: () => true,
  },
];
