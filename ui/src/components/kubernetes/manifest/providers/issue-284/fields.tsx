import { Button } from '@omniviewdev/base-ui';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection } from '../../editor-controls';
import { annotationPath, fieldError, object, ownership, parseInt32, parseTokens, protectedPolicy, rows, text, validate } from './domain';
import './styles.css';

type Session = { form: ResourceEditorFormProps; locked: boolean; commit: (operations: readonly ResourceEditorPatch[]) => string | null; validity: (key: string, error: string | null) => void };
const SessionContext = createContext<Session | null>(null);
export function usePolicy() { const value = useContext(SessionContext); if (!value) throw new Error('APF field requires policy frame.'); return value; }
export function PolicyFrame({ form, children }: { form: ResourceEditorFormProps; children: ReactNode }) {
  const latest = useRef(form);
  useEffect(() => { latest.current = form; }, [form]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const validity = useCallback((key: string, error: string | null) => setErrors(previous => {
    if (previous[key] === (error || undefined)) return previous;
    const next = { ...previous }; if (error) next[key] = error; else delete next[key]; return next;
  }), []);
  const commit = useCallback((operations: readonly ResourceEditorPatch[]) => {
    const current = latest.current;
    const result = current.patch({ sessionID: current.draft.sessionID, expectedRevision: current.draft.revision, operations });
    const error = result.status === 'accepted' ? null : result.message;
    validity('patch', error); return error;
  }, [validity]);
  const own = ownership(form.draft, form.context);
  const mutationAvailable = form.context.capabilities[form.context.intent === 'create' ? 'create' : 'update'] === 'available';
  const locked = form.disabled || !mutationAvailable || form.context.intent === 'inspect' || protectedPolicy(form.draft, form.context) || (own === 'suggested' && form.draft.get(annotationPath) !== 'false');
  const pendingIssue = Object.values(errors)[0] || null;
  const issue = pendingIssue || validate(form.draft, form.context)[0]?.message || null;
  useEffect(() => { form.onValidityChange(pendingIssue); }, [form.onValidityChange, pendingIssue]);
  return <SessionContext.Provider value={{ form, locked, commit, validity }}><div className="apf-editor">
    {own === 'mandatory' && <div role="note" className="apf-notice">Mandatory bootstrap policy · fixed spec</div>}
    {own === 'administrator' && protectedPolicy(form.draft, form.context) && <div role="note" className="apf-notice">Controller-owned policy · inspect only</div>}
    {own === 'exempt' && <div role="note" className="apf-notice">Mandatory exempt policy · shares and lending only</div>}
    {own === 'suggested' && <EditorSection title="Bootstrap ownership"><div className="apf-notice">Suggested bootstrap policy may be reconciled.</div><Button size="sm" variant="outline" disabled={form.disabled || !mutationAvailable || form.context.intent === 'inspect' || form.draft.get(annotationPath) === 'false'} onClick={() => commit([{ op: 'set', path: annotationPath, value: 'false' }])}>{form.draft.get(annotationPath) === 'false' ? 'Reconciliation opted out' : 'Opt out of spec reconciliation'}</Button></EditorSection>}
    {issue && <div role="alert" className="apf-error">{issue}</div>}
    {children}
  </div></SessionContext.Provider>;
}
export function ValueField({ path, label, help, integer, min, max, required, tokens, core, placeholder }: { path: ResourceEditorPath; label: string; help?: string; integer?: boolean; min?: number; max?: number; required?: boolean; tokens?: boolean; core?: boolean; placeholder?: string }) {
  const { form, locked, commit, validity } = usePolicy();
  const key = JSON.stringify(path);
  const source = form.draft.get(path);
  const canonical = tokens ? rows(source).map(v => core && v === '' ? '""' : text(v)).join(', ') : text(source);
  const identity = JSON.stringify([form.draft.sessionID, canonical]);
  const [edit, setEdit] = useState<{ identity: string; local: string | null; error: string | null }>({ identity, local: null, error: null });
  if (edit.identity !== identity) setEdit({ identity, local: null, error: null });
  const { local, error } = edit.identity === identity ? edit : { local: null, error: null };
  useEffect(() => { validity(key, error); return () => validity(key, null); }, [key, error, validity]);
  return <EditorField label={label} value={local ?? canonical} disabled={locked} help={help} error={error} placeholder={placeholder} inputMode={integer ? 'numeric' : 'text'} onChange={value => {
    const parsed = integer ? parseInt32(value, min, max) : tokens ? parseTokens(value, core) : value;
    let failure = integer && typeof parsed === 'string' ? parsed : tokens && typeof parsed === 'string' ? parsed : null;
    if (!failure && required && (value.trim() === '' || (Array.isArray(parsed) && parsed.length === 0))) failure = 'Enter a value.';
    if (!failure) failure = fieldError(form.draft, path, parsed);
    if (!failure) failure = commit(parsed === null ? (form.draft.has(path) ? [{ op: 'remove', path }] : []) : [{ op: 'set', path, value: parsed }]);
    setEdit({ identity, local: value, error: failure }); validity(key, failure);
  }} />;
}
export function ChoiceField({ path, label, options, help, onSelect }: { path: ResourceEditorPath; label: string; options: readonly { value: string; label: string }[]; help?: string; onSelect?: (value: string) => readonly ResourceEditorPatch[] | string }) {
  const { form, locked, commit, validity } = usePolicy();
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(path);
  useEffect(() => { validity(key, error); return () => validity(key, null); }, [key, error, validity]);
  return <EditorChoice label={label} value={typeof form.draft.get(path) === 'boolean' ? String(form.draft.get(path)) : text(form.draft.get(path))} options={options} disabled={locked} help={help} error={error} onChange={value => {
    const operations = onSelect ? onSelect(value) : [{ op: 'set' as const, path, value }];
    const failure = typeof operations === 'string' ? operations : commit(operations);
    setError(failure); validity(key, failure);
  }} />;
}
export function ToggleField({ path, label }: { path: ResourceEditorPath; label: string }) {
  const { form } = usePolicy();
  return <ChoiceField path={path} label={label} options={[{ value: '', label: 'Omitted (No)' }, { value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }]} onSelect={value => value === '' ? (form.draft.has(path) ? [{ op: 'remove', path }] : []) : [{ op: 'set', path, value: value === 'true' }]} />;
}
export function Collection({ path, title, addLabel, initial, children }: { path: ResourceEditorPath; title: string; addLabel: string; initial: unknown; children: (index: number) => ReactNode }) {
  const { form, locked, commit } = usePolicy();
  const items = rows(form.draft.get(path));
  const [identity, setIdentity] = useState(() => ({ next: items.length, keys: Array.from({ length: items.length }, (_, index) => index) }));
  let keys = identity.keys;
  if (keys.length !== items.length) {
    keys = keys.slice(0, items.length);
    let next = identity.next;
    while (keys.length < items.length) keys.push(next++);
    setIdentity({ next, keys });
  }
  return <EditorSection title={title}>{items.map((_, index) => <div className="apf-card" key={keys[index]}><div className="apf-row-heading"><strong>{title} {index + 1}</strong><Button size="sm" variant="ghost" disabled={locked} aria-label={`Remove ${title.toLowerCase()} ${index + 1}`} onClick={() => {
    if (!commit([{ op: 'remove', path: [...path, index] }])) setIdentity(previous => ({ ...previous, keys: previous.keys.filter((_, position) => position !== index) }));
  }}>Remove</Button></div>{children(index)}</div>)}<Button size="sm" variant="outline" disabled={locked} onClick={() => commit(form.draft.has(path) ? [{ op: 'insert', path, index: items.length, value: initial }] : [{ op: 'set', path, value: [initial] }])}>{addLabel}</Button></EditorSection>;
}
export function PolicyStatus() {
  const { form } = usePolicy();
  const conditions = rows(form.draft.get(['status', 'conditions']));
  return <EditorSection title="Observed conditions">{!conditions.length ? <div className="apf-muted">No observed conditions.</div> : conditions.map((value, i) => {
    const condition = object(value);
    return <dl className="apf-status" key={i}>{['type', 'status', 'reason', 'message', 'lastTransitionTime'].map(key => <div key={key}><dt>{key}</dt><dd>{text(condition[key]) || '—'}</dd></div>)}</dl>;
  })}</EditorSection>;
}
