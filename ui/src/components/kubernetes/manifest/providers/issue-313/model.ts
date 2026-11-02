import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch } from '@omniviewdev/runtime';
export const duration = /^([0-9]+(\.[0-9]+)?(ms|s|m|h))+$/;
export const timeout = /^([0-9]+(\.[0-9]+)?(ms|s|m))+$/;
export const branches = ['semver', 'alphabetical', 'numerical'] as const;
export function policyOperations(next: string): ResourceEditorPatch[] {
  return [...branches.filter(branch => branch !== next).map(branch => ({ op: 'remove' as const, path: ['spec', 'policy', branch] })), { op: 'set', path: ['spec', 'policy', next], value: next === 'semver' ? { range: '' } : { order: 'asc' } }];
}
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const text = (...path: string[]) => draft.get(['spec', ...path]);
  const required = (path: string[]) => { if (typeof text(...path) !== 'string' || !String(text(...path)).trim()) issues.push({ path: ['spec', ...path], message: 'Required.' }); };
  if (context.kind === 'ImageRepository') required(['image']);
  if (context.kind === 'ImagePolicy') {
    required(['imageRepositoryRef', 'name']);
    const selected = branches.filter(branch => draft.has(['spec', 'policy', branch]));
    if (selected.length !== 1) issues.push({ path: ['spec', 'policy'], message: 'Choose exactly one selection rule.' });
    if (selected[0] === 'semver') required(['policy', 'semver', 'range']);
    const always = text('digestReflectionPolicy') === 'Always';
    if (always !== draft.has(['spec', 'interval'])) issues.push({ path: ['spec', 'interval'], message: 'Digest interval is required only for Always.' });
  } else required(['interval']);
  if (draft.has(['spec', 'interval']) && !duration.test(String(text('interval')))) issues.push({ path: ['spec', 'interval'], message: 'Use a duration with ms, s, m or h.' });
  if (draft.has(['spec', 'timeout']) && !timeout.test(String(text('timeout')))) issues.push({ path: ['spec', 'timeout'], message: 'Use a timeout with ms, s or m.' });
  if (context.kind === 'ImageUpdateAutomation') { required(['sourceRef', 'name']); required(['git', 'commit', 'author', 'email']); }
  return issues;
}
export function readOnly(_draft: ResourceEditorDraft, context: ResourceEditorContext) {
  return context.intent === 'inspect' || context.ownership?.status !== 'application';
}
