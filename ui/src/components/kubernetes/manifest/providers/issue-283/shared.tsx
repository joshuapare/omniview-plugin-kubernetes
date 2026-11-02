import { Button } from '@omniviewdev/base-ui';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection, ReferencePicker } from '../../editor-controls';
import { celError, rows, text } from './model';
import './dra.css';

type LocalField = { canonical: string; text: string; error: string | null };
type Parsed = { value: string | bigint | boolean } | { error: string };
interface Composition { form: ResourceEditorFormProps; locked: boolean; locals: Record<string, LocalField>; setLocal: (key: string, value: LocalField) => void; commit: (operations: readonly ResourceEditorPatch[]) => string | null; }
const DraftContext = createContext<Composition | null>(null);
export function useDra() { const value = useContext(DraftContext); if (!value) throw new Error('DRA fields require an editor.'); return value; }
export function DraEditor({ form, locked = false, children }: { form: ResourceEditorFormProps; locked?: boolean; children: ReactNode }) {
  return <DraftSession key={form.draft.sessionID} form={form} locked={locked}>{children}</DraftSession>;
}
function DraftSession({ form, locked, children }: { form: ResourceEditorFormProps; locked: boolean; children: ReactNode }) {
  const [locals, setLocals] = useState<Record<string, LocalField>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const setLocal = useCallback((key: string, value: LocalField) => setLocals(current => ({ ...current, [key]: value })), []);
  const localError = Object.entries(locals).find(([key, value]) => value.error && text(form.draft.get(JSON.parse(key) as ResourceEditorPath)) === value.canonical)?.[1].error ?? null;
  useEffect(() => { form.onValidityChange(actionError ?? localError); }, [form.onValidityChange, actionError, localError]);
  const commit = (operations: readonly ResourceEditorPatch[]): string | null => {
    if (locked || form.disabled) return 'This resource is read-only.';
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
    const failure = result.status === 'accepted' ? null : result.message;
    if (result.status === 'accepted') setLocals(current => {
      let entries = Object.entries(current);
      for (const operation of operations) {
        entries = entries.flatMap(([key, value]) => {
          const path = JSON.parse(key) as (string | number)[];
          const parent = operation.op === 'insert' ? operation.path : operation.path.slice(0, -1);
          const removedIndex = operation.op === 'remove' ? operation.path.at(-1) : undefined;
          const prefix = parent.every((part, index) => path[index] === part);
          const index = path[parent.length];
          if (prefix && typeof index === 'number' && (operation.op === 'insert' || typeof removedIndex === 'number')) {
            if (operation.op === 'remove' && index === removedIndex) return [];
            if (operation.op === 'insert' && index >= operation.index) path[parent.length] = index + 1;
            else if (typeof removedIndex === 'number' && index > removedIndex) path[parent.length] = index - 1;
          } else if (operation.path.every((part, index) => path[index] === part)) return [];
          return [[JSON.stringify(path), value] as [string, LocalField]];
        });
      }
      return Object.fromEntries(entries);
    });
    setActionError(failure); return failure;
  };
  return <DraftContext.Provider value={{ form, locked: locked || form.disabled, locals, setLocal, commit }}><div className="dra-editor">{actionError && <Notice error>{actionError}</Notice>}{children}</div></DraftContext.Provider>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={error ? 'dra-notice dra-error' : 'dra-notice'} role={error ? 'alert' : 'status'}>{children}</div>; }
export function DraftField({ label, path, help, required, validate, parse, placeholder, numeric = false, reference = false, readOnly = false, emptyIsPartial = false }: {
  label: string; path: ResourceEditorPath; help?: string; required?: boolean; validate?: (value: string) => string | null; parse?: (value: string) => Parsed;
  placeholder?: string; numeric?: boolean; reference?: boolean; readOnly?: boolean; emptyIsPartial?: boolean;
}) {
  const { form, locked, locals, setLocal, commit } = useDra();
  const key = JSON.stringify(path); const canonical = text(form.draft.get(path)); const local = locals[key];
  const value = local?.canonical === canonical ? local.text : canonical;
  const parsedCanonical = parse && canonical !== '' ? parse(canonical) : undefined;
  const canonicalError = (canonical !== '' || required ? validate?.(canonical) : null) ?? (parsedCanonical && 'error' in parsedCanonical ? parsedCanonical.error : null) ?? (required && !canonical.trim() ? 'Required.' : null);
  const error = local?.canonical === canonical ? local.error : canonicalError;
  const onChange = (next: string) => {
    const invalid = (next !== '' || required ? validate?.(next) : null) ?? (required && !next.trim() ? 'Required.' : null);
    const parsed = parse && (required || emptyIsPartial || next !== '') ? parse(next) : { value: next };
    const failure = invalid ?? ('error' in parsed ? parsed.error : null);
    const rejected = failure ?? commit(next === '' && !required ? [{ op: 'remove', path }] : [{ op: 'set', path, value: 'value' in parsed ? parsed.value : next }]);
    setLocal(key, { canonical, text: next, error: rejected });
  };
  const common = { label, value, onChange, help, error, readOnly: locked || readOnly, placeholder, inputMode: numeric ? 'numeric' as const : 'text' as const };
  return reference ? <ReferencePicker {...common} form={form} query={{ group: 'resource.k8s.io', version: form.context.version, resource: 'deviceclasses', projection: 'metadata' }} /> : <EditorField {...common} />;
}
export function DraftChoice({ label, path, options, help, fallback, onChoose, readOnly = false }: { label: string; path: ResourceEditorPath; options: readonly { value: string; label: string }[]; help?: string; fallback?: string; onChoose?: (value: string) => readonly ResourceEditorPatch[]; readOnly?: boolean }) {
  const { form, locked, commit } = useDra();
  return <EditorChoice label={label} value={text(form.draft.get(path)) || fallback || ''} options={options} help={help} disabled={locked || readOnly} onChange={value => commit(onChoose ? onChoose(value) : [{ op: 'set', path, value }])} />;
}
export function AddRow({ path, value, label, max = 32 }: { path: ResourceEditorPath; value: unknown; label: string; max?: number }) {
  const { form, locked, commit } = useDra(); const count = rows(form.draft.get(path)).length;
  return <Button size="sm" variant="outline" disabled={locked || count >= max} onClick={() => commit(form.draft.has(path) ? [{ op: 'insert', path, index: count, value }] : [{ op: 'set', path, value: [value] }])}>{label}</Button>;
}
export function RemoveRow({ path, label }: { path: ResourceEditorPath; label: string }) {
  const { locked, commit } = useDra();
  return <Button size="sm" variant="ghost" disabled={locked} aria-label={label} onClick={() => commit([{ op: 'remove', path }])}>Remove</Button>;
}
export function Selectors({ path }: { path: ResourceEditorPath }) {
  const { form } = useDra(); const selectors = rows(form.draft.get(path));
  return <EditorSection title="Device selectors">{selectors.map((_, index) => <div className="dra-row" key={index}><DraftField label={`CEL expression ${index + 1}`} path={[...path, index, 'cel', 'expression']} required validate={celError} help="Every expression must evaluate to true. Kubernetes validates CEL syntax and evaluation cost." /><RemoveRow path={[...path, index]} label={`Remove selector ${index + 1}`} /></div>)}<AddRow path={path} value={{ cel: { expression: '' } }} label="Add CEL selector" /></EditorSection>;
}
export function Summary({ label, value }: { label: string; value: unknown }) { return <div className="dra-summary"><span>{label}</span><strong>{text(value) || '—'}</strong></div>; }
