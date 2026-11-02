import type { ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPath } from '@omniviewdev/runtime';
export type Field = { label: string; path: ResourceEditorPath; choices?: readonly string[]; boolean?: boolean; required?: boolean; help?: string };
export type Rows = { label: string; path: ResourceEditorPath; fields: readonly Field[] };
const f = (label: string, path: string, required = false): Field => ({ label, path: path.split('.'), required });
export const resources = [
  ['ValidatingPolicy', 'validatingpolicies'], ['MutatingPolicy', 'mutatingpolicies'],
  ['GeneratingPolicy', 'generatingpolicies'], ['DeletingPolicy', 'deletingpolicies'],
  ['ImageValidatingPolicy', 'imagevalidatingpolicies'], ['PolicyException', 'policyexceptions'],
] as const;
export function layout(kind: string): { fields: Field[]; rows: Rows[]; consequence: string } {
  const fields: Field[] = [];
  const rows: Rows[] = [];
  let consequence = '';
  const row = (label: string, path: string, fields: Field[]) => rows.push({ label, path: ['spec', path], fields });
  if (kind !== 'PolicyException') {
    rows.push({ label: 'Target rules', path: ['spec', 'matchConstraints', 'resourceRules'], fields: [
      { label: 'API groups', path: ['apiGroups'], help: 'Comma-separated exact API groups. Empty entry means the core API group.' },
      { label: 'API versions', path: ['apiVersions'] }, { label: 'Resource plurals', path: ['resources'] },
      { label: 'Operations', path: ['operations'], help: 'Comma-separated CREATE, UPDATE, DELETE, CONNECT or *.' },
    ] });
    row('Variables', 'variables', [f('Name', 'name', true), f('CEL expression', 'expression', true)]);
  }
  if (kind === 'ValidatingPolicy' || kind === 'ImageValidatingPolicy') {
    row('Validations', 'validations', [f('CEL expression', 'expression', true), ...(kind === 'ValidatingPolicy' ? [f('Failure message', 'message')] : [])]);
    fields.push({ label: 'Violation actions', path: ['spec', 'validationActions'], help: 'Comma-separated Audit, Warn, Deny. CEL and admission validation run on the server.' });
  }
  if (kind === 'MutatingPolicy') {
    row('Mutations', 'mutations', [{ label: 'Patch strategy', path: ['patchType'], choices: ['ApplyConfiguration', 'JSONPatch'], required: true }]);
    fields.push({ label: 'Mutate existing resources', path: ['spec', 'evaluation', 'mutateExisting', 'enabled'], boolean: true });
    consequence = 'Existing-resource evaluation can change resources outside this admission request.';
  }
  if (kind === 'GeneratingPolicy') {
    row('Generation expressions', 'generate', [f('Resource-list CEL expression', 'expression', true)]);
    for (const [key, label] of [['generateExisting', 'Generate for existing triggers'], ['synchronize', 'Synchronize generated resources'], ['orphanDownstreamOnPolicyDelete', 'Orphan downstream on policy deletion']] as const)
      fields.push({ label, path: ['spec', 'evaluation', key, 'enabled'], boolean: true });
    consequence = 'Synchronization overwrites downstream changes. Confirm policy-deletion behavior with the installed controller.';
  }
  if (kind === 'DeletingPolicy') {
    fields.push({ ...f('Cron schedule', 'spec.schedule', true), help: 'Controller interprets the Cron schedule; no deletion runs in this editor.' }, { label: 'Dependent handling', path: ['spec', 'deletionPropagationPolicy'], choices: ['Foreground', 'Background', 'Orphan'] });
    row('Deletion conditions', 'conditions', [f('Condition name', 'name', true), f('Boolean CEL expression', 'expression', true)]);
    consequence = 'Matching resources may be permanently deleted when this policy runs.';
  }
  if (kind === 'ImageValidatingPolicy') {
    row('Image matching', 'matchImageReferences', [f('Image glob', 'glob')]);
    row('Cosign keyless attestors', 'attestors', [f('Attestor name', 'name', true)]);
    consequence = 'Deny can block admission. Trust changes do not verify signatures in this editor.';
  }
  if (kind === 'PolicyException') {
    row('Policy references', 'policyRefs', [{ label: 'Policy kind', path: ['kind'], choices: resources.filter(([k]) => k !== 'PolicyException').map(([k]) => k), required: true }, f('Policy name', 'name', true)]);
    row('Exception conditions', 'matchConditions', [f('Condition name', 'name', true), f('Boolean CEL expression', 'expression', true)]);
    consequence = 'Matching requests bypass referenced policies. Empty conditions broaden the exception.';
  }
  return { fields, rows, consequence };
}
export function validatePolicy(draft: ResourceEditorDraft, kind: string): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const { fields, rows } = layout(kind);
  const check = (field: Field, prefix: ResourceEditorPath = []) => {
    const path = [...prefix, ...field.path];
    const value = draft.get(path);
    if (field.required && (typeof value !== 'string' || !value.trim())) issues.push({ path, message: `${field.label} is required.` });
  };
  fields.forEach(field => check(field));
  rows.forEach(row => {
    const value = draft.get(row.path);
    if (Array.isArray(value)) value.forEach((_, i) => row.fields.forEach(field => check(field, [...row.path, i])));
  });
  const required = kind === 'PolicyException' ? 'policyRefs' : kind === 'MutatingPolicy' ? 'mutations' : kind === 'GeneratingPolicy' ? 'generate' : kind === 'DeletingPolicy' ? null : 'validations';
  if (required && (!Array.isArray(draft.get(['spec', required])) || !(draft.get(['spec', required]) as unknown[]).length)) issues.push({ path: ['spec', required], message: 'Add at least one entry.' });
  return issues;
}
export function validateMutationBranches(draft: ResourceEditorDraft): ResourceEditorFieldIssue[] {
  const mutations = draft.get(['spec', 'mutations']);
  if (!Array.isArray(mutations)) return [];
  return mutations.flatMap((_, index) => {
    const root = ['spec', 'mutations', index];
    const type = draft.get([...root, 'patchType']);
    const branch = type === 'JSONPatch' ? 'jsonPatch' : type === 'ApplyConfiguration' ? 'applyConfiguration' : null;
    if (!branch) return [{ path: [...root, 'patchType'], message: 'Choose a supported patch strategy.' }];
    const expression = draft.get([...root, branch, 'expression']);
    return typeof expression === 'string' && expression.trim() ? [] : [{ path: [...root, branch, 'expression'], message: 'A CEL patch expression is required.' }];
  });
}
