import type { ResourceEditorContribution, ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPath, ResourceEditorReferenceResult } from '@omniviewdev/runtime';
import { compareQuantity, isKubernetesQuantity, quantity } from '../../manifestDraft';

export const scopes = ['Terminating', 'NotTerminating', 'BestEffort', 'NotBestEffort', 'PriorityClass', 'CrossNamespacePodAffinity'];
export const limitTypes = ['Container', 'Pod', 'PersistentVolumeClaim'];
export const accessModes = ['ReadWriteOnce', 'ReadOnlyMany', 'ReadWriteMany', 'ReadWriteOncePod'];
export function rows(draft: ResourceEditorDraft, path: ResourceEditorPath): readonly unknown[] {
  const value = draft.get(path);
  return Array.isArray(value) ? value : [];
}
export function text(draft: ResourceEditorDraft, path: ResourceEditorPath): string {
  const value = draft.get(path);
  return typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint' || typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}
export function controlled(draft: ResourceEditorDraft): boolean {
  return rows(draft, ['metadata', 'ownerReferences']).length > 0;
}
export function ownershipReason(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (controlled(draft)) return 'Controller-owned resource: inspect only.';
  if (context.ownership?.status === 'controller' || context.ownership?.status === 'system') return 'System or controller ownership: inspect only.';
  if (['PersistentVolume','ReplicationController','Endpoints'].includes(context.kind) && context.intent !== 'create' && context.ownership?.status !== 'application') return 'Ownership is unknown: inspect only.';
  if (context.kind === 'PersistentVolume') {
    if (draft.has(['metadata', 'annotations', 'pv.kubernetes.io/provisioned-by']) || draft.has(['metadata', 'annotations', 'volume.kubernetes.io/storage-provisioner']) || draft.has(['spec', 'claimRef'])) return 'Provisioned or bound volume: inspect only.';
  }
  if (context.kind === 'Endpoints' && (draft.has(['metadata', 'labels', 'endpoints.kubernetes.io/managed-by']) || draft.has(['metadata', 'annotations', 'endpoints.kubernetes.io/last-change-trigger-time']))) return 'Managed Endpoints: inspect only.';
  return null;
}
export function integerError(value: string, min = 0, max = 2147483647): string | null {
  if (!/^\d+$/.test(value) || BigInt(value) < BigInt(min) || BigInt(value) > BigInt(max)) return `Enter a whole number from ${min} to ${max}.`;
  return null;
}
export function quantityError(value: string): string | null {
  return isKubernetesQuantity(value) ? null : 'Enter a non-negative Kubernetes quantity.';
}
export function endpointError(value: string): string | null {
  // IPv6 is validated by the URL parser, not a permissive colon heuristic.
  if (value.includes(':')) {
    try {
      const ip = new URL(`http://[${value}]/`).hostname.toLowerCase();
      if (ip === '[::]' || ip === '[::1]' || ip.startsWith('[fe8') || ip.startsWith('[fe9') || ip.startsWith('[fea') || ip.startsWith('[feb') || ip.startsWith('[ff') || ip.startsWith('[::ffff:')) return 'Use a unicast address, not loopback, unspecified or link-local.';
      return null;
    } catch { return 'Enter an IPv4 or IPv6 address.'; }
  }
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return 'Enter an IPv4 or IPv6 address.';
  const [a, b] = parts.map(Number);
  return a === 0 || a === 127 || a >= 224 || a === 169 && b === 254 ? 'Use a unicast address, not loopback, unspecified or link-local.' : null;
}
export function validateCore(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const check = (path: ResourceEditorPath, error: string | null) => { if (error) issues.push({ path, message: error }); };
  if (context.kind === 'ServiceAccount') rows(draft, ['imagePullSecrets']).forEach((_, index) => {
    if (!text(draft, ['imagePullSecrets',index,'name'])) check(['imagePullSecrets',index,'name'], 'Enter a pull Secret reference name.');
  });
  if (context.kind === 'ResourceQuota') {
    const hard = draft.get(['spec', 'hard']);
    if (!hard || typeof hard !== 'object' || !Object.keys(hard).length) check(['spec', 'hard'], 'Add at least one quota limit.');
    else for (const key of Object.keys(hard)) check(['spec', 'hard', key], quantityError(text(draft, ['spec', 'hard', key])));
    const current = rows(draft, ['spec', 'scopes']);
    if (current.includes('BestEffort') && current.includes('NotBestEffort') || current.includes('Terminating') && current.includes('NotTerminating')) check(['spec', 'scopes'], 'Quota scopes conflict.');
    rows(draft, ['spec','scopeSelector','matchExpressions']).forEach((_, index) => {
      const root = ['spec','scopeSelector','matchExpressions',index];
      const name = text(draft, [...root,'scopeName']);
      const operator = text(draft, [...root,'operator']);
      const values = rows(draft, [...root,'values']);
      if (!scopes.includes(name)) check([...root,'scopeName'], 'Choose a quota scope.');
      if (!['In','NotIn','Exists','DoesNotExist'].includes(operator)) check([...root,'operator'], 'Choose a scope operator.');
      if (['In','NotIn'].includes(operator) && !values.length) check([...root,'values'], 'Add a scope value.');
      if (['Exists','DoesNotExist'].includes(operator) && values.length) check([...root,'values'], 'Remove scope values for this operator.');
      if (name !== 'PriorityClass' && !['Exists','DoesNotExist'].includes(operator)) check([...root,'operator'], 'This scope supports Exists or DoesNotExist.');
    });
  }
  if (context.kind === 'LimitRange') {
    if (!rows(draft, ['spec', 'limits']).length) check(['spec', 'limits'], 'Add at least one limit policy.');
    rows(draft, ['spec', 'limits']).forEach((_, index) => {
      const root = ['spec', 'limits', index] as const;
      const type = text(draft, [...root, 'type']);
      if (!limitTypes.includes(type)) check([...root, 'type'], 'Choose a supported limit type.');
      for (const category of ['min', 'max', 'default', 'defaultRequest', 'maxLimitRequestRatio']) {
        const map = draft.get([...root, category]);
        if (map && typeof map === 'object') for (const resource of Object.keys(map)) check([...root, category, resource], quantityError(text(draft, [...root, category, resource])));
      }
      if (type !== 'Container' && ['default','defaultRequest'].some(key => Object.keys(draft.get([...root,key]) ?? {}).length > 0)) check(root, 'Default limits and requests apply only to Containers.');
      for (const resource of ['cpu', 'memory', 'storage', 'ephemeral-storage']) {
        const ordered = ['min', 'defaultRequest', 'default', 'max'].map(key => quantity(draft.get([...root, key, resource]))).filter(item => item !== null);
        for (let n = 1; n < ordered.length; n++) if (compareQuantity(ordered[n - 1], ordered[n]) > 0) check(root, `${resource}: minimum ≤ default request ≤ default limit ≤ maximum.`);
        const ratio = quantity(draft.get([...root,'maxLimitRequestRatio',resource]));
        if (ratio && compareQuantity(ratio, {coefficient:1n,exponent:0n}) < 0) check([...root,'maxLimitRequestRatio',resource], 'Limit/request ratio must be at least 1.');
      }
    });
  }
  if (context.kind === 'PodTemplate' || context.kind === 'ReplicationController') {
    const root = context.kind === 'PodTemplate' ? ['template'] : ['spec', 'template'];
    const path = [...root, 'spec', 'containers'];
    if (!rows(draft, path).length) check(path, 'Add at least one container.');
    const names = new Set<string>();
    rows(draft, path).forEach((_, index) => {
      const name = text(draft, [...path, index, 'name']);
      if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name) || name.length > 63 || names.has(name)) check([...path, index, 'name'], 'Use a unique DNS label for the container.');
      names.add(name);
      if (!text(draft, [...path, index, 'image'])) check([...path, index, 'image'], 'Enter a container image.');
      for (const category of ['requests','limits']) {
        const resources = draft.get([...path,index,'resources',category]);
        if (resources && typeof resources === 'object') for (const resource of Object.keys(resources)) check([...path,index,'resources',category,resource], quantityError(text(draft,[...path,index,'resources',category,resource])));
      }
    });
    if (context.kind === 'ReplicationController') {
      if (draft.has(['spec', 'replicas'])) check(['spec', 'replicas'], integerError(text(draft, ['spec', 'replicas'])));
      const selector = draft.get(['spec', 'selector']);
      if (!selector || typeof selector !== 'object' || !Object.keys(selector).length) check(['spec', 'selector'], 'Add at least one selector.');
      else for (const key of Object.keys(selector)) if (text(draft, ['spec', 'selector', key]) !== text(draft, ['spec', 'template', 'metadata', 'labels', key])) check(['spec', 'selector', key], 'Selector must match the Pod template label.');
    }
  }
  if (context.kind === 'PersistentVolume' && context.intent !== 'inspect' && !ownershipReason(draft,context) && !alternativePVSources.some(key => draft.has(['spec',key]))) {
    const capacity = quantity(draft.get(['spec','capacity','storage']));
    check(['spec', 'capacity', 'storage'], capacity && capacity.coefficient > 0n ? null : 'Enter a positive storage quantity.');
    if (!text(draft, ['spec', 'nfs', 'server'])) check(['spec', 'nfs', 'server'], 'Enter an NFS server.');
    if (!text(draft, ['spec', 'nfs', 'path']).startsWith('/')) check(['spec', 'nfs', 'path'], 'Enter an absolute export path.');
    if (!rows(draft, ['spec', 'accessModes']).length) check(['spec', 'accessModes'], 'Choose an access mode.');
    if (text(draft, ['spec', 'volumeMode']) === 'Block') check(['spec', 'volumeMode'], 'NFS volumes require Filesystem mode.');
  }
  if (context.kind === 'Endpoints') rows(draft, ['subsets']).forEach((_, index) => {
    for (const branch of ['addresses', 'notReadyAddresses']) rows(draft, ['subsets', index, branch]).forEach((_, n) => check(['subsets', index, branch, n, 'ip'], endpointError(text(draft, ['subsets', index, branch, n, 'ip']))));
    rows(draft, ['subsets', index, 'ports']).forEach((_, n) => check(['subsets', index, 'ports', n, 'port'], integerError(text(draft, ['subsets', index, 'ports', n, 'port']), 1, 65535)));
  });
  return issues;
}

