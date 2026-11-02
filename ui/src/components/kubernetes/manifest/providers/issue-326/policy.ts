import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export const group = 'groupsnapshot.storage.k8s.io';
export const version = 'v1beta1';
export const text = (draft: ResourceEditorDraft, path: readonly (string | number)[]) => { const value = draft.get(path); return typeof value === 'string' ? value : ''; };
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const required = (path: readonly string[]) => { if (!text(draft, path).trim()) issues.push({ path, message: 'Required.' }); };
  if (context.kind === 'VolumeGroupSnapshotClass') { required(['driver']); if (!['Retain', 'Delete'].includes(text(draft, ['deletionPolicy']))) issues.push({ path: ['deletionPolicy'], message: 'Choose Retain or Delete.' }); }
  else if (context.kind === 'VolumeGroupSnapshot') {
    const selector = draft.has(['spec', 'source', 'selector']);
    const content = draft.has(['spec', 'source', 'volumeGroupSnapshotContentName']);
    if (selector === content) issues.push({ path: ['spec', 'source'], message: 'Choose exactly one source.' });
    if (content) required(['spec', 'source', 'volumeGroupSnapshotContentName']);
    if (draft.has(['spec', 'volumeGroupSnapshotClassName'])) required(['spec', 'volumeGroupSnapshotClassName']);
  } else {
    required(['spec', 'driver']);
    if (!['Retain', 'Delete'].includes(text(draft, ['spec', 'deletionPolicy']))) issues.push({ path: ['spec', 'deletionPolicy'], message: 'Choose Retain or Delete.' });
    const imported = draft.has(['spec', 'source', 'groupSnapshotHandles']);
    const dynamic = draft.has(['spec', 'source', 'volumeHandles']);
    if (imported === dynamic) issues.push({ path: ['spec', 'source'], message: 'Choose exactly one content source.' });
    if (context.intent === 'create' && dynamic) issues.push({ path: ['spec', 'source'], message: 'Dynamic content is created by the controller. Create a VolumeGroupSnapshot instead.' });
    if (imported) {
      required(['spec', 'source', 'groupSnapshotHandles', 'volumeGroupSnapshotHandle']);
      const members = draft.get(['spec', 'source', 'groupSnapshotHandles', 'volumeSnapshotHandles']);
      if (!Array.isArray(members) || !members.length || members.some(value => typeof value !== 'string' || !value.trim())) issues.push({ path: ['spec', 'source', 'groupSnapshotHandles', 'volumeSnapshotHandles'], message: 'Add nonempty member snapshot handles.' });
    }
    required(['spec', 'volumeGroupSnapshotRef', 'name']); required(['spec', 'volumeGroupSnapshotRef', 'namespace']);
  }
  return issues;
}
export function unavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.kind === 'VolumeGroupSnapshotContent' && context.intent === 'create' && draft.has(['spec', 'source', 'volumeHandles'])) return 'Controller-created content is inspection-only. Submit a VolumeGroupSnapshot instead.';
  return null;
}
