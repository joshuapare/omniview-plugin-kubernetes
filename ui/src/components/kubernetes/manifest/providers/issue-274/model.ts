import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch } from '@omniviewdev/runtime';

export const podGroupsPath = ['spec', 'podGroups'] as const;
export const controllerPath = ['spec', 'controllerRef'] as const;
export const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const dnsLabel = (value: string) => value.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(value);
export const dnsSubdomain = (value: string) => value.length <= 253 && value.split('.').every(dnsLabel);
export const pathSegment = (value: string) => !!value && value !== '.' && value !== '..' && !/[/%]/.test(value);

export function integer(text: string, minimum: number, maximum: number): number | null {
  if (!/^-?\d+$/.test(text)) return null;
  const value = BigInt(text);
  return value >= BigInt(minimum) && value <= BigInt(maximum) ? Number(value) : null;
}
function nativeInteger(value: unknown, minimum: number, maximum: number) {
  return (typeof value === 'number' && Number.isSafeInteger(value) || typeof value === 'bigint') && integer(String(value), minimum, maximum) !== null;
}
export function controllerOwned(draft: ResourceEditorDraft) {
  const owners = draft.get(['metadata', 'ownerReferences']);
  return Array.isArray(owners) && owners.some(owner => record(owner) && owner.controller === true);
}
export function schedulingReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext) {
  if (context.intent === 'inspect' || controllerOwned(draft) || context.ownership?.status === 'controller' || context.ownership?.status === 'system') return true;
  const name = draft.get(['metadata', 'name']);
  if (context.kind === 'PriorityClass' && (typeof name === 'string' && name.startsWith('system-') || context.name?.startsWith('system-') || draft.has(['metadata', 'name']) && typeof name !== 'string')) return true;
  return context.intent !== 'create' && context.ownership?.status !== 'application';
}
export function priorityUnavailable(draft: ResourceEditorDraft): string | null {
  for (const key of ['description', 'preemptionPolicy']) {
    if (draft.has([key]) && typeof draft.get([key]) !== 'string') return 'A scheduling field has an unsupported scalar type. Use source without converting it.';
  }
  if (draft.has(['globalDefault']) && typeof draft.get(['globalDefault']) !== 'boolean') return 'Global default must be a boolean. Source is preserved.';
  if (draft.has(['value']) && !nativeInteger(draft.get(['value']), -2147483648, 2147483647)) return 'Priority has an unsupported integer representation. Source is preserved.';
  const preemption = draft.get(['preemptionPolicy']);
  return preemption !== undefined && preemption !== 'Never' && preemption !== 'PreemptLowerPriority' ? 'Unsupported preemption policy. Source is preserved.' : null;
}
export function workloadUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  // At the pinned release, this exact API is registered only with GenericWorkload enabled.
  if (context.discovery.status !== 'available') return 'The Workload API is not confirmed available. Inspection/source only.';
  const ref = draft.get(controllerPath);
  if (ref !== undefined && (!record(ref) || Object.entries(ref).some(([key, value]) => !['apiGroup', 'kind', 'name'].includes(key) || typeof value !== 'string'))) return 'Controller reference has unsupported fields or scalar types. Source is preserved.';
  const groups = draft.get(podGroupsPath);
  if (groups === undefined) return null;
  if (!Array.isArray(groups) || groups.some(group => {
    if (!record(group) || typeof group.name !== 'string' || !record(group.policy)) return true;
    const policy = group.policy;
    if (Object.keys(policy).some(key => key !== 'basic' && key !== 'gang')) return true;
    if ((policy.basic !== undefined ? 1 : 0) + (policy.gang !== undefined ? 1 : 0) !== 1) return true;
    if (policy.basic !== undefined && (!record(policy.basic) || Object.keys(policy.basic).length)) return true;
    return policy.gang !== undefined && (!record(policy.gang) || Object.keys(policy.gang).some(key => key !== 'minCount') || !nativeInteger(policy.gang.minCount, 1, 2147483647));
  })) return 'Pod-group policy has an unsupported shape. Source is preserved; no policy branch will be replaced.';
  return null;
}
export function validatePriority(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const name = draft.get(['metadata', 'name']);
  const system = typeof name === 'string' && name.startsWith('system-') || context.name?.startsWith('system-') === true;
  if (!nativeInteger(draft.get(['value']), -2147483648, system ? 2147483647 : 1000000000)) issues.push({ path: ['value'], message: 'Enter an integer from −2147483648 to 1000000000.' });
  if (system && context.intent === 'create') issues.push({ path: ['metadata', 'name'], message: 'The system- prefix is reserved. Inspect bootstrap classes instead.' });
  return issues;
}
export function validateWorkload(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const groups = draft.get(podGroupsPath);
  if (!Array.isArray(groups) || groups.length < 1 || groups.length > 8) return [{ path: podGroupsPath, message: 'Add between one and eight pod groups.' }];
  const names = new Set<string>();
  groups.forEach((group, index) => {
    if (!record(group)) return;
    if (typeof group.name !== 'string' || !dnsLabel(group.name) || names.has(group.name)) issues.push({ path: [...podGroupsPath, index, 'name'], message: 'Use a unique DNS label for each pod group.' });
    if (typeof group.name === 'string') names.add(group.name);
    if (record(group.policy) && group.policy.gang !== undefined && context.discovery.features.GangScheduling === 'absent') issues.push({ path: [...podGroupsPath, index, 'policy', 'gang'], message: 'GangScheduling is confirmed disabled. Choose Basic or retain the source without submitting.' });
  });
  const ref = draft.get(controllerPath);
  if (record(ref) && (typeof ref.kind !== 'string' || !pathSegment(ref.kind) || typeof ref.name !== 'string' || !pathSegment(ref.name) || ref.apiGroup !== undefined && (typeof ref.apiGroup !== 'string' || ref.apiGroup !== '' && !dnsSubdomain(ref.apiGroup)))) issues.push({ path: controllerPath, message: 'Enter a valid API group, kind and same-namespace object name.' });
  return issues;
}
/** Change only the selected policy leaves; unknown shapes never reach this form. */
export function policyChanges(index: number, policy: 'basic' | 'gang', minimum: number, draft: ResourceEditorDraft): ResourceEditorPatch[] {
  const base = [...podGroupsPath, index, 'policy'];
  const inactive = policy === 'basic' ? 'gang' : 'basic';
  return [
    ...(draft.has([...base, inactive]) ? [{ op: 'remove' as const, path: [...base, inactive] }] : []),
    policy === 'basic' ? { op: 'set', path: [...base, 'basic'], value: {} } : { op: 'set', path: [...base, 'gang', 'minCount'], value: minimum },
  ];
}
/** Exact known mappings only; arbitrary kinds remain valid manual references. */
export function controllerLookup(group: string, kind: string): { group: string; version: string; resource: string } | null {
  if (group === 'apps' && ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'].includes(kind)) return { group, version: 'v1', resource: ({ Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets', ReplicaSet: 'replicasets' } as Record<string, string>)[kind] };
  if (group === 'batch' && (kind === 'Job' || kind === 'CronJob')) return { group, version: 'v1', resource: kind === 'Job' ? 'jobs' : 'cronjobs' };
  if (group === '' && kind === 'Pod') return { group, version: 'v1', resource: 'pods' };
  return null;
}
