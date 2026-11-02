import type { ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorContext } from '@omniviewdev/runtime';
export const scalers = ['ScaledObject', 'ScaledJob'];
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const need = (path: (string | number)[]) => { if (!draft.get(path)) issues.push({ path, message: 'Required.' }); };
  if (context.kind === 'ScaledObject') need(['spec', 'scaleTargetRef', 'name']);
  if (context.kind === 'ScaledJob') {
    const containers = draft.get(['spec', 'jobTargetRef', 'template', 'spec', 'containers']);
    if (!Array.isArray(containers) || !containers.length) issues.push({ path: ['spec', 'jobTargetRef'], message: 'Add a Job container.' });
    if (Array.isArray(containers)) containers.forEach((_, i) => {
      need(['spec', 'jobTargetRef', 'template', 'spec', 'containers', i, 'name']);
      need(['spec', 'jobTargetRef', 'template', 'spec', 'containers', i, 'image']);
    });
    need(['spec', 'jobTargetRef', 'template', 'spec', 'restartPolicy']);
  }
  if (scalers.includes(context.kind)) {
    const triggers = draft.get(['spec', 'triggers']);
    if (!Array.isArray(triggers) || !triggers.length) issues.push({ path: ['spec', 'triggers'], message: 'Add a scaling trigger.' });
    if (Array.isArray(triggers)) triggers.forEach((_, i) => { need(['spec', 'triggers', i, 'type']); });
    if (Array.isArray(triggers)) triggers.forEach((_, i) => {
      if (draft.get(['spec', 'triggers', i, 'type']) === 'rabbitmq') {
        need(['spec', 'triggers', i, 'metadata', 'queueName']);
        need(['spec', 'triggers', i, 'metadata', 'value']);
      }
    });
    const min = draft.get(['spec', 'minReplicaCount']); const max = draft.get(['spec', 'maxReplicaCount']);
    if (min !== undefined && max !== undefined) {
      const minimum = typeof min === 'bigint' ? min : typeof min === 'number' && Number.isSafeInteger(min) ? BigInt(min) : typeof min === 'string' && /^\d+$/.test(min) ? BigInt(min) : null;
      const maximum = typeof max === 'bigint' ? max : typeof max === 'number' && Number.isSafeInteger(max) ? BigInt(max) : typeof max === 'string' && /^\d+$/.test(max) ? BigInt(max) : null;
      if (minimum === null || maximum === null || minimum < 0n || maximum < 0n) issues.push({ path: ['spec', 'minReplicaCount'], message: 'Replica limits must be nonnegative integers.' });
      else if (minimum > maximum) issues.push({ path: ['spec', 'maxReplicaCount'], message: 'Maximum must be at least minimum.' });
    }
    const fallback = draft.get(['spec', 'fallback']);
    if (fallback !== undefined) { need(['spec', 'fallback', 'failureThreshold']); if (!draft.has(['spec', 'fallback', 'replicas'])) issues.push({ path: ['spec', 'fallback', 'replicas'], message: 'Required with fallback.' }); }
  }
  for (const [list, keys] of Object.entries({ secretTargetRef: ['parameter', 'name', 'key'], configMapTargetRef: ['parameter', 'name', 'key'], env: ['parameter', 'name'], boundServiceAccountToken: ['parameter', 'serviceAccountName'] })) {
    const rows = draft.get(['spec', list]); if (Array.isArray(rows)) rows.forEach((_, i) => keys.forEach(key => need(['spec', list, i, key])));
  }
  return issues;
}
export function unavailable(draft: ResourceEditorDraft): string | null {
  return draft.get(['metadata', 'labels', 'app.kubernetes.io/managed-by']) === 'Helm' || draft.has(['metadata', 'annotations', 'argocd.argoproj.io/tracking-id']) ? 'Edit the managing source instead.' : null;
}
export function integer(text: string) {
  if (!/^\d+$/.test(text) || BigInt(text) > 2147483647n) return { valid: false as const, error: 'Enter an integer from 0 to 2147483647.' };
  return { valid: true as const, value: Number(text) };
}