/** A malformed owned collection stays source-only; Add must never erase its original shape. */
export function coreUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.schema.status !== 'available') return 'Installed schema is not available. The source remains unchanged.';
  const arrays: Record<string, ResourceEditorPath[]> = {
    ServiceAccount: [['imagePullSecrets']],
    ResourceQuota: [['spec','scopes'],['spec','scopeSelector','matchExpressions']],
    LimitRange: [['spec','limits']],
    PodTemplate: [['template','spec','containers']],
    ReplicationController: [['spec','template','spec','containers']],
    PersistentVolume: [['spec','accessModes'],['spec','mountOptions']],
    Endpoints: [['subsets']],
  };
  for (const path of arrays[context.kind] ?? []) if (draft.has(path) && !Array.isArray(draft.get(path))) return 'An owned collection has an unsupported shape. Edit the preserved source instead.';
  const maps: Record<string, ResourceEditorPath[]> = {
    Namespace: [['metadata','labels']],
    ResourceQuota: [['spec','hard']],
    PodTemplate: [['template','metadata','labels'],['template','spec','nodeSelector']],
    ReplicationController: [['spec','selector'],['spec','template','metadata','labels'],['spec','template','spec','nodeSelector']],
    PersistentVolume: [['spec','nfs'],['spec','capacity']],
  };
  for (const path of maps[context.kind] ?? []) {
    const value = draft.get(path);
    if (draft.has(path) && (!value || typeof value !== 'object' || Array.isArray(value))) return 'An owned map has an unsupported shape. Edit the preserved source instead.';
  }
  for (const path of [...(arrays[context.kind] ?? []),...(maps[context.kind] ?? [])]) {
    for (let length = 1; length < path.length; length++) {
      const ancestor = path.slice(0,length);
      const value = draft.get(ancestor);
      if (draft.has(ancestor) && (!value || typeof value !== 'object' || Array.isArray(value))) return 'An owned parent has an unsupported shape. The source remains unchanged.';
    }
    if (!['scopes','accessModes','mountOptions'].includes(String(path[path.length-1])) && (arrays[context.kind] ?? []).includes(path)) {
      if (rows(draft,path).some(value => !value || typeof value !== 'object' || Array.isArray(value))) return 'An owned row has an unsupported shape. The source remains unchanged.';
    }
  }
  return null;
}

