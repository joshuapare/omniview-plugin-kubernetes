import type { ResourceEditorContext, ResourceEditorContribution, ResourceEditorPath } from '@omniviewdev/runtime';
import { compareQuantity, inspectManifest, quantity, readManifestValue } from './manifestDraft';

/** Kubernetes immutable fields are enforced for both form patches and raw source submission. */
export function immutableEditorPaths(context: ResourceEditorContext): readonly ResourceEditorPath[] {
  if (context.intent !== 'edit') return [];
  if (context.group === 'rbac.authorization.k8s.io' && ['RoleBinding', 'ClusterRoleBinding'].includes(context.kind)) return [['roleRef']];
  if (context.group === 'node.k8s.io' && context.kind === 'RuntimeClass') return [['handler']];
  if (context.group === 'certificates.k8s.io' && context.kind === 'ClusterTrustBundle') return [['spec', 'signerName']];
  if (context.group === 'batch' && context.kind === 'Job') return [['spec', 'selector'], ['spec', 'template'], ['spec', 'completionMode'], ['spec', 'podFailurePolicy'], ['spec', 'backoffLimitPerIndex'], ['spec', 'managedBy'], ['spec', 'successPolicy']];
  if (context.group === 'apps' && ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'].includes(context.kind)) return [['spec', 'selector']];
  if (context.group === 'storage.k8s.io' && context.kind === 'StorageClass') return [['provisioner'], ['parameters'], ['reclaimPolicy'], ['volumeBindingMode']];
  if (context.group === 'storage.k8s.io' && context.kind === 'VolumeAttributesClass') return [['driverName'], ['parameters']];
  if (context.group === 'storage.k8s.io' && context.kind === 'CSIDriver') return [['spec', 'attachRequired'], ['spec', 'volumeLifecycleModes']];
  if (context.group === 'scheduling.k8s.io' && context.kind === 'PriorityClass') return [['value'], ['preemptionPolicy']];
  if (context.group === 'scheduling.k8s.io' && context.kind === 'Workload') return [['spec', 'podGroups']];
  if (context.group === 'networking.k8s.io' && context.kind === 'IngressClass') return [['spec', 'controller']];
  if (context.group === 'networking.k8s.io' && context.kind === 'IPAddress') return [['spec', 'parentRef']];
  if (context.group === 'networking.k8s.io' && context.kind === 'ServiceCIDR' && context.discovery.features['networking.k8s.io/ServiceCIDR/append-dual-stack'] !== 'available') return [['spec', 'cidrs']];
  if (context.group === 'discovery.k8s.io' && context.kind === 'EndpointSlice') return [['addressType']];
  if (context.group === '' && context.kind === 'PersistentVolume') return ['gcePersistentDisk', 'awsElasticBlockStore', 'hostPath', 'glusterfs', 'nfs', 'rbd', 'iscsi', 'cinder', 'cephfs', 'fc', 'flocker', 'flexVolume', 'azureFile', 'vsphereVolume', 'quobyte', 'azureDisk', 'photonPersistentDisk', 'portworxVolume', 'scaleIO', 'local', 'storageos', 'csi', 'volumeMode'].map((field) => ['spec', field]);
  if (context.group === 'projectcalico.org' && context.kind === 'IPPool') return [['spec', 'cidr'], ['spec', 'blockSize']];
  return [];
}

export function validateImmutableEditorFields(source: string, baseline: string, context: ResourceEditorContext): string | null {
  const current = inspectManifest(source);
  const original = inspectManifest(baseline);
  for (const path of immutableEditorPaths(context)) {
    if (!equal(readManifestValue(current, path), readManifestValue(original, path))) return 'An immutable resource field changed. Restore the original field before saving.';
  }
  if (context.group === 'scheduling.k8s.io' && context.kind === 'Workload' && context.intent === 'edit' && readManifestValue(original, ['spec', 'controllerRef']) != null && !equal(readManifestValue(current, ['spec', 'controllerRef']), readManifestValue(original, ['spec', 'controllerRef']))) return 'An existing controller reference cannot change.';
  if (context.group === 'networking.k8s.io' && context.kind === 'ServiceCIDR' && context.intent === 'edit') {
    const before = readManifestValue(original, ['spec', 'cidrs']);
    const after = readManifestValue(current, ['spec', 'cidrs']);
    if (!equal(before, after) && (!Array.isArray(before) || !Array.isArray(after) || before.length !== 1 || after.length !== 2 || before[0] !== after[0] || typeof after[0] !== 'string' || typeof after[1] !== 'string' || after[0].includes(':') === after[1].includes(':') || context.discovery.features['networking.k8s.io/ServiceCIDR/append-dual-stack'] !== 'available')) return 'Existing service CIDRs cannot be removed or replaced.';
  }
  if (context.group === '' && context.kind === 'PersistentVolume' && context.intent === 'edit') {
    const before = quantity(readManifestValue(original, ['spec', 'capacity', 'storage']));
    const after = quantity(readManifestValue(current, ['spec', 'capacity', 'storage']));
    if (before && (!after || compareQuantity(after, before) < 0)) return 'PersistentVolume capacity cannot decrease.';
  }
  if (context.group === 'batch' && context.kind === 'Job' && context.intent === 'edit' && !equal(readManifestValue(current, ['spec', 'completions']), readManifestValue(original, ['spec', 'completions']))) {
    if (readManifestValue(original, ['spec', 'completionMode']) !== 'Indexed' || readManifestValue(current, ['spec', 'completionMode']) !== 'Indexed' || readManifestValue(current, ['spec', 'completions']) !== readManifestValue(current, ['spec', 'parallelism'])) return 'Existing Job completions require an atomic Indexed parallelism resize.';
  }
  return null;
}
function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equal(Reflect.get(left, key), Reflect.get(right, key)));
}

