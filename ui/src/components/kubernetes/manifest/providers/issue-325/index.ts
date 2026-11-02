import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { group, inspectOnly, validateSnapshot } from './policy';
const component = lazy(() => import('./SnapshotEditor'));
export const resourceEditors: readonly ResourceEditorContribution[] = [
  { kind: 'VolumeSnapshotClass', resource: 'volumesnapshotclasses', scope: 'Cluster', paths: [['driver'], ['deletionPolicy'], ['parameters']] },
  { kind: 'VolumeSnapshot', resource: 'volumesnapshots', scope: 'Namespaced', paths: [['spec', 'source', 'persistentVolumeClaimName'], ['spec', 'source', 'volumeSnapshotContentName'], ['spec', 'volumeSnapshotClassName']] },
  { kind: 'VolumeSnapshotContent', resource: 'volumesnapshotcontents', scope: 'Cluster', paths: [['spec', 'driver'], ['spec', 'deletionPolicy'], ['spec', 'source', 'snapshotHandle'], ['spec', 'volumeSnapshotRef', 'name'], ['spec', 'volumeSnapshotRef', 'namespace'], ['spec', 'volumeSnapshotClassName'], ['spec', 'sourceVolumeMode']] },
].map(({ kind, resource, scope, paths }) => ({
  contractVersion: 1,
  targets: [{ group, version: 'v1', kind, resource, scope: scope as 'Cluster' | 'Namespaced' }],
  intents: ['create', 'edit', 'inspect'], label: kind === 'VolumeSnapshotContent' ? 'Snapshot content import / inspection' : kind,
  sections: [{ id: 'snapshot', label: 'Snapshot' }], ownedPaths: paths,
  sensitivePaths: kind === 'VolumeSnapshotClass' ? [['parameters']] : [],
  ownershipPolicy: 'conditional', component, readOnly: inspectOnly, validate: validateSnapshot,
}));
