import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { group, version, validate, unavailable } from './policy';
const component = lazy(() => import('./forms'));
export const resourceEditors: readonly ResourceEditorContribution[] = [
  { contractVersion: 1, label: 'CSI group snapshot class', targets: [{ group, version, kind: 'VolumeGroupSnapshotClass', resource: 'volumegroupsnapshotclasses', scope: 'Cluster' }], intents: ['create', 'edit', 'inspect'], ownershipPolicy: 'declarative', sections: [{ id: 'policy', label: 'Driver policy' }], ownedPaths: [['driver'], ['deletionPolicy'], ['parameters']], sensitivePaths: [['parameters']], component, validate },
  { contractVersion: 1, label: 'CSI group snapshot', targets: [{ group, version, kind: 'VolumeGroupSnapshot', resource: 'volumegroupsnapshots', scope: 'Namespaced' }], intents: ['create', 'edit', 'inspect'], ownershipPolicy: 'declarative', sections: [{ id: 'snapshot', label: 'Snapshot request' }], ownedPaths: [['spec', 'source'], ['spec', 'volumeGroupSnapshotClassName']], component, validate },
  { contractVersion: 1, label: 'CSI group snapshot content', targets: [{ group, version, kind: 'VolumeGroupSnapshotContent', resource: 'volumegroupsnapshotcontents', scope: 'Cluster' }], intents: ['create', 'edit', 'inspect'], ownershipPolicy: 'conditional', sections: [{ id: 'content', label: 'Import and binding' }], ownedPaths: [['spec', 'driver'], ['spec', 'deletionPolicy'], ['spec', 'source'], ['spec', 'volumeGroupSnapshotRef'], ['spec', 'volumeGroupSnapshotClassName']], component, validate, formUnavailable: unavailable, readOnly: (_draft, context) => context.intent !== 'create' && context.ownership?.status !== 'application' },
];
