import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { EditorField, EditorHelp, patchFields, patchError } from '../../editor-controls';
import { text } from './model';
import './networking.css';

interface LocalInput { text: string; error: string | null; canonical: string; path: ResourceEditorPath }
const fingerprint = (value: unknown) => JSON.stringify(value, (_, entry: unknown) => typeof entry === 'bigint' ? `${entry}n` : entry) ?? '';
export interface NetworkingForm {
  form: ResourceEditorFormProps;
  locals: Record<string, LocalInput>;
  setLocals: Dispatch<SetStateAction<Record<string, LocalInput>>>;
  commit: (operations: readonly ResourceEditorPatch[]) => string | null;
  stage: (path: ResourceEditorPath, slot: string, error: string | null, value?: string) => void;
  local: (path: ResourceEditorPath, slot: string) => LocalInput | undefined;
  failure: string | null;
}
export function useNetworkingForm(form: ResourceEditorFormProps): NetworkingForm {
  const [locals, setLocals] = useState<Record<string, LocalInput>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const activeErrors = Object.values(locals).filter(value => value.canonical === fingerprint(form.draft.get(value.path))).map(value => value.error).filter(Boolean);
  const error = failure ?? activeErrors[0] ?? null;
  useEffect(() => { form.onValidityChange(error); }, [error, form.onValidityChange]);
  const commit = (operations: readonly ResourceEditorPatch[]): string | null => {
    const error = patchError(patchFields(form, operations));
    setFailure(error);
    if (!error) setLocals(previous => Object.fromEntries(Object.entries(previous).filter(([, local]) => !operations.some(operation => operation.op !== 'insert' && operation.path.every((segment, index) => local.path[index] === segment)))));
    return error;
  };
  const stage = (path: ResourceEditorPath, slot: string, error: string | null, value?: string) => setLocals(previous => ({ ...previous, [JSON.stringify([path, slot])]: { path, canonical: fingerprint(form.draft.get(path)), text: value ?? text(form.draft.get(path)), error } }));
  const local = (path: ResourceEditorPath, slot: string) => {
    const entry = locals[JSON.stringify([path, slot])];
    return entry?.canonical === fingerprint(form.draft.get(path)) ? entry : undefined;
  };
  return { form, locals, setLocals, commit, failure: error, stage, local };
}
export type ParseInput = (value: string) => { value: unknown; error?: never } | { error: string; value?: never };

export function NetworkField({ editor, path, label, parse, optional, readOnly, help, operations, format = text, slot = 'value' }: {
  editor: NetworkingForm; path: ResourceEditorPath; label: string; parse?: ParseInput; optional?: boolean; readOnly?: boolean; help?: string; format?: (value: unknown) => string; slot?: string;
  operations?: (value: unknown) => readonly ResourceEditorPatch[];
}) {
  const source = editor.form.draft.get(path), canonical = fingerprint(source), key = JSON.stringify([path, slot]);
  const local = editor.locals[key], active = local?.canonical === canonical ? local : undefined;
  return <EditorField label={label} value={active?.text ?? format(source)} error={active?.error} disabled={editor.form.disabled} readOnly={readOnly} help={help} onChange={next => {
    const parsed = parse?.(next) ?? { value: next };
    let error = parsed.error ?? null;
    if (!error) error = editor.commit(operations ? operations(parsed.value) : [optional && next === '' ? { op: 'remove', path } : { op: 'set', path, value: parsed.value }]);
    editor.setLocals(previous => ({ ...previous, [key]: { text: next, error, canonical, path } }));
  }} />;
}
export function AddButton({ editor, label, onClick }: { editor: NetworkingForm; label: string; onClick: () => void }) {
  return <Button size="sm" variant="outline" disabled={editor.form.disabled} onClick={onClick}>{label}</Button>;
}
export function RemoveButton({ editor, path, label }: { editor: NetworkingForm; path: ResourceEditorPath; label: string }) {
  return <Button size="sm" variant="ghost" disabled={editor.form.disabled} aria-label={label} onClick={() => {
    if (editor.commit([{ op: 'remove', path }])) return;
    editor.setLocals(previous => {
      const next: Record<string, LocalInput> = {};
      const parent = path.slice(0, -1), index = path.at(-1);
      for (const [key, local] of Object.entries(previous)) {
        if (path.every((segment, index) => local.path[index] === segment)) continue;
        if (typeof index === 'number' && parent.every((segment, index) => local.path[index] === segment) && typeof local.path[parent.length] === 'number' && Number(local.path[parent.length]) > index) {
          const shifted = [...local.path];
          shifted[parent.length] = Number(shifted[parent.length]) - 1;
          next[JSON.stringify([shifted, (JSON.parse(key) as [unknown, string])[1]])] = { ...local, path: shifted };
        } else next[key] = local;
      }
      return next;
    });
  }}>Remove</Button>;
}
export function AppendButton({ editor, path, label, value }: { editor: NetworkingForm; path: ResourceEditorPath; label: string; value: unknown }) {
  return <AddButton editor={editor} label={label} onClick={() => editor.commit(editor.form.draft.has(path) ? [{ op: 'insert', path, index: Array.isArray(editor.form.draft.get(path)) ? (editor.form.draft.get(path) as unknown[]).length : 0, value }] : [{ op: 'set', path, value: [value] }])} />;
}
export function Consequence({ children, help }: { children: string; help?: string }) {
  return <div className="networking-consequence" role="note">{children}{help && <EditorHelp label={children}>{help}</EditorHelp>}</div>;
}
