import { Button } from '@omniviewdev/base-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorField, EditorHelp, patchFields, patchError } from '../../editor-controls';
import { list, text, systemOwned } from './model';
import './rbac.css';


export interface RbacForm {
  form: ResourceEditorFormProps;
  commit: (operations: readonly ResourceEditorPatch[]) => string | null;
  report: (field: string, error: string | null) => void;
  errors: Record<string, string>;
}
export function useRbacForm(props: ResourceEditorFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [session, setSession] = useState(props.draft.sessionID);
  if (session !== props.draft.sessionID) { setSession(props.draft.sessionID); setErrors({}); }
  const report = useCallback((field: string, error: string | null) => setErrors(previous => {
    if ((previous[field] ?? null) === error) return previous;
    const next = { ...previous };
    if (error) next[field] = error; else delete next[field];
    return next;
  }), []);
  useEffect(() => { props.onValidityChange(Object.values(errors)[0] ?? null); }, [errors, props.onValidityChange]);
  const writeAvailability = props.context.intent === 'create' ? props.context.capabilities.create : props.context.capabilities.update;
  const locked = props.disabled || writeAvailability !== 'available' || props.context.intent === 'inspect' || props.context.ownership?.status === 'controller' || props.context.ownership?.status === 'system' || systemOwned(props.draft);
  const form = { ...props, disabled: locked };
  function commit(operations: readonly ResourceEditorPatch[]) {
    if (locked) return 'Resource is read-only.';
    const failure = patchError(patchFields(form, operations));
    report('patch', failure);
    return failure;
  }
  return { form, commit, report, errors };
}

export function DraftText({ editor, path, label, help, allowEmpty = false, placeholder, validateText }: {
  editor: RbacForm; path: ResourceEditorPath; label: string; help?: string; allowEmpty?: boolean; placeholder?: string; validateText?: (value: string) => string | null;
}) {
  const canonical = text(editor.form.draft.get(path));
  const field = JSON.stringify(path);
  const identity = JSON.stringify([editor.form.draft.sessionID, path, canonical]);
  const [edit, setEdit] = useState<{ identity: string; value: string; error: string | null }>({ identity, value: canonical, error: null });
  if (edit.identity !== identity) setEdit({ identity, value: canonical, error: null });
  const { value, error } = edit.identity === identity ? edit : { value: canonical, error: null };
  const reporter = useRef(editor.report);
  useEffect(() => { reporter.current = editor.report; }, [editor.report]);
  useEffect(() => { reporter.current(field, error); return () => reporter.current(field, null); }, [field, error]);
  return <EditorField label={label} value={value} help={help} placeholder={placeholder} disabled={editor.form.disabled} error={error} onChange={next => {
    const failure = (!allowEmpty && !next.trim() ? 'Enter a value.' : validateText?.(next) ?? null) || editor.commit([{ op: 'set', path, value: next }]);
    setEdit({ identity, value: next, error: failure }); editor.report(field, failure);
  }} />;
}

export function StringRows({ editor, path, label, help, allowEmpty = false, validateText }: {
  editor: RbacForm; path: ResourceEditorPath; label: string; help?: string; allowEmpty?: boolean; validateText?: (value: string) => string | null;
}) {
  const values = list(editor.form.draft.get(path));
  return <div className="rbac-list"><div className="rbac-heading"><span>{label}</span>{help && <EditorHelp label={label}>{help}</EditorHelp>}</div>
    {values.map((_, index) => <div className="rbac-token" key={index}><DraftText editor={editor} path={[...path, index]} label={`${label} ${index + 1}`} allowEmpty={allowEmpty} validateText={validateText} placeholder={allowEmpty && label.includes('API group') ? 'Core API group (empty)' : undefined} /><Button size="sm" variant="ghost" disabled={editor.form.disabled} aria-label={`Remove ${label} ${index + 1}`} onClick={() => editor.commit([{ op: 'remove', path: [...path, index] }])}>Remove</Button></div>)}
    <Button size="sm" disabled={editor.form.disabled} onClick={() => editor.commit(editor.form.draft.has(path) && Array.isArray(editor.form.draft.get(path)) ? [{ op: 'insert', path, index: values.length, value: '' }] : [{ op: 'set', path, value: [''] }])}>Add {label}</Button>
  </div>;
}

export function OwnershipNotice({ editor }: { editor: RbacForm }) {
  return <>{editor.form.disabled && <div className="rbac-notice" role="status">Read-only · {systemOwned(editor.form.draft) || editor.form.context.ownership?.status === 'system' ? 'system-managed RBAC' : editor.form.context.ownership?.status === 'controller' ? 'controller-owned RBAC' : 'inspection or unavailable write capability'}</div>}
    {Object.values(editor.errors)[0] && <div role="alert" className="rbac-error">{Object.values(editor.errors)[0]}</div>}</>;
}
