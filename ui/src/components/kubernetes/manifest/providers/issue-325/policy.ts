import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export const group = 'snapshot.storage.k8s.io';
export function generated(draft: ResourceEditorDraft): boolean { return draft.has(['spec', 'source', 'volumeHandle']); }
export function inspectOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  return context.intent === 'inspect' || (context.intent !== 'create' && context.ownership?.status !== 'application') || (context.kind === 'VolumeSnapshotContent' && generated(draft));
}
export function validateSnapshot(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (inspectOnly(draft, context)) return [];
  const issues: ResourceEditorFieldIssue[] = [];
  const requireText = (path: string[]) => { const value = draft.get(path); if (typeof value !== 'string' || !value.trim()) issues.push({ path, message: 'Required.' }); };
  if (context.kind === 'VolumeSnapshot') {
    const pvc = draft.has(['spec', 'source', 'persistentVolumeClaimName']);
    const content = draft.has(['spec', 'source', 'volumeSnapshotContentName']);
    if (pvc === content) issues.push({ path: ['spec', 'source'], message: 'Choose exactly one snapshot source.' });
    else requireText(['spec', 'source', pvc ? 'persistentVolumeClaimName' : 'volumeSnapshotContentName']);
  } else {
    const prefix = context.kind === 'VolumeSnapshotClass' ? [] : ['spec'];
    requireText([...prefix, 'driver']);
    if (!['Delete', 'Retain'].includes(String(draft.get([...prefix, 'deletionPolicy'])))) issues.push({ path: [...prefix, 'deletionPolicy'], message: 'Choose a deletion policy.' });
    if (context.kind === 'VolumeSnapshotContent') {
      requireText(['spec', 'source', 'snapshotHandle']);
      requireText(['spec', 'volumeSnapshotRef', 'name']);
      requireText(['spec', 'volumeSnapshotRef', 'namespace']);
    }
  }
  if (draft.get(['spec', 'volumeSnapshotClassName']) === '') issues.push({ path: ['spec', 'volumeSnapshotClassName'], message: 'Omit the class to use its default.' });
  return issues;
}
