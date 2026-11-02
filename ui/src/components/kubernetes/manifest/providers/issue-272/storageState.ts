import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { useCallback, useEffect, useState } from 'react';

import { patchError, patchFields, scalarText } from '../../editor-controls';

import { authoringDisabled } from './rules';

interface StorageBuffer { text: string; canonical?: string }
export interface StorageRow { id: string; index: number }
export interface StorageState {
  locked: boolean;
  report: (key: string, error: string | null) => void;
  commit: (operations: readonly ResourceEditorPatch[]) => string | null;
  buffers: Readonly<Record<string, StorageBuffer>>;
  buffer: (key: string, value: string, canonical?: string) => void;
  errors: Readonly<Record<string, string | null>>;
  rows: (path: ResourceEditorPath) => readonly StorageRow[];
}
export const omitted = { value: '', label: 'Not specified' };
export const booleanOptions = [omitted, { value: 'true', label: 'Enabled' }, { value: 'false', label: 'Disabled' }];

/** A session-keyed resource form owns one ledger; sections never reset local input. */
export function useStorageForm(form: ResourceEditorFormProps): StorageState {
  const [reported, setReported] = useState<Record<string, string | null>>({});
  const [buffers, setBuffers] = useState<Record<string, StorageBuffer>>({});
  const [rowIDs, setRowIDs] = useState<Record<string, readonly string[]>>({});
  const buffer = useCallback((key: string, text: string, canonical?: string) => setBuffers(previous => ({ ...previous, [key]: { text, canonical } })), []);
  const report = useCallback((key: string, error: string | null) => setReported(previous => previous[key] === error ? previous : { ...previous, [key]: error }), []);
  const errors: Record<string, string | null> = {};
  for (const [key, error] of Object.entries(reported)) {
    const entry = buffers[key];
    const path = parseBufferPath(key);
    const current = path ? form.draft.get(path) : undefined;
    const canonical = Array.isArray(current) && current.every(value => typeof value === 'string') ? current.join(', ') : scalarText(current);
    if (!entry || entry.canonical === undefined || !path || entry.canonical === canonical) errors[key] = error;
  }
  const localError = Object.values(errors).find(Boolean);
  const onValidityChange = form.onValidityChange;
  useEffect(() => { onValidityChange(localError || null); }, [localError, onValidityChange]);
  const locked = form.disabled || authoringDisabled(form.draft, form.context);
  const rows = (path: ResourceEditorPath): readonly StorageRow[] => {
    const value = form.draft.get(path);
    if (!Array.isArray(value)) return [];
    const key = JSON.stringify(path);
    return value.map((_, index) => ({ index, id: rowIDs[key]?.[index] ?? `${form.draft.sessionID}:${key}:${index}` }));
  };
  const commit = (operations: readonly ResourceEditorPatch[]): string | null => {
    const failure = patchError(patchFields({ ...form, disabled: locked }, operations));
    if (failure) return failure;
    for (const operation of operations) {
      if (operation.op === 'remove') {
        setBuffers(previous => rebaseRemoved(previous, operation.path));
        setReported(previous => rebaseRemoved(previous, operation.path));
      }
      const numericIndex = operation.path.at(-1);
      const collectionPath = operation.op === 'remove' && typeof numericIndex === 'number' ? operation.path.slice(0, -1) : operation.path;
      if (!(collectionPath.length === 1 && (collectionPath[0] === 'mountOptions' || collectionPath[0] === 'allowedTopologies') || collectionPath.length === 2 && collectionPath[0] === 'spec' && collectionPath[1] === 'tokenRequests' || collectionPath.length === 3 && collectionPath[0] === 'allowedTopologies' && collectionPath[2] === 'matchLabelExpressions')) continue;
      const value = form.draft.get(collectionPath);
      if (!Array.isArray(value) && operation.op !== 'set') continue;
      if (operation.op === 'set' && !Array.isArray(operation.value)) continue;
      const key = JSON.stringify(collectionPath);
      const previousIDs = rows(collectionPath).map(row => row.id);
      setRowIDs(previous => {
        const ids = [...(previous[key] ?? previousIDs)];
        if (operation.op === 'remove' && typeof numericIndex === 'number') ids.splice(numericIndex, 1);
        else if (operation.op === 'insert') ids.splice(operation.index, 0, `${form.draft.sessionID}:${crypto.randomUUID()}`);
        else if (operation.op === 'set' && Array.isArray(operation.value)) {
          ids.length = Math.min(ids.length, operation.value.length);
          while (ids.length < operation.value.length) ids.push(`${form.draft.sessionID}:${crypto.randomUUID()}`);
        }
        const rebased = operation.op === 'remove' ? rebaseRemoved(previous, operation.path) : previous;
        return { ...rebased, [key]: ids };
      });
    }
    return null;
  };
  return { locked, report, commit, buffers, buffer, errors, rows };
}
function parseBufferPath(key: string): (string | number)[] | null {
  if (!key.startsWith('[')) return null;
  try {
    const path: unknown = JSON.parse(key);
    return Array.isArray(path) && path.every((part: unknown): part is string | number => typeof part === 'string' || typeof part === 'number') ? path : null;
  } catch { return null; }
}
/** Rebase row-local drafts and identities without discarding an invalid sibling. */
function rebaseRemoved<T>(values: Record<string, T>, removed: ResourceEditorPath): Record<string, T> {
  const result: Record<string, T> = {};
  const parent = removed.slice(0, -1);
  const removedIndex = removed.at(-1);
  for (const [key, value] of Object.entries(values)) {
    const path = parseBufferPath(key);
    if (!path) { result[key] = value; continue; }
    if (parent.every((part, position) => path[position] === part)) {
      const index = path[parent.length];
      if (index === removedIndex) continue;
      if (typeof removedIndex === 'number' && typeof index === 'number' && index > removedIndex) path[parent.length] = index - 1;
    }
    result[JSON.stringify(path)] = value;
  }
  return result;
}
export function storageBuffer(state: StorageState, key: string, initial = ''): [string, (text: string) => void] {
  return [state.buffers[key]?.text ?? initial, text => state.buffer(key, text)];
}
