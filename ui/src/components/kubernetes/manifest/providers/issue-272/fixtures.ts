import type { ResourceEditorContext } from '@omniviewdev/runtime';

/** Synthetic manifests for behavior tests and the isolated production-component capture harness. */
export const storageFixtures = {
  StorageClass: `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fixture-storage
provisioner: csi.fixture.invalid
parameters:
  storageTier: archive # preserve parameter comment
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
mountOptions: ["ro", "context=alpha,beta"]
allowedTopologies:
  - matchLabelExpressions:
      - key: topology.kubernetes.io/zone
        values: [fixture-a]
        futureRequirement: retained
futureStorageField: 9007199254740993 # exact unknown scalar
`,
  VolumeAttributesClass: `apiVersion: storage.k8s.io/v1
kind: VolumeAttributesClass
metadata:
  name: fixture-attributes
driverName: csi.fixture.invalid
parameters:
  storageTier: archive
`,
  CSIDriver: `apiVersion: storage.k8s.io/v1
kind: CSIDriver
metadata:
  name: csi.fixture.invalid
spec:
  attachRequired: true
  podInfoOnMount: false
  fsGroupPolicy: ReadWriteOnceWithFSType
  storageCapacity: false
  volumeLifecycleModes: [Persistent]
  nodeAllocatableUpdatePeriodSeconds: 30
  tokenRequests:
    - audience: fixture-audience
      expirationSeconds: 3600
      futureTokenField: retained
  futureDriverField: retained
`,
  CSINode: `apiVersion: storage.k8s.io/v1
kind: CSINode
metadata:
  name: fixture-node
  ownerReferences:
    - apiVersion: v1
      kind: Node
      name: fixture-node
      uid: fixture-node-uid
spec:
  drivers:
    - name: csi.fixture.invalid
      nodeID: fixture-node-id
      topologyKeys: [topology.kubernetes.io/zone]
      allocatable:
        count: 32
`,
  CSIStorageCapacity: `apiVersion: storage.k8s.io/v1
kind: CSIStorageCapacity
metadata:
  name: fixture-capacity
  namespace: fixture-storage
storageClassName: fixture-storage
nodeTopology:
  matchLabels:
    topology.kubernetes.io/zone: fixture-a
capacity: 128Gi
maximumVolumeSize: 32Gi
`,
  VolumeAttachment: `apiVersion: storage.k8s.io/v1
kind: VolumeAttachment
metadata:
  name: fixture-attachment
spec:
  attacher: csi.fixture.invalid
  nodeName: fixture-node
  source:
    persistentVolumeName: fixture-pv
status:
  attached: false
  attachError:
    time: "2026-11-01T00:00:00Z"
    errorCode: 8
`,
} as const;
export type StorageFixtureKind = keyof typeof storageFixtures;
const resources: Record<StorageFixtureKind, string> = {
  StorageClass: 'storageclasses', VolumeAttributesClass: 'volumeattributesclasses', CSIDriver: 'csidrivers',
  CSINode: 'csinodes', CSIStorageCapacity: 'csistoragecapacities', VolumeAttachment: 'volumeattachments',
};
export function storageFixtureContext(kind: StorageFixtureKind, intent: ResourceEditorContext['intent'] = 'create'): ResourceEditorContext {
  return {
    group: 'storage.k8s.io', version: 'v1', kind, resource: resources[kind], scope: kind === 'CSIStorageCapacity' ? 'Namespaced' : 'Cluster',
    connectionID: 'fixture-only', namespace: kind === 'CSIStorageCapacity' ? 'fixture-storage' : undefined, intent,
    ownership: { status: kind === 'CSINode' || kind === 'CSIStorageCapacity' || kind === 'VolumeAttachment' ? 'controller' : 'application' },
    capabilities: { create: 'available', update: 'available', delete: 'available', get: 'available', list: 'available', actions: {} },
    discovery: { status: 'available', features: { MutableCSINodeAllocatableCount: 'available', CSIServiceAccountTokenSecrets: 'available', SELinuxMountReadWriteOncePod: 'available' } },
    schema: { status: 'available', paths: [
      ['spec'], ['spec', 'attachRequired'], ['spec', 'podInfoOnMount'], ['spec', 'fsGroupPolicy'],
      ['spec', 'storageCapacity'], ['spec', 'requiresRepublish'], ['spec', 'seLinuxMount'],
      ['spec', 'volumeLifecycleModes'], ['spec', 'tokenRequests'], ['spec', 'tokenRequests', '*'], ['spec', 'tokenRequests', '*', 'audience'],
      ['spec', 'tokenRequests', '*', 'expirationSeconds'], ['spec', 'serviceAccountTokenInSecrets'],
      ['spec', 'nodeAllocatableUpdatePeriodSeconds'], ['provisioner'], ['driverName'], ['parameters'], ['parameters', '*'],
      ['reclaimPolicy'], ['volumeBindingMode'], ['allowVolumeExpansion'], ['mountOptions'], ['mountOptions', '*'],
      ['allowedTopologies'], ['allowedTopologies', '*'], ['allowedTopologies', '*', 'matchLabelExpressions'], ['allowedTopologies', '*', 'matchLabelExpressions', '*'],
      ['allowedTopologies', '*', 'matchLabelExpressions', '*', 'key'],
      ['allowedTopologies', '*', 'matchLabelExpressions', '*', 'values'],
    ] },
  };
}
