import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';

export const autoUpdate = 'apf.kubernetes.io/autoupdate-spec';
export const annotationPath = ['metadata', 'annotations', autoUpdate] as const;
const suggestedFlow: Record<string, true> = { 'system-nodes': true, 'system-node-high': true, probes: true, 'system-leader-election': true, 'kube-controller-manager': true, 'kube-scheduler': true, 'kube-system-service-accounts': true, 'service-accounts': true, 'global-default': true };
const suggestedPriority: Record<string, true> = { system: true, 'node-high': true, 'leader-election': true, 'workload-high': true, 'workload-low': true, 'global-default': true };
export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const rows = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export const text = (v: unknown): string => typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint' ? String(v) : '';
export function ownership(draft: ResourceEditorDraft, context: ResourceEditorContext) {
  const name = context.name || text(draft.get(['metadata', 'name']));
  if (name === 'exempt' || name === 'catch-all') return context.kind === 'PriorityLevelConfiguration' && name === 'exempt' ? 'exempt' : 'mandatory';
  if (Object.prototype.hasOwnProperty.call(context.kind === 'FlowSchema' ? suggestedFlow : suggestedPriority, name)) return 'suggested';
  return 'administrator';
}
export function protectedPolicy(draft: ResourceEditorDraft, context: ResourceEditorContext) {
  const own = ownership(draft, context);
  return own === 'mandatory' || (own === 'administrator' && (context.ownership?.status === 'controller' || context.ownership?.status === 'system' || rows(draft.get(['metadata', 'ownerReferences'])).some(value => object(value).controller === true)));
}
export function parseInt32(value: string, min = 0, max = 2147483647): number | null | string {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value)) return 'Enter a whole number.';
  const exact = BigInt(value);
  return exact < BigInt(min) || exact > BigInt(max) ? `Use ${min}–${max}.` : Number(exact);
}
export function parseTokens(value: string, core = false): string[] | string {
  if (!value.trim()) return [];
  const result = value.split(',').map(v => v.trim()).map(v => core && v === '""' ? '' : v);
  if (value.split(',').some(v => !v.trim())) return 'Remove empty entries. Use "" for the core API group.';
  if (new Set(result).size !== result.length) return 'Remove duplicate entries.';
  if (result.includes('*') && result.length > 1) return 'Use * alone.';
  return result;
}
export function fieldError(draft: ResourceEditorDraft, path: ResourceEditorPath, value: unknown): string | null {
  const key = path.at(-1);
  const values = rows(value);
  if (key === 'verbs' && values.some(v => !['*', 'get', 'list', 'create', 'update', 'delete', 'deletecollection', 'patch', 'watch', 'proxy'].includes(text(v)))) return 'Use Kubernetes request verbs.';
  if (key === 'nonResourceURLs' && values.some(v => typeof v !== 'string' || (v !== '*' && (!v.startsWith('/') || /\s|\/\//.test(v) || (v.includes('*') && (!v.endsWith('/*') || v.indexOf('*') !== v.length - 1)))))) return 'Use slash paths; wildcard only as trailing /*.';
  const namespaceValues = key === 'namespaces' ? values : key === 'namespace' ? [value] : [];
  if (namespaceValues.some(v => typeof v !== 'string' || (!(key === 'namespaces' && v === '*') && (v.length > 63 || !/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(v))))) return 'Use a namespace DNS label.';
  if (key === 'name' && path.includes('priorityLevelConfiguration') && (typeof value !== 'string' || value.length > 253 || value.split('.').some(v => !v || v.length > 63 || !/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(v)))) return 'Use a priority level DNS subdomain name.';
  if (key === 'name' && path.includes('serviceAccount') && value !== '*' && (typeof value !== 'string' || value.length > 253 || value.split('.').some(v => !v || v.length > 63 || !/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(v)))) return 'Use a service account DNS subdomain name, or *.';
  if ((key === 'queues' || key === 'handSize') && path.includes('queuing')) {
    const queues = key === 'queues' ? value ?? 64 : draft.get([...path.slice(0, -1), 'queues']) ?? 64;
    const hand = key === 'handSize' ? value ?? 8 : draft.get([...path.slice(0, -1), 'handSize']) ?? 8;
    if ((typeof queues === 'number' || typeof queues === 'bigint') && (typeof hand === 'number' || typeof hand === 'bigint') && hand > queues) return 'Hand size must not exceed queues.';
  }
  return null;
}
export function responseChanges(draft: ResourceEditorDraft, type: string, cached?: Record<string, number | bigint>): ResourceEditorPatch[] | string {
  const base = ['spec', 'limited', 'limitResponse'];
  const queue = object(draft.get([...base, 'queuing']));
  if (type === 'Reject' && Object.keys(queue).some(k => !['queues', 'handSize', 'queueLengthLimit'].includes(k))) return 'Queuing contains unsupported fields. Change this branch in source.';
  const result: ResourceEditorPatch[] = [{ op: 'set', path: ['spec', 'type'], value: 'Limited' }, { op: 'set', path: [...base, 'type'], value: type }];
  if (type === 'Reject' && draft.has([...base, 'queuing'])) result.push({ op: 'remove', path: [...base, 'queuing'] });
  if (type === 'Queue' && !draft.has([...base, 'queuing'])) {
    result.push({ op: 'set', path: [...base, 'queuing'], value: {} });
    for (const [key, value] of Object.entries(cached || {})) result.push({ op: 'set', path: [...base, 'queuing', key], value });
  }
  return result;
}
export function subjectChanges(draft: ResourceEditorDraft, path: ResourceEditorPath, kind: string): ResourceEditorPatch[] | string {
  const source = object(draft.get(path));
  for (const key of ['user', 'group', 'serviceAccount']) {
    if (Object.keys(object(source[key])).some(k => !['name', ...(key === 'serviceAccount' ? ['namespace'] : [])].includes(k))) return 'Subject contains unsupported fields. Change this branch in source.';
  }
  const result: ResourceEditorPatch[] = [{ op: 'set', path: [...path, 'kind'], value: kind }];
  for (const key of ['user', 'group', 'serviceAccount']) if (source[key] !== undefined && key !== (kind === 'ServiceAccount' ? 'serviceAccount' : kind.toLowerCase())) result.push({ op: 'remove', path: [...path, key] });
  return result;
}
export function formUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') return 'APF API availability is not confirmed.';
  if (context.schema.status !== 'available') return 'Installed APF schema is not available. Use source.';
  if (context.intent === 'create' && ['mandatory', 'exempt'].includes(ownership(draft, context))) return 'Mandatory bootstrap objects are server-managed. Inspect the existing object.';
  const mapping = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);
  for (const path of [['spec'], ['spec', 'priorityLevelConfiguration'], ['spec', 'distinguisherMethod'], ['spec', 'limited'], ['spec', 'exempt'], ['spec', 'limited', 'limitResponse'], ['spec', 'limited', 'limitResponse', 'queuing']]) {
    if (draft.has(path) && !mapping(draft.get(path))) return 'Unsupported policy structure. Source remains unchanged.';
  }
  for (const path of [['spec', 'rules'], ['status', 'conditions']]) {
    if (draft.has(path) && !Array.isArray(draft.get(path))) return 'Unsupported collection shape. Source remains unchanged.';
  }
  if (context.kind === 'PriorityLevelConfiguration') {
    const type = draft.get(['spec', 'type']);
    if (type !== undefined && type !== 'Limited' && type !== 'Exempt') return 'Unsupported priority type. Use source.';
  }
  for (const group of rows(draft.get(['spec', 'rules']))) {
    if (!mapping(group)) return 'Unsupported matching group. Use source.';
    for (const key of ['subjects', 'resourceRules', 'nonResourceRules']) if (object(group)[key] !== undefined && !Array.isArray(object(group)[key])) return 'Unsupported matching rules. Use source.';
    for (const subject of rows(object(group).subjects)) {
      if (!mapping(subject) || !['User', 'Group', 'ServiceAccount'].includes(text(object(subject).kind))) return 'Unsupported subject kind. Use source.';
      for (const key of ['user', 'group', 'serviceAccount']) if (object(subject)[key] !== undefined && !mapping(object(subject)[key])) return 'Unsupported subject branch. Use source.';
    }
    for (const family of ['resourceRules', 'nonResourceRules']) for (const request of rows(object(group)[family])) {
      if (!mapping(request)) return 'Unsupported request match. Use source.';
      for (const key of ['verbs', 'apiGroups', 'resources', 'namespaces', 'nonResourceURLs']) if (object(request)[key] !== undefined && (!Array.isArray(object(request)[key]) || rows(object(request)[key]).some(v => typeof v !== 'string'))) return 'Unsupported match list. Use source.';
    }
  }
  return null;
}
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const issue = (path: ResourceEditorPath, message: string) => issues.push({ path, message });
  const name = context.name || text(draft.get(['metadata', 'name']));
  const own = ownership(draft, context);
  if (own === 'mandatory') return issues;
  if (own === 'administrator' && ['true', 'True', 'TRUE', '1', 't', 'T'].includes(text(draft.get(annotationPath)))) issue(annotationPath, 'Custom policy must not opt into bootstrap reconciliation.');
  if (own === 'suggested' && context.intent === 'edit' && draft.get(annotationPath) !== 'false') issue(annotationPath, 'Opt out of bootstrap spec reconciliation before editing.');
  const integer = (path: ResourceEditorPath, min = 0, max = 2147483647) => {
    if (!draft.has(path)) return;
    const value = draft.get(path);
    const exact = typeof value === 'bigint' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : null;
    if (exact === null || exact < BigInt(min) || exact > BigInt(max)) issue(path, `Use a whole number from ${min} to ${max}.`);
  };
  if (context.kind === 'PriorityLevelConfiguration') {
    const exempt = name === 'exempt';
    const type = draft.get(['spec', 'type']);
    if (type !== (exempt ? 'Exempt' : 'Limited')) issue(['spec', 'type'], exempt ? 'Exempt singleton requires Exempt type.' : 'Choose Limited overload behavior.');
    if (draft.has(['spec', exempt ? 'limited' : 'exempt'])) issue(['spec'], 'Priority type has an incompatible branch. Use source.');
    const base = ['spec', exempt ? 'exempt' : 'limited'];
    integer([...base, 'nominalConcurrencyShares']); integer([...base, 'lendablePercent'], 0, 100);
    if (!exempt) {
      integer([...base, 'borrowingLimitPercent']);
      const response = draft.get([...base, 'limitResponse', 'type']);
      if (!['Queue', 'Reject'].includes(text(response))) issue([...base, 'limitResponse', 'type'], 'Choose Queue or Reject.');
      const q = [...base, 'limitResponse', 'queuing'];
      if (response === 'Reject' && draft.has(q)) issue(q, 'Reject must omit queuing.');
      if (response === 'Queue') {
        if (!draft.has(q)) issue(q, 'Queue requires queuing configuration.');
        integer([...q, 'queues'], 1, 10000000); integer([...q, 'handSize'], 1); integer([...q, 'queueLengthLimit'], 1);
        const queues = draft.get([...q, 'queues']) ?? 64;
        const hand = draft.get([...q, 'handSize']) ?? 8;
        if ((typeof queues === 'number' || typeof queues === 'bigint') && (typeof hand === 'number' || typeof hand === 'bigint') && hand > queues) issue([...q, 'handSize'], 'Hand size must not exceed queues.');
      }
    }
    return issues;
  }
  if (!text(draft.get(['spec', 'priorityLevelConfiguration', 'name']))) issue(['spec', 'priorityLevelConfiguration', 'name'], 'Choose an existing priority level or enter its exact name.');
  integer(['spec', 'matchingPrecedence'], name === 'exempt' ? 1 : 2, 10000);
  const distinguisher = draft.get(['spec', 'distinguisherMethod', 'type']);
  if (distinguisher !== undefined && !['ByUser', 'ByNamespace'].includes(text(distinguisher))) issue(['spec', 'distinguisherMethod', 'type'], 'Choose User, Namespace, or no distinguisher.');
  const tokenSet = (path: ResourceEditorPath, required: boolean) => {
    const value = draft.get(path);
    if (value === undefined && !required) return;
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string') || (required && value.length === 0)) { issue(path, 'Enter at least one valid value.'); return; }
    if (value.includes('*') && value.length > 1) issue(path, 'Use * alone.');
    const error = fieldError(draft, path, value);
    if (error) issue(path, error);
  };
  rows(draft.get(['spec', 'rules'])).forEach((rule, i) => {
    const base = ['spec', 'rules', i];
    const group = object(rule);
    if (!rows(group.subjects).length) issue([...base, 'subjects'], 'Add at least one subject.');
    rows(group.subjects).forEach((s, j) => {
      const subject = object(s), path = [...base, 'subjects', j];
      const branch = text(subject.kind) === 'ServiceAccount' ? 'serviceAccount' : text(subject.kind).toLowerCase();
      if (!text(object(subject[branch]).name)) issue([...path, branch, 'name'], 'Enter a subject name.');
      if (branch === 'serviceAccount' && !text(object(subject[branch]).namespace)) issue([...path, branch, 'namespace'], 'Enter the service account namespace.');
      for (const key of ['name', ...(branch === 'serviceAccount' ? ['namespace'] : [])]) {
        const error = fieldError(draft, [...path, branch, key], object(subject[branch])[key]);
        if (error) issue([...path, branch, key], error);
      }
      for (const key of ['user', 'group', 'serviceAccount']) if (key !== branch && subject[key] !== undefined) issue([...path, key], 'Remove incompatible subject branch in source.');
    });
    if (!rows(group.resourceRules).length && !rows(group.nonResourceRules).length) issue(base, 'Add a resource or URL match.');
    for (const family of ['resourceRules', 'nonResourceRules']) rows(group[family]).forEach((r, j) => {
      const path = [...base, family, j], request = object(r);
      tokenSet([...path, 'verbs'], true);
      if (family === 'resourceRules') {
        tokenSet([...path, 'apiGroups'], true); tokenSet([...path, 'resources'], true);
        tokenSet([...path, 'namespaces'], request.clusterScope !== true);
      } else {
        tokenSet([...path, 'nonResourceURLs'], true);
      }
    });
  });
  return issues;
}
