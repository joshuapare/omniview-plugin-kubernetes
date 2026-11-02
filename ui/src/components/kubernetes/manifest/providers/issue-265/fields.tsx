import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorSection, ExactValueField, KeyValueFields, ReferencePicker, useFieldValidity, patchError, patchFields, type ReferenceQuery } from '../../editor-controls';
import { coreReadOnly, integerError, ownershipReason, quantityError, rows, text } from './domain';
import './forms.css';

type Report = (key: string, error: string | null) => void;
const Validity = createContext<Report>(() => undefined);
const ReadOnly = createContext(false);
export function CoreForm({ form, children, confirm }: { form: ResourceEditorFormProps; children: ReactNode; confirm?: string }) {
  const [acknowledged, acknowledge] = useState(false);
  const reason = ownershipReason(form.draft, form.context);
  const report = useFieldValidity(form);
  const locked = form.disabled || coreReadOnly(form.draft, form.context);
  const needsConfirmation = !!confirm && form.context.intent === 'create' && !locked && !acknowledged;
  const availability = form.context.intent === 'create' ? form.context.capabilities.create : form.context.intent === 'edit' ? form.context.capabilities.update : null;
  useEffect(() => { report('ownership', needsConfirmation ? 'Confirm resource ownership before continuing.' : null); }, [needsConfirmation, report]);
  return <ReadOnly.Provider value={locked}><Validity.Provider value={report}><div className="core-editor">
    {reason && <div role="status">{reason}</div>}
    {availability && availability !== 'available' && <div role="status">{form.context.intent === 'create' ? 'Create' : 'Update'} access {availability}.</div>}
    {confirm && form.context.intent === 'create' && <label className="core-confirm"><input type="checkbox" checked={acknowledged} onChange={event => acknowledge(event.target.checked)} disabled={locked} />{confirm}</label>}
    {children}
  </div></Validity.Provider></ReadOnly.Provider>;
}
export function Field({ form, path, label, kind = 'text', required = false, disabled = false, validate, help, sensitive = false }: {
  form: ResourceEditorFormProps; path: ResourceEditorPath; label: string; kind?: 'text' | 'quantity' | 'integer'; required?: boolean; disabled?: boolean; validate?: (value: string) => string | null; help?: string; sensitive?: boolean;
}) {
  const report = useContext(Validity);
  const locked = useContext(ReadOnly);
  const key = JSON.stringify(path);
  return <ExactValueField label={label} help={help ?? `${path.join('.')}${kind === 'quantity' ? ' · Kubernetes quantity; CPU accepts m, memory/storage accept Mi or Gi.' : ''}`} value={text(form.draft, path)} identity={`${form.draft.sessionID}:${key}`} disabled={form.disabled || disabled || locked} type={sensitive ? 'password' : 'text'}
    parse={value => {
      if (!value && !required) return { valid: true, value: '' };
      const error = !value && required ? `${label} is required.` : validate?.(value) ?? (kind === 'quantity' ? quantityError(value) : kind === 'integer' ? integerError(value) : null);
      return error ? { valid: false, error } : { valid: true, value: kind === 'integer' ? Number(value) : value };
    }} onCommit={value => patchError(patchFields(form, [value === '' ? { op: 'remove', path } : { op: 'set', path, value }]))}
    onValidityChange={error => report(key, error)} inputMode={kind === 'integer' ? 'numeric' : kind === 'quantity' ? 'decimal' : 'text'} />;
}
export function Choice({ form, path, label, options, disabled = false, help, boolean = false, optional = true }: {
  form: ResourceEditorFormProps; path: ResourceEditorPath; label: string; options: readonly string[]; disabled?: boolean; help?: string; boolean?: boolean; optional?: boolean;
}) {
  const report = useContext(Validity);
  const locked = useContext(ReadOnly);
  const value = text(form.draft, path);
  const choices = options.includes(value) || !value ? options : [value, ...options];
  return <EditorChoice label={label} value={value} help={help ?? path.join('.')} disabled={form.disabled || disabled || locked}
    options={[...(optional ? [{ value: '', label: 'Not specified' }] : []), ...choices.map(item => ({ value: item, label: item }))]}
    onChange={next => report(JSON.stringify(path), patchError(patchFields(form, [next === '' ? { op: 'remove', path } : { op: 'set', path, value: boolean ? next === 'true' : next }])))} />;
}
export function MapFields({ form, path, label, validateValue }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string; validateValue?: (value: string) => string | null }) {
  const report = useContext(Validity);
  const locked = useContext(ReadOnly);
  return <KeyValueFields form={{ ...form, disabled: form.disabled || locked, onValidityChange: error => report(JSON.stringify(path), error) }} path={path} label={label} validateValue={validateValue} />;
}
export function Repeat({ form, path, title, initial, children, disabled = false }: {
  form: ResourceEditorFormProps; path: ResourceEditorPath; title: string; initial: unknown; children: (index: number) => ReactNode; disabled?: boolean;
}) {
  const report = useContext(Validity);
  const locked = useContext(ReadOnly);
  const mutate = (operations: readonly ResourceEditorPatch[]) => report(JSON.stringify(path), patchError(patchFields(form, operations)));
  const items = rows(form.draft, path);
  return <EditorSection title={title}>{items.map((_, index) => <fieldset key={index} className="core-row"><legend>{title} {index + 1}</legend>{children(index)}
    <Button size="sm" variant="ghost" disabled={form.disabled || disabled || locked} onClick={() => mutate([{ op: 'remove', path: [...path, index] }])}>Remove {title.toLowerCase()} {index + 1}</Button>
  </fieldset>)}<Button size="sm" variant="outline" disabled={form.disabled || disabled || locked} onClick={() => mutate(form.draft.has(path) ? [{ op: 'insert', path, index: items.length, value: initial }] : [{ op: 'set', path, value: [initial] }])}>Add {title.toLowerCase()}</Button></EditorSection>;
}
export function ReferenceField({ form, path, label, query, optional = false }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string; query: ReferenceQuery; optional?: boolean }) {
  const report = useContext(Validity);
  const locked = useContext(ReadOnly);
  const canonicalValue = text(form.draft,path);
  const identity = JSON.stringify([form.draft.sessionID, path, canonicalValue]);
  const [edit, setEdit] = useState<{ identity: string; pending: string | null; error: string | null }>({ identity, pending: null, error: null });
  if (edit.identity !== identity) setEdit({ identity, pending: null, error: null });
  const { pending, error } = edit.identity === identity ? edit : { pending: null, error: null };
  const key = JSON.stringify(path);
  useEffect(() => {
    report(key, error);
    return () => report(key,null);
  }, [key, error, report]);
  return <ReferencePicker form={{...form,disabled:form.disabled||locked}} query={query} label={label} error={error} value={pending ?? canonicalValue} help={path.join('.')} onChange={value => {
    const invalidName = value !== '' && (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(value) || value.length > 253);
    const failure = !value && !optional ? 'Enter a reference name.' : invalidName ? 'Use a valid resource name.' : patchError(patchFields(form, [value === '' ? {op:'remove',path} : {op: 'set', path, value}]));
    setEdit({ identity, pending: failure ? value : null, error: failure });
    report(key, failure);
  }} />;
}
export function Advanced({ children }: { children: ReactNode }) { return <details className="core-advanced"><summary>Advanced</summary>{children}</details>; }
export function SafetyGate({ error }: { error: string | null }) {
  const report = useContext(Validity);
  useEffect(() => { report('safety', error); }, [error, report]);
  return error ? <div role="status">{error}</div> : null;
}
