import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch, ResourceEditorTarget } from '@omniviewdev/runtime';

export const REVIEW_PROTOCOL = 'kubernetes.review.v1';
export const targets = [
  { group: 'authorization.k8s.io', version: 'v1', kind: 'SubjectAccessReview', resource: 'subjectaccessreviews', scope: 'Cluster' },
  { group: 'authorization.k8s.io', version: 'v1', kind: 'LocalSubjectAccessReview', resource: 'localsubjectaccessreviews', scope: 'Namespaced' },
  { group: 'authorization.k8s.io', version: 'v1', kind: 'SelfSubjectAccessReview', resource: 'selfsubjectaccessreviews', scope: 'Cluster' },
  { group: 'authorization.k8s.io', version: 'v1', kind: 'SelfSubjectRulesReview', resource: 'selfsubjectrulesreviews', scope: 'Cluster' },
] as const satisfies readonly ResourceEditorTarget[];
export const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const suppliedIdentity = (kind: string) => kind === 'SubjectAccessReview' || kind === 'LocalSubjectAccessReview';
export const isRules = (kind: string) => kind === 'SelfSubjectRulesReview';
export const isLocal = (kind: string) => kind === 'LocalSubjectAccessReview';

export function unavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') return `Authorization API discovery is ${context.discovery.status}.`;
  if (context.schema.status !== 'available') return `Authorization schema is ${context.schema.status}.`;
  if (draft.has(['spec']) && !record(draft.get(['spec']))) return 'Request spec requires a mapping; source remains unchanged.';
  if (isRules(context.kind)) {
    if (draft.has(['spec', 'namespace']) && typeof draft.get(['spec', 'namespace']) !== 'string') return 'Evaluation namespace must be a string.';
    return null;
  }
  for (const branch of ['resourceAttributes', 'nonResourceAttributes']) {
    const value = draft.get(['spec', branch]);
    if (value !== undefined && !record(value)) return 'Unsupported action attributes; use source without normalization.';
    if (!record(value)) continue;
    const fields = branch === 'resourceAttributes' ? ['namespace', 'verb', 'group', 'version', 'resource', 'subresource', 'name'] : ['path', 'verb'];
    if (fields.some(key => value[key] !== undefined && typeof value[key] !== 'string')) return 'Action fields must retain string scalar types; use source.';
    for (const selector of ['fieldSelector', 'labelSelector']) {
      const selected = value[selector];
      if (selected !== undefined && (!record(selected) || selected.requirements !== undefined || (selected.rawSelector !== undefined && typeof selected.rawSelector !== 'string'))) return 'Structured selector requirements need source editing; no conversion was made.';
    }
  }
  if (draft.has(['spec', 'groups']) && !Array.isArray(draft.get(['spec', 'groups']))) return 'Unsupported identity groups shape; source remains unchanged.';
  if (draft.has(['spec', 'extra']) && !record(draft.get(['spec', 'extra']))) return 'Unsupported identity attributes shape; source remains unchanged.';
  const extra = draft.get(['spec', 'extra']);
  if (record(extra) && Object.values(extra).some(value => !Array.isArray(value))) return 'Identity attribute values must remain arrays; use source.';
  if (!suppliedIdentity(context.kind) && ['user', 'uid', 'groups', 'extra'].some(key => draft.has(['spec', key]))) return 'Self reviews cannot supply another identity.';
  if (isLocal(context.kind) && draft.has(['spec', 'nonResourceAttributes'])) return 'Local reviews support resource actions only.';
  return null;
}

export function validateReview(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const add = (path: readonly string[], message: string) => issues.push({ path, message });
  if (isRules(context.kind)) {
    if (!draft.get(['spec', 'namespace'])) add(['spec', 'namespace'], 'Choose an evaluation namespace.');
    return issues;
  }
  const resource = draft.has(['spec', 'resourceAttributes']);
  const url = draft.has(['spec', 'nonResourceAttributes']);
  if (resource === url) add(['spec'], 'Choose exactly one resource action or non-resource URL.');
  for (const selector of ['fieldSelector', 'labelSelector']) {
    const value = draft.get(['spec', 'resourceAttributes', selector]);
    if (record(value) && !value.rawSelector && !value.requirements) add(['spec', 'resourceAttributes', selector, 'rawSelector'], 'Enter a selector or remove the empty selector in source.');
  }
  if (isLocal(context.kind)) {
    if (!context.namespace) add(['spec', 'resourceAttributes', 'namespace'], 'Choose the local review endpoint namespace.');
    const namespace = draft.get(['spec', 'resourceAttributes', 'namespace']);
    if (namespace && namespace !== context.namespace) add(['spec', 'resourceAttributes', 'namespace'], 'Action namespace must match the local endpoint.');
    if (url) add(['spec', 'nonResourceAttributes'], 'Local reviews cannot check non-resource URLs.');
  }
  if (url) {
    const path = draft.get(['spec', 'nonResourceAttributes', 'path']);
    if (typeof path === 'string' && path && !path.startsWith('/')) add(['spec', 'nonResourceAttributes', 'path'], 'URL path must start with /.');
  }
  if (suppliedIdentity(context.kind) && !draft.has(['spec', 'user']) && !(Array.isArray(draft.get(['spec', 'groups'])) && (draft.get(['spec', 'groups']) as unknown[]).length)) add(['spec', 'user'], 'Supply a user or at least one group.');
  return issues;
}

export function branchOperations(next: 'resourceAttributes' | 'nonResourceAttributes', value: unknown): readonly ResourceEditorPatch[] {
  return [{ op: 'remove', path: ['spec', next === 'resourceAttributes' ? 'nonResourceAttributes' : 'resourceAttributes'] }, { op: 'set', path: ['spec', next], value }];
}

export function decision(status: unknown): 'Allowed' | 'Denied' | 'No opinion' | 'Invalid response' {
  if (!record(status) || typeof status.allowed !== 'boolean' || (status.denied !== undefined && typeof status.denied !== 'boolean') || (status.allowed && status.denied)) return 'Invalid response';
  return status.allowed ? 'Allowed' : status.denied ? 'Denied' : 'No opinion';
}
