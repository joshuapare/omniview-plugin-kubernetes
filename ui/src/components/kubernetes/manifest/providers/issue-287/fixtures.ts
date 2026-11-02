import type { ResourceEditorContext } from '@omniviewdev/runtime';

export const migrationContext: ResourceEditorContext = {
  group: 'storagemigration.k8s.io', version: 'v1beta1', kind: 'StorageVersionMigration', resource: 'storageversionmigrations', scope: 'Cluster',
  connectionID: 'isolated-fixture', intent: 'create',
  capabilities: { create: 'available', update: 'available', delete: 'unknown', get: 'available', list: 'available', actions: {} },
  discovery: { status: 'available', features: { StorageVersionMigrator: 'unknown' } },
  schema: { status: 'available', paths: [['spec', 'resource', 'group'], ['spec', 'resource', 'resource']] },
};
export const createSource = `apiVersion: storagemigration.k8s.io/v1beta1
kind: StorageVersionMigration
metadata:
  name: storage-refresh
spec:
  resource:
    group: apps # target group comment
    resource: deployments
`;
export const preservationSource = `${createSource}  futureOption: 9007199254740993 # exact unknown sibling
`;
const statusHeader = `status:
  resourceVersion: "9007199254740993"
  conditions:
`;
export const migrationFixtures = {
  create: createSource,
  empty: `apiVersion: storagemigration.k8s.io/v1beta1
kind: StorageVersionMigration
metadata:
  name: ""
`,
  running: `${createSource}${statusHeader}    - type: Running
      status: "True"
      reason: MigrationRunning
      observedGeneration: 9007199254740993
      lastTransitionTime: "2026-11-01T20:00:00Z"
`,
  failed: `${createSource}${statusHeader}    - type: Failed
      status: "True"
      reason: ResourceUnavailable
      message: "Synthetic controller detail; withheld in guided views"
      lastTransitionTime: "2026-11-01T20:00:00Z"
`,
  succeeded: `${createSource}${statusHeader}    - type: Succeeded
      status: "True"
      reason: MigrationSucceeded
`,
  unobserved: createSource,
  unsupported: createSource.replace('resource: deployments', 'resource: [deployments]'),
  core: createSource.replace('group: apps', 'group: ""').replace('resource: deployments', 'resource: configmaps'),
};
