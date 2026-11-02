import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch, ResourceEditorPatchResult } from '@omniviewdev/runtime';

export type DraftScalar = string | number | bigint | boolean | null;
export function scalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'bigint' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

/** Captures the immutable revision. Never substitutes a newer revision for stale callbacks. */
export function patchFields(form: ResourceEditorFormProps, operations: readonly ResourceEditorPatch[]): ResourceEditorPatchResult {
  if (form.disabled) return { status: 'forbidden', message: 'Editing is disabled.' };
  return form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
}

/** Scalars only: opaque projected objects cannot accidentally become authored values. */
export function setDraftField(form: ResourceEditorFormProps, path: ResourceEditorPath, value: DraftScalar): ResourceEditorPatchResult {
  if (value !== null && !['string', 'number', 'bigint', 'boolean'].includes(typeof value) || typeof value === 'number' && !Number.isSafeInteger(value)) {
    return { status: 'unsafe', message: 'Use an exact scalar value.' };
  }
  return patchFields(form, [{ op: 'set', path, value }]);
}
export function removeDraftField(form: ResourceEditorFormProps, path: ResourceEditorPath): ResourceEditorPatchResult {
  return patchFields(form, [{ op: 'remove', path }]);
}
export function patchError(result: ResourceEditorPatchResult): string | null {
  return result.status === 'accepted' ? null : result.message;
}

/** Rename one scalar entry atomically; never write a projected map back wholesale. */
export function renameDraftKey(form: ResourceEditorFormProps, path: ResourceEditorPath, from: string, to: string): ResourceEditorPatchResult {
  if (from === to) return { status: 'accepted', revision: form.draft.revision };
  if (!to) return { status: 'invalid', message: 'Enter a key.' };
  if (form.draft.has([...path, to])) return { status: 'invalid', message: 'Key already exists.' };
  const value = form.draft.get([...path, from]);
  if (typeof value !== 'string') return { status: 'unsafe', message: 'Only text entries can be renamed here.' };
  return patchFields(form, [{ op: 'set', path: [...path, to], value }, { op: 'remove', path: [...path, from] }]);
}
