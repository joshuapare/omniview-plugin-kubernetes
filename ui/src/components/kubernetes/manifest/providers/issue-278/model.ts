import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';

export const group = 'admissionregistration.k8s.io';
export const resources = [
  ['MutatingWebhookConfiguration', 'mutatingwebhookconfigurations', 'v1'],
  ['ValidatingWebhookConfiguration', 'validatingwebhookconfigurations', 'v1'],
  ['ValidatingAdmissionPolicy', 'validatingadmissionpolicies', 'v1'],
  ['ValidatingAdmissionPolicyBinding', 'validatingadmissionpolicybindings', 'v1'],
  ['MutatingAdmissionPolicy', 'mutatingadmissionpolicies', 'v1beta1'],
  ['MutatingAdmissionPolicyBinding', 'mutatingadmissionpolicybindings', 'v1beta1'],
] as const;
export const rows = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
export const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value) : '';
export const isMutating = (kind: string) => kind.startsWith('Mutating');
export const isBinding = (kind: string) => kind.endsWith('Binding');
export const isWebhook = (kind: string) => kind.endsWith('WebhookConfiguration');
const objectLists: Record<string, true> = { webhooks: true, rules: true, resourceRules: true, excludeResourceRules: true, matchConditions: true, variables: true, validations: true, auditAnnotations: true, mutations: true, matchExpressions: true };
const stringLists: Record<string, true> = { operations: true, apiGroups: true, apiVersions: true, resources: true, resourceNames: true, admissionReviewVersions: true, validationActions: true, values: true };
const objects: Record<string, true> = { spec: true, clientConfig: true, service: true, matchConstraints: true, matchResources: true, namespaceSelector: true, objectSelector: true, paramRef: true, selector: true, paramKind: true, applyConfiguration: true, jsonPatch: true };
const scalars: Record<string, true> = { name: true, namespace: true, url: true, path: true, sideEffects: true, failurePolicy: true, reinvocationPolicy: true, matchPolicy: true, scope: true, expression: true, message: true, messageExpression: true, reason: true, kind: true, apiVersion: true, key: true, valueExpression: true, patchType: true, policyName: true, parameterNotFoundAction: true, operator: true };
export function managed(draft: ResourceEditorDraft): boolean {
  return rows(draft.get(['metadata', 'ownerReferences'])).some(owner => !!owner && typeof owner === 'object' && 'controller' in owner && owner.controller === true)
    || draft.get(['metadata', 'labels', 'app.kubernetes.io/managed-by']) !== undefined;
}
export function unavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') return `Admission API discovery is ${context.discovery.status}.`;
  if (context.schema.status !== 'available') return `Installed admission schema is ${context.schema.status}.`;
  // Exact discovery of this newly gated kind is server availability evidence, not an RBAC or admission-health grant.
  const feature = context.discovery.features.MutatingAdmissionPolicy;
  if (context.version === 'v1beta1' && feature && ['absent', 'denied', 'unavailable'].includes(feature)) return 'MutatingAdmissionPolicy feature availability is not confirmed.';
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const supported = (value: unknown): boolean => {
    if (!record(value)) return false;
    return Object.entries(value).every(([key, child]) => {
      if (Object.hasOwn(objectLists, key)) return Array.isArray(child) && child.every(supported);
      if (Object.hasOwn(stringLists, key)) return Array.isArray(child) && child.every(entry => typeof entry === 'string');
      if (Object.hasOwn(objects, key)) return supported(child);
      if (key === 'matchLabels') return record(child) && Object.values(child).every(entry => typeof entry === 'string');
      if (Object.hasOwn(scalars, key)) return typeof child === 'string';
      if (key === 'port' || key === 'timeoutSeconds') return typeof child === 'bigint' || typeof child === 'number' && Number.isSafeInteger(child);
      return true;
    });
  };
  const root = isWebhook(context.kind) ? { webhooks: draft.get(['webhooks']) ?? [] } : { spec: draft.get(['spec']) ?? {} };
  if (!supported(root)) return 'This source shape cannot be safely edited with admission controls. Source remains unchanged.';
  return null;
}
/** Branch changes remove only the opposite union member, never the sensitive client parent. */
export function clientBranch(path: ResourceEditorPath, branch: 'service' | 'url'): ResourceEditorPatch[] {
  return [{ op: 'remove', path: [...path, branch === 'service' ? 'url' : 'service'] },
    { op: 'set', path: [...path, branch], value: branch === 'service' ? { namespace: '', name: '' } : '' }];
}
export function mutationBranch(path: ResourceEditorPath, branch: string): ResourceEditorPatch[] {
  return [{ op: 'set', path: [...path, 'patchType'], value: branch },
    { op: 'remove', path: [...path, branch === 'JSONPatch' ? 'applyConfiguration' : 'jsonPatch'] },
    { op: 'set', path: [...path, branch === 'JSONPatch' ? 'jsonPatch' : 'applyConfiguration', 'expression'], value: '' }];
}
export function validWebhookURL(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
}
export function validateAdmission(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const issue = (path: ResourceEditorPath, message: string) => issues.push({ path, message });
  const required = (path: ResourceEditorPath, label: string) => { if (!text(draft.get(path)).trim()) issue(path, `${label} is required.`); };
  const kind = context.kind;
  const checkRules = (path: ResourceEditorPath, requiredRules: boolean, mutation: boolean) => {
    const values = rows(draft.get(path));
    if (requiredRules && !values.length) issue(path, 'Add at least one matching rule.');
    values.forEach((_, i) => {
      for (const key of ['operations', 'apiGroups', 'apiVersions', 'resources']) {
        const value = rows(draft.get([...path, i, key]));
        if (!value.length) issue([...path, i, key], `${key} requires at least one entry.`);
        if (key === 'operations' && value.some(op => typeof op !== 'string' || !['*', 'CREATE', 'UPDATE', 'CONNECT', ...(mutation ? [] : ['DELETE'])].includes(op))) issue([...path, i, key], 'Choose supported admission operations.');
        if (key !== 'resources' && value.includes('*') && value.length > 1) issue([...path, i, key], 'Wildcard must be the only entry.');
      }
    });
  };
  const namedExpressions = (path: ResourceEditorPath, key = 'name') => {
    const seen = new Set<string>();
    rows(draft.get(path)).forEach((_, i) => {
      required([...path, i, key], key);
      required([...path, i, key === 'key' ? 'valueExpression' : 'expression'], 'CEL expression');
      const name = text(draft.get([...path, i, key]));
      if (seen.has(name)) issue([...path, i, key], 'Names must be unique.');
      seen.add(name);
    });
  };
  if (isWebhook(kind)) {
    const webhooks = rows(draft.get(['webhooks']));
    if (!webhooks.length) issue(['webhooks'], 'Add at least one webhook.');
    const names = new Set<string>();
    webhooks.forEach((_, i) => {
      const p = ['webhooks', i] as const;
      required([...p, 'name'], 'Webhook DNS name');
      const name = text(draft.get([...p, 'name']));
      if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(name) || name.split('.').length < 3 || name.length > 253) issue([...p, 'name'], 'Use a fully qualified webhook name with at least three DNS segments.');
      if (names.has(name)) issue([...p, 'name'], 'Webhook names must be unique.');
      names.add(name);
      const service = draft.has([...p, 'clientConfig', 'service']);
      const url = draft.has([...p, 'clientConfig', 'url']);
      if (service === url) issue([...p, 'clientConfig'], 'Choose exactly one Service or HTTPS URL.');
      if (service) {
        required([...p, 'clientConfig', 'service', 'name'], 'Service name'); required([...p, 'clientConfig', 'service', 'namespace'], 'Service namespace');
        const port = draft.get([...p, 'clientConfig', 'service', 'port']);
        if (port !== undefined && ((typeof port !== 'string' && typeof port !== 'number' && typeof port !== 'bigint') || !/^\d+$/.test(String(port)) || BigInt(String(port)) < 1n || BigInt(String(port)) > 65535n)) issue([...p, 'clientConfig', 'service', 'port'], 'Port must be 1–65535.');
        const path = text(draft.get([...p, 'clientConfig', 'service', 'path']));
        if (path && !path.startsWith('/')) issue([...p, 'clientConfig', 'service', 'path'], 'Service path must start with /.');
      }
      if (url && !validWebhookURL(text(draft.get([...p, 'clientConfig', 'url'])))) issue([...p, 'clientConfig', 'url'], 'Use HTTPS without credentials, query or fragment.');
      if (!['None', 'NoneOnDryRun'].includes(text(draft.get([...p, 'sideEffects'])))) issue([...p, 'sideEffects'], 'Declare None or NoneOnDryRun.');
      if (!rows(draft.get([...p, 'admissionReviewVersions'])).length) issue([...p, 'admissionReviewVersions'], 'Add supported AdmissionReview versions in preference order.');
      const timeout = draft.get([...p, 'timeoutSeconds']);
      if (timeout !== undefined && ((typeof timeout !== 'string' && typeof timeout !== 'number' && typeof timeout !== 'bigint') || !/^\d+$/.test(String(timeout)) || BigInt(String(timeout)) < 1n || BigInt(String(timeout)) > 30n)) issue([...p, 'timeoutSeconds'], 'Timeout must be 1–30 seconds.');
      checkRules([...p, 'rules'], false, false); namedExpressions([...p, 'matchConditions']);
    });
  } else if (isBinding(kind)) {
    required(['spec', 'policyName'], 'Policy');
    if (!isMutating(kind)) {
      const actions = rows(draft.get(['spec', 'validationActions']));
      if (!actions.length || actions.some(action => typeof action !== 'string' || !['Deny', 'Warn', 'Audit'].includes(action))) issue(['spec', 'validationActions'], 'Choose Deny, Warn or Audit.');
      if (actions.includes('Deny') && actions.includes('Warn')) issue(['spec', 'validationActions'], 'Deny and Warn cannot be combined.');
    }
    if (draft.has(['spec', 'paramRef'])) {
      const name = !!text(draft.get(['spec', 'paramRef', 'name']));
      const selector = draft.has(['spec', 'paramRef', 'selector']);
      if (name === selector) issue(['spec', 'paramRef'], 'Choose a parameter name or selector, not both.');
      if (!['Allow', 'Deny'].includes(text(draft.get(['spec', 'paramRef', 'parameterNotFoundAction'])))) issue(['spec', 'paramRef', 'parameterNotFoundAction'], 'Choose behavior when no parameter exists.');
    }
    checkRules(['spec', 'matchResources', 'resourceRules'], false, isMutating(kind));
    checkRules(['spec', 'matchResources', 'excludeResourceRules'], false, isMutating(kind));
  } else {
    checkRules(['spec', 'matchConstraints', 'resourceRules'], true, isMutating(kind));
    checkRules(['spec', 'matchConstraints', 'excludeResourceRules'], false, isMutating(kind));
    namedExpressions(['spec', 'matchConditions']); namedExpressions(['spec', 'variables']);
    if (draft.has(['spec', 'paramKind'])) { required(['spec', 'paramKind', 'apiVersion'], 'Parameter API version'); required(['spec', 'paramKind', 'kind'], 'Parameter kind'); }
    if (isMutating(kind)) {
      if (!['Never', 'IfNeeded'].includes(text(draft.get(['spec', 'reinvocationPolicy'])))) issue(['spec', 'reinvocationPolicy'], 'Choose a reinvocation policy.');
      const mutations = rows(draft.get(['spec', 'mutations']));
      if (!mutations.length) issue(['spec', 'mutations'], 'Add at least one mutation.');
      mutations.forEach((_, i) => {
        const p = ['spec', 'mutations', i] as const;
        const type = text(draft.get([...p, 'patchType']));
        if (!['ApplyConfiguration', 'JSONPatch'].includes(type)) issue([...p, 'patchType'], 'Choose a mutation strategy.');
        required([...p, type === 'JSONPatch' ? 'jsonPatch' : 'applyConfiguration', 'expression'], 'Mutation CEL');
        if (draft.has([...p, 'jsonPatch']) && draft.has([...p, 'applyConfiguration'])) issue(p, 'Only the selected mutation strategy may be present.');
      });
    } else {
      const validations = rows(draft.get(['spec', 'validations']));
      if (!validations.length && !rows(draft.get(['spec', 'auditAnnotations'])).length) issue(['spec', 'validations'], 'Add a validation or audit annotation.');
      validations.forEach((_, i) => required(['spec', 'validations', i, 'expression'], 'Validation CEL'));
      namedExpressions(['spec', 'auditAnnotations'], 'key');
    }
  }
  return issues;
}
