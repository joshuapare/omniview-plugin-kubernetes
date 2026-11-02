import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export function protectionReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  const owners = draft.get(['metadata', 'ownerReferences']);
  const resolved = context.intent !== 'create' && ['of', 'by'].some(side =>
    draft.has(['spec', side, 'resourceRef']) && draft.has(['spec', side, 'resourceSelector']));
  return resolved || (Array.isArray(owners) && owners.length > 0) || context.intent === 'inspect' ||
    (context.intent !== 'create' && context.ownership?.status !== 'application') ||
    context.ownership?.status === 'controller' || context.ownership?.status === 'system';
}
export function validateProtection(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  if (protectionReadOnly(draft, context)) return [];
  const issues: ResourceEditorFieldIssue[] = [];
  const issue = (path: string[], message: string) => issues.push({ path, message });
  for (const side of ['of', ...(draft.has(['spec', 'by']) ? ['by'] : [])]) {
    for (const key of ['apiVersion', 'kind']) if (!String(draft.get(['spec', side, key]) ?? '').trim()) issue(['spec', side, key], `Enter ${key}.`);
    if (draft.has(['spec', side, 'resourceRef'])) {
      if (!String(draft.get(['spec', side, 'resourceRef', 'name']) ?? '').trim()) issue(['spec', side, 'resourceRef', 'name'], 'Enter resource name.');
    } else if (!draft.has(['spec', side, 'resourceSelector'])) issue(['spec', side], 'Choose a resource reference or selector.');
  }
  if (!draft.has(['spec', 'by']) && !String(draft.get(['spec', 'reason']) ?? '').trim()) issue(['spec', 'reason'], 'Enter a protection reason or add a dependency.');
  if (context.kind === 'Usage' && !draft.has(['spec', 'by']) && ['resourceRef', 'resourceSelector'].some(branch => draft.has(['spec', 'of', branch, 'namespace']))) issue(['spec', 'of'], 'Namespace override requires a using resource.');
  return issues;
}
