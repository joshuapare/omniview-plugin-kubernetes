import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export const durationPattern = /^([0-9]+(\.[0-9]+)?(ms|s|m|h))+$/;
export function durationError(value: string): string | null {
  return durationPattern.test(value) ? null : 'Use a duration with ms, s, m or h units.';
}
export function ownershipReason(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.intent === 'create') return null;
  if (context.ownership?.status !== 'application') return 'Source ownership is not application-managed. Edit the source of truth.';
  if (draft.has(['metadata', 'labels', 'kustomize.toolkit.fluxcd.io/name']) || draft.has(['metadata', 'annotations', 'argocd.argoproj.io/tracking-id'])) return 'Git-managed resource: edit the source of truth.';
  const owners = draft.get(['metadata', 'ownerReferences']);
  if (Array.isArray(owners) && owners.length) return 'Controller-owned resource: edit the source of truth.';
  return null;
}
export function validate(draft: ResourceEditorDraft): readonly ResourceEditorFieldIssue[] {
  const errors: ResourceEditorFieldIssue[] = [];
  const add = (path: string[], message: string) => errors.push({ path, message });
  const interval = draft.get(['spec', 'interval']);
  if (typeof interval !== 'string' || durationError(interval)) add(['spec', 'interval'], 'Enter a valid reconciliation interval.');
  for (const key of ['timeout', 'retryInterval']) {
    const value = draft.get(['spec', key]);
    if (value !== undefined && (typeof value !== 'string' || durationError(value))) add(['spec', key], 'Enter a valid duration.');
  }
  if (typeof draft.get(['spec', 'prune']) !== 'boolean') add(['spec', 'prune'], 'Choose whether to prune removed resources.');
  if (!['GitRepository', 'OCIRepository', 'Bucket', 'ExternalArtifact'].includes(String(draft.get(['spec', 'sourceRef', 'kind'])))) add(['spec', 'sourceRef', 'kind'], 'Choose a supported Flux source kind.');
  if (!draft.get(['spec', 'sourceRef', 'name'])) add(['spec', 'sourceRef', 'name'], 'Choose a source name.');
  for (const [list, required] of [['dependsOn', ['name']], ['healthChecks', ['kind', 'name']], ['postBuild.substituteFrom', ['kind', 'name']]] as const) {
    const path = ['spec', ...list.split('.')];
    const rows = draft.get(path);
    if (Array.isArray(rows)) rows.forEach((_, index) => required.forEach(key => {
      if (!draft.get([...path, index, key])) errors.push({ path: [...path, index, key], message: 'Complete this reference.' });
    }));
  }
  const substitutions = draft.get(['spec', 'postBuild', 'substituteFrom']);
  if (Array.isArray(substitutions)) {
    const seen = new Set<string>();
    substitutions.forEach((_, index) => {
      const path = ['spec', 'postBuild', 'substituteFrom', index] as const;
      const kind = draft.get([...path, 'kind']);
      const name = draft.get([...path, 'name']);
      if (kind !== 'Secret' && kind !== 'ConfigMap') errors.push({ path: [...path, 'kind'], message: 'Choose Secret or ConfigMap.' });
      if (typeof kind !== 'string' || typeof name !== 'string') return;
      const key = `${kind}/${name}`;
      if (seen.has(key)) errors.push({ path, message: 'Duplicate substitution reference.' });
      seen.add(key);
    });
  }
  return errors;
}