export function coreReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  if (context.intent === 'create' && context.capabilities.create !== 'available' || context.intent === 'edit' && context.capabilities.update !== 'available') return true;
  if (context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system' || controlled(draft)) return true;
  if (['PersistentVolume', 'ReplicationController', 'Endpoints'].includes(context.kind)) return !!ownershipReason(draft, context) || context.intent !== 'create' && context.ownership?.status !== 'application';
  return false;
}

export const alternativePVSources = ['csi','local','hostPath','gcePersistentDisk','awsElasticBlockStore','azureDisk','azureFile','cephfs','cinder','fc','flexVolume','flocker','glusterfs','iscsi','photonPersistentDisk','portworxVolume','quobyte','rbd','scaleIO','storageos','vsphereVolume'] as const;

/** The same prerequisite applies to guided controls and submission from untouched YAML. */
export function endpointServiceError(result: ResourceEditorReferenceResult | { status: 'loading' }, name: string, namespace: string): string | null {
  if (result.status === 'loading') return 'Checking Service ownership…';
  if (result.status !== 'ready') return `Service lookup ${result.status}. Manual editing is locked.`;
  const service = result.items.find(item => item.name === name && item.namespace === namespace);
  if (!service) return result.items.some(item => item.name === name && item.namespace === undefined) ? 'Service namespace is unknown; editing is locked.' : 'Same-name Service not found. No companion Service is created.';
  if (service.serviceSelector === 'present') return 'Service has a selector; endpoints belong to its controller.';
  return service.serviceSelector === 'none' ? null : 'Service selector is unknown; editing is locked.';
}

