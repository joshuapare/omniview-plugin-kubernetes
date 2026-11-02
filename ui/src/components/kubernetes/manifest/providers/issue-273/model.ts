import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch } from '@omniviewdev/runtime';

export const GROUP = 'rbac.authorization.k8s.io';
export const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const text = (value: unknown): string => typeof value === 'string' ? value : '';
const strings = (value: unknown) => value === undefined || value === null || (Array.isArray(value) && value.every(item => typeof item === 'string'));
export const binding = (kind: string) => kind === 'RoleBinding' || kind === 'ClusterRoleBinding';

export function systemOwned(draft: ResourceEditorDraft): boolean {
  return draft.get(['metadata', 'labels', 'kubernetes.io/bootstrapping']) === 'rbac-defaults'
    || text(draft.get(['metadata', 'name'])).startsWith('system:')
    || list(draft.get(['metadata', 'ownerReferences'])).some(owner => object(owner) && owner.controller === true);
}

export function unavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (binding(context.kind)) {
    const ref = draft.get(['roleRef']);
    if (ref != null && (!object(ref) || ['name', 'kind', 'apiGroup'].some(key => ref[key] !== undefined && typeof ref[key] !== 'string'))) return 'Role reference shape needs source editing.';
    if (object(ref) && ((ref.apiGroup !== undefined && ref.apiGroup !== GROUP) || (ref.kind !== undefined && !['Role', 'ClusterRole'].includes(text(ref.kind))) || (context.kind === 'ClusterRoleBinding' && ref.kind === 'Role'))) return 'Unsupported role reference; source retained.';
    const subjects = draft.get(['subjects']);
    if (subjects != null && (!Array.isArray(subjects) || subjects.some(subject => !object(subject) || !['ServiceAccount', 'User', 'Group'].includes(text(subject.kind)) || ['name', 'namespace', 'apiGroup'].some(key => subject[key] !== undefined && typeof subject[key] !== 'string')))) return 'Unsupported subject shape; use source editing.';
  } else {
    const rules = draft.get(['rules']);
    if (rules != null && (!Array.isArray(rules) || rules.some(rule => !object(rule) || ['verbs', 'apiGroups', 'resources', 'resourceNames', 'nonResourceURLs'].some(key => !strings(rule[key]))))) return 'Unsupported permission rule shape; source retained.';
    const aggregation = draft.get(['aggregationRule']);
    if (aggregation != null && !object(aggregation)) return 'Unsupported aggregation shape; source retained.';
    const selectors = draft.get(['aggregationRule', 'clusterRoleSelectors']);
    if (selectors != null && (!Array.isArray(selectors) || selectors.some(selector => !object(selector) || (selector.matchLabels != null && (!object(selector.matchLabels) || Object.values(selector.matchLabels).some(value => typeof value !== 'string'))) || (selector.matchExpressions != null && (!Array.isArray(selector.matchExpressions) || selector.matchExpressions.some(expression => !object(expression) || typeof expression.key !== 'string' || !['In', 'NotIn', 'Exists', 'DoesNotExist'].includes(text(expression.operator)) || !strings(expression.values))))))) return 'Unsupported aggregation selector shape; source retained.';
  }
  return null;
}

