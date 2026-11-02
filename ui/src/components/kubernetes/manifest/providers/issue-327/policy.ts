import type { ResourceEditorDraft, ResourceEditorContext, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const required = (path: (string | number)[]) => { if (!draft.has(path) || draft.get(path) === '') issues.push({ path, message: 'Required.' }); };
  if (context.kind === 'UpdateRequest') return issues;
  if (context.kind.endsWith('CleanupPolicy')) {
    required(['spec', 'schedule']);
    if (typeof draft.get(['spec', 'schedule']) === 'string' && String(draft.get(['spec', 'schedule'])).trim().split(/\s+/).length !== 5) issues.push({ path: ['spec', 'schedule'], message: 'Use five cron fields.' });
    required(['spec', 'match']);
  } else if (context.kind === 'Policy' || context.kind === 'ClusterPolicy') {
    const rules = draft.get(['spec', 'rules']);
    if (!Array.isArray(rules) || !rules.length) issues.push({ path: ['spec', 'rules'], message: 'Add a rule.' });
    if (Array.isArray(rules)) rules.forEach((_, index) => {
      required(['spec', 'rules', index, 'name']);
      required(['spec', 'rules', index, 'match']);
      const branches = ['validate', 'mutate', 'generate', 'verifyImages'].filter(key => draft.has(['spec', 'rules', index, key]));
      if (branches.length !== 1) issues.push({ path: ['spec', 'rules', index], message: 'Choose exactly one rule operation.' });
      if (branches[0] === 'generate') {
        for (const key of ['apiVersion', 'kind', 'name']) required(['spec', 'rules', index, 'generate', key]);
      }
    });
  } else if (context.kind === 'PolicyException') {
    const entries = draft.get(['spec', 'exceptions']);
    if (!Array.isArray(entries) || !entries.length) issues.push({ path: ['spec', 'exceptions'], message: 'Add a policy exception.' });
    if (Array.isArray(entries)) entries.forEach((_, index) => {
      required(['spec', 'exceptions', index, 'policyName']);
      const names = draft.get(['spec', 'exceptions', index, 'ruleNames']);
      if (!Array.isArray(names) || !names.length || names.some(name => typeof name !== 'string' || !name)) issues.push({ path: ['spec', 'exceptions', index, 'ruleNames'], message: 'Select at least one rule name.' });
    });
    required(['spec', 'match']);
  } else if (context.kind === 'GlobalContextEntry') {
    if (draft.has(['spec', 'apiCall']) === draft.has(['spec', 'kubernetesResource'])) issues.push({ path: ['spec'], message: 'Choose exactly one context source.' });
    if (draft.has(['spec', 'kubernetesResource'])) { required(['spec', 'kubernetesResource', 'version']); required(['spec', 'kubernetesResource', 'resource']); }
    if (draft.has(['spec', 'apiCall']) && !draft.has(['spec', 'apiCall', 'service'])) required(['spec', 'apiCall', 'urlPath']);
  }
  return issues;
}

export function unsupported(draft: ResourceEditorDraft): string | null {
  // Opaque subtrees are never copied or replaced by branch switching.
  const spec = draft.get(['spec']);
  return spec !== undefined && (!spec || typeof spec !== 'object' || Array.isArray(spec)) ? 'Unsupported specification shape; use source.' : null;
}