export const validateEndpointsSubmission: NonNullable<ResourceEditorContribution['validateSubmission']> = async (draft, context, services, signal) => {
  const issue = (message: string): readonly ResourceEditorFieldIssue[] => [{ path: ['subsets'], message }];
  if (signal.aborted) return issue('Service ownership validation was cancelled.');
  if (context.group !== '' || context.version !== 'v1' || context.kind !== 'Endpoints' || context.resource !== 'endpoints' || context.scope !== 'Namespaced') return issue('This admission check supports core v1 Endpoints only.');
  if (context.intent !== 'create' && context.intent !== 'edit' || coreReadOnly(draft,context)) return issue(ownershipReason(draft,context) ?? 'This resource is not writable.');
  const nameValue = draft.get(['metadata','name']);
  const namespaceValue = draft.get(['metadata','namespace']);
  const name = draft.has(['metadata','name']) ? typeof nameValue === 'string' ? nameValue : '' : context.name ?? '';
  const namespace = draft.has(['metadata','namespace']) ? typeof namespaceValue === 'string' ? namespaceValue : '' : context.namespace ?? '';
  if (!name || !namespace) return issue('Choose a name and namespace to verify Service ownership.');
  if (context.name && context.name !== name || context.namespace && context.namespace !== namespace) return issue('Resource identity changed. Retry from the current editor.');
  try {
    const result = await services.references.list({
      group: '', version: 'v1', resource: 'services', namespace, projection: 'servicePorts',
      sessionID: draft.sessionID, generation: draft.revision, signal,
    });
    if (signal.aborted) return issue('Service ownership validation was cancelled.');
    const error = endpointServiceError(result,name,namespace);
    return error ? issue(error) : [];
  } catch {
    return issue(signal.aborted ? 'Service ownership validation was cancelled.' : 'Service ownership lookup unavailable. Submission is blocked.');
  }
};