/** Descriptor policy classifies authoring, but never grants server permissions. */
export function editorOwnership(source: string, context: ResourceEditorContext, contribution?: ResourceEditorContribution): NonNullable<ResourceEditorContext['ownership']> {
  const draft = inspectManifest(source);
  if (!draft.document || draft.error) return { status: 'unknown' };
  const owners = readManifestValue(draft, ['metadata', 'ownerReferences']);
  const ownerReferences: readonly unknown[] | undefined = Array.isArray(owners) ? owners : undefined;
  if (owners !== undefined && !ownerReferences) return { status: 'unknown' };
  let controlled = false;
  for (const owner of ownerReferences ?? []) {
    if (!owner || typeof owner !== 'object' || Array.isArray(owner)) return { status: 'unknown' };
    const reference = owner as Record<string, unknown>;
    if (typeof reference.kind !== 'string' || typeof reference.name !== 'string' || reference.controller !== undefined && typeof reference.controller !== 'boolean') return { status: 'unknown' };
    controlled ||= reference.controller === true;
  }
  if (controlled) return { status: 'controller' };
  const namespace = readManifestValue(draft, ['metadata', 'namespace']) ?? context.namespace;
  const installer = readManifestValue(draft, ['metadata', 'labels', 'app.kubernetes.io/managed-by']);
  if (namespace === 'kube-system' || namespace === 'kube-node-lease' || typeof installer === 'string' && /^(helm|argocd|flux|fluxcd)$/i.test(installer)) return { status: 'system' };
  if (context.ownership?.status === 'controller' || context.ownership?.status === 'system') return context.ownership;
  if (contribution?.ownershipPolicy === 'controller' || contribution?.ownershipPolicy === 'system') return { status: contribution.ownershipPolicy };
  if (context.ownership?.status === 'application') return context.ownership;
  if ((context.intent === 'create' || context.intent === 'edit') && contribution?.ownershipPolicy === 'declarative') return { status: 'application' };
  if (context.intent === 'create' && contribution?.ownershipPolicy === 'conditional') return { status: 'application' };
  return { status: 'unknown' };
}