export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });
  if (binding(context.kind)) {
    if (!text(draft.get(['roleRef', 'name'])).trim()) add(['roleRef', 'name'], 'Choose a role name.');
    else if (/[/%]/.test(text(draft.get(['roleRef', 'name']))) || ['.', '..'].includes(text(draft.get(['roleRef', 'name'])))) add(['roleRef', 'name'], 'Enter a valid role name.');
    if (draft.get(['roleRef', 'apiGroup']) !== GROUP) add(['roleRef', 'apiGroup'], 'Set the RBAC role reference API group.');
    const kind = draft.get(['roleRef', 'kind']);
    if (kind !== 'ClusterRole' && (context.kind === 'ClusterRoleBinding' || kind !== 'Role')) add(['roleRef', 'kind'], 'Choose a supported role kind.');
    list(draft.get(['subjects'])).forEach((subject, index) => {
      if (!object(subject)) return;
      if (!text(subject.name).trim()) add(['subjects', index, 'name'], 'Enter a subject name.');
      if (subject.kind === 'ServiceAccount') {
        const nameError = serviceAccountNameError(text(subject.name));
        if (nameError) add(['subjects', index, 'name'], nameError);
        if (text(subject.namespace) && namespaceError(text(subject.namespace))) add(['subjects', index, 'namespace'], 'Enter a valid namespace.');
        if (context.kind === 'ClusterRoleBinding' && !text(subject.namespace).trim()) add(['subjects', index, 'namespace'], 'Enter the ServiceAccount namespace.');
        if (subject.apiGroup !== undefined && subject.apiGroup !== '') add(['subjects', index, 'apiGroup'], 'ServiceAccount uses the core API group.');
      } else {
        if (subject.apiGroup !== undefined && subject.apiGroup !== GROUP) add(['subjects', index, 'apiGroup'], 'User and Group subjects use the RBAC API group.');
        if (subject.namespace !== undefined && subject.namespace !== '') add(['subjects', index, 'namespace'], 'User and Group subjects cannot have a namespace.');
      }
    });
  } else if (!draft.has(['aggregationRule']) || draft.get(['aggregationRule']) == null) {
    list(draft.get(['rules'])).forEach((rule, index) => {
      if (!object(rule)) return;
      const base = ['rules', index];
      if (!list(rule.verbs).length || list(rule.verbs).some(value => !text(value).trim())) add([...base, 'verbs'], 'Each permission rule needs verbs.');
      if (list(rule.nonResourceURLs).length) {
        if (context.kind === 'Role') add([...base, 'nonResourceURLs'], 'Non-resource URLs require a ClusterRole.');
        if (list(rule.resources).length || list(rule.apiGroups).length || list(rule.resourceNames).length) add(base, 'Choose resource permissions or non-resource URLs, not both.');
        if (list(rule.nonResourceURLs).some(value => urlError(text(value)))) add([...base, 'nonResourceURLs'], 'Use *, or an absolute URL path with an optional final /*.');
      } else {
        if (!list(rule.apiGroups).length) add([...base, 'apiGroups'], 'Add an API group; an empty group means core.');
        if (!list(rule.resources).length || list(rule.resources).some(value => !text(value).trim())) add([...base, 'resources'], 'Add resource plurals.');
      }
    });
  }
  if (draft.get(['aggregationRule']) != null && !list(draft.get(['aggregationRule', 'clusterRoleSelectors'])).length) add(['aggregationRule', 'clusterRoleSelectors'], 'Add at least one aggregation selector.');
  list(draft.get(['aggregationRule', 'clusterRoleSelectors'])).forEach((selector, index) => {
    if (!object(selector)) return;
    if (object(selector.matchLabels)) Object.entries(selector.matchLabels).forEach(([key, value]) => {
      const error = labelKeyError(key) || labelValueError(text(value));
      if (error) add(['aggregationRule', 'clusterRoleSelectors', index, 'matchLabels', key], error);
    });
    list(selector.matchExpressions).forEach((expression, row) => {
      if (!object(expression)) return;
      const path = ['aggregationRule', 'clusterRoleSelectors', index, 'matchExpressions', row];
      const keyError = labelKeyError(text(expression.key));
      if (keyError) add([...path, 'key'], keyError);
      const needsValues = expression.operator === 'In' || expression.operator === 'NotIn';
      if (needsValues && !list(expression.values).length) add([...path, 'values'], 'This operator needs values.');
      if (!needsValues && list(expression.values).length) add([...path, 'values'], 'Existence operators cannot have values.');
      if (list(expression.values).some(value => labelValueError(text(value)))) add([...path, 'values'], 'Enter valid selector label values.');
    });
  });
  return issues;
}

/** Change only union leaves. Never write a projected subject or role reference back. */
export function subjectKindPatches(index: number, kind: string, namespace: string): ResourceEditorPatch[] {
  const base = ['subjects', index];
  return [
    { op: 'set', path: [...base, 'kind'], value: kind },
    { op: 'set', path: [...base, 'apiGroup'], value: kind === 'ServiceAccount' ? '' : GROUP },
    kind === 'ServiceAccount' ? { op: 'set', path: [...base, 'namespace'], value: namespace } : { op: 'remove', path: [...base, 'namespace'] },
  ];
}

export function ruleBranchPatches(index: number, urls: boolean): ResourceEditorPatch[] {
  const remove = urls ? ['apiGroups', 'resources', 'resourceNames'] : ['nonResourceURLs'];
  return [
    ...remove.map(key => ({ op: 'remove' as const, path: ['rules', index, key] })),
    ...(urls ? [{ op: 'set' as const, path: ['rules', index, 'nonResourceURLs'], value: ['/'] }] : [
      { op: 'set' as const, path: ['rules', index, 'apiGroups'], value: [''] },
      { op: 'set' as const, path: ['rules', index, 'resources'], value: [] },
    ]),
  ];
}

export function labelKeyError(value: string): string | null {
  const parts = value.split('/');
  const name = parts[parts.length - 1];
  if (parts.length > 2 || name.length > 63 || !/^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/.test(name)) return 'Enter a valid label key.';
  if (parts.length === 2 && (parts[0].length > 253 || !parts[0].split('.').every(part => part.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)))) return 'Enter a valid DNS label prefix.';
  return null;
}

export function labelValueError(value: string): string | null {
  return value.length <= 63 && (value === '' || /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/.test(value)) ? null : 'Enter a valid label value.';
}

export function urlError(value: string): string | null {
  return value === '*' || (/^\/[^*]*(?:\*)?$/.test(value) && (!value.includes('*') || value.endsWith('/*'))) ? null : 'Use *, or an absolute URL path with an optional final /*.';
}

export function serviceAccountNameError(value: string): string | null {
  return value.length > 0 && value.length <= 253 && value.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)) ? null : 'Enter a valid ServiceAccount name.';
}

export function namespaceError(value: string): string | null {
  return value.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value) ? null : 'Enter a valid namespace.';
}
