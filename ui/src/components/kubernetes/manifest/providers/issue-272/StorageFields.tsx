import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { useCallback, useEffect, useState } from 'react';
import { EditorChoice, EditorField, EditorHelp, ReferencePicker, patchError, patchFields, scalarText } from '../../editor-controls';
import { authoringDisabled, identifierError, parameterError, record, validateStorage } from './rules';
import './storage.css';

export function useStorageForm(form: ResourceEditorFormProps) {
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const buffer = useCallback((key: string, value: string) => setBuffers(previous => ({ ...previous, [key]: value })), []);
  const report = useCallback((key: string, error: string | null) => setErrors(previous => previous[key] === error ? previous : { ...previous, [key]: error }), []);
  useEffect(() => { setErrors({}); setBuffers({}); }, [form.draft.sessionID]);
  const canonicalError = validateStorage(form.draft, form.context)[0]?.message;
  const localError = Object.values(errors).find(Boolean);
  useEffect(() => { form.onValidityChange(localError || canonicalError || null); }, [localError, canonicalError, form.onValidityChange]);
  const locked = form.disabled || authoringDisabled(form.draft, form.context);
  const commit = (operations: readonly ResourceEditorPatch[]) => {
    const failure = patchError(patchFields({ ...form, disabled: locked }, operations));
    if (!failure) for (const operation of operations) if (operation.op === 'remove') {
      setBuffers(previous => rebaseRemoved(previous, operation.path));
      setErrors(previous => rebaseRemoved(previous, operation.path));
    }
    return failure;
  };
  return { locked, report, commit, buffers, buffer, errors };
}
export interface StorageState {
  locked: boolean;
  report(key: string, error: string | null): void;
  commit(operations: readonly ResourceEditorPatch[]): string | null;
  buffers: Readonly<Record<string, string>>;
  buffer(key: string, value: string): void;
  errors: Readonly<Record<string, string | null>>;
}

/** Keeps partial sibling values attached to the same row after an atomic removal. */
function rebaseRemoved<T>(values: Record<string, T>, removed: ResourceEditorPath): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith('[')) { result[key] = value; continue; }
    const path: (string | number)[] = JSON.parse(key);
    const parent = removed.slice(0, -1);
    const index = removed[removed.length - 1];
    if (parent.every((part, position) => path[position] === part)) {
      const position = parent.length;
      if (path[position] === index) continue;
      if (typeof index === 'number' && typeof path[position] === 'number' && path[position] > index) path[position]--;
    }
    result[JSON.stringify(path)] = value;
  }
  return result;
}
export function storageBuffer(state: StorageState, key: string, initial = ''): [string, (text: string) => void] {
  return [state.buffers[key] ?? initial, text => state.buffer(key, text)];
}

export function TextValue({ form, state, path, label, required, disabled, help, parse, password = false, allowEmpty = false }: {
  form: ResourceEditorFormProps; state: StorageState; path: ResourceEditorPath; label: string;
  required?: boolean; disabled?: boolean; help?: string; password?: boolean; allowEmpty?: boolean;
  parse?: (text: string) => { value: string | bigint } | { error: string };
}) {
  const canonical = scalarText(form.draft.get(path));
  const key = JSON.stringify(path);
  const text = state.buffers[key] ?? canonical;
  useEffect(() => { if (!state.errors[key]) state.buffer(key, canonical); }, [canonical]);
  return <EditorField label={label} value={text} type={password ? 'password' : 'text'}
    placeholder={password && form.draft.has(path) && !canonical ? 'Stored value hidden' : undefined}
    help={help} disabled={state.locked || disabled} error={state.errors[key]} onChange={next => {
      state.buffer(key, next);
      const parsed = parse?.(next);
      const failure = required && !next.trim() ? 'Enter a value.' : parsed && 'error' in parsed ? parsed.error : state.commit([
        !next && !required && !allowEmpty && !password ? { op: 'remove', path } : { op: 'set', path, value: parsed && 'value' in parsed ? parsed.value : next },
      ]);
      state.report(key, failure);
    }} />;
}

export function DriverField({ form, state, path, label, disabled }: { form: ResourceEditorFormProps; state: StorageState; path: ResourceEditorPath; label: string; disabled?: boolean }) {
  const key = JSON.stringify(path);
  const canonical = scalarText(form.draft.get(path));
  const text = state.buffers[key] ?? canonical;
  useEffect(() => { if (!state.errors[key]) state.buffer(key, canonical); }, [canonical]);
  return <ReferencePicker form={form} query={{ group: 'storage.k8s.io', version: 'v1', resource: 'csidrivers', projection: 'metadata' }} label={label} value={text} error={state.errors[key]}
    disabled={state.locked || disabled} help="Choose a discovered CSI driver or enter an exact manual or legacy identifier. An unresolved identifier does not require a CSIDriver object. Lookup is not proof of driver readiness."
    onChange={value => { state.buffer(key, value); const failure = !value ? 'Enter an exact driver identifier.' : identifierError(value, true) || state.commit([{ op: 'set', path, value }]); state.report(key, failure); }} />;
}
export function ChoiceValue({ form, state, path, label, options, help, disabled }: {
  form: ResourceEditorFormProps; state: StorageState; path: ResourceEditorPath; label: string;
  options: readonly { value: string; label: string }[]; help?: string; disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const current = scalarText(form.draft.get(path));
  const allOptions = current && !options.some(option => option.value === current) ? [...options, { value: current, label: `Unsupported value: ${current}` }] : options;
  return <EditorChoice label={label} value={current} options={allOptions} help={help} disabled={state.locked || disabled} error={error} onChange={value => {
    const failure = state.commit([value === '' ? { op: 'remove', path } : { op: 'set', path, value: options === booleanOptions ? value === 'true' : value }]);
    setError(failure); state.report(JSON.stringify(path), failure);
  }} />;
}
export const omitted = { value: '', label: 'Not specified' };
export const booleanOptions = [omitted, { value: 'true', label: 'Enabled' }, { value: 'false', label: 'Disabled' }];
export function Parameters({ form, state, required = false, disabled = false }: { form: ResourceEditorFormProps; state: StorageState; required?: boolean; disabled?: boolean }) {
  const parameters = form.draft.get(['parameters']);
  const entries = record(parameters) ? Object.keys(parameters) : [];
  const [key, setKey] = storageBuffer(state, 'new-parameter-key');
  const [value, setValue] = storageBuffer(state, 'new-parameter-value');
  const [error, setError] = useState<string | null>(null);
  const locked = state.locked || disabled;
  const pending = (nextKey: string, nextValue: string) => state.report('new-parameter', nextKey || nextValue ? 'Add or discard the pending parameter.' : null);
  return <div className="storage-list"><div className="storage-heading"><strong>{required ? 'Driver attributes' : 'Provisioner parameters'}</strong><EditorHelp label="Parameters">Values remain masked. Existing opaque values are never copied into patches. Keys are exact driver-specific strings; no credentials are fetched.</EditorHelp></div>
    {entries.map(name => <div className="storage-row" key={name}><span className="storage-key">{name}</span><TextValue key={`${form.draft.sessionID}:${name}`} form={form} state={state} path={['parameters', name]} label={`Value for ${name}`} password disabled={locked} /><Button size="sm" variant="ghost" disabled={locked} aria-label={`Remove parameter ${name}`} onClick={() => { const failure = state.commit([{ op: 'remove', path: ['parameters', name] }]); setError(failure); state.report('parameters', failure); }}>Remove</Button></div>)}
    {!locked && <><div className="storage-row"><EditorField label="Parameter key" value={key} onChange={next => { setKey(next); pending(next, value); }} /><EditorField label="Parameter value" type="password" value={value} onChange={next => { setValue(next); pending(key, next); }} /><Button size="sm" onClick={() => {
      let failure: string | null = !key ? 'Enter a parameter key.' : form.draft.has(['parameters', key]) ? 'That parameter already exists.' : null;
      if (!failure) failure = parameterError({ ...(record(parameters) ? parameters : {}), [key]: value }, required);
      if (!failure) failure = state.commit([{ op: 'set', path: ['parameters', key], value }]);
      setError(failure);
      if (!failure) { setKey(''); setValue(''); state.report('new-parameter', null); }
    }}>Add parameter</Button></div><Button size="sm" variant="ghost" disabled={!key && !value} onClick={() => { setKey(''); setValue(''); setError(null); state.report('new-parameter', null); }}>Discard pending parameter</Button></>}
    {(error || parameterError(parameters, required)) && <span role="alert">{error || parameterError(parameters, required)}</span>}
  </div>;
}
export function Availability({ form }: { form: ResourceEditorFormProps }) {
  return <dl className="storage-facts"><dt>API discovery</dt><dd>{form.context.discovery.status}</dd><dt>Schema</dt><dd>{form.context.schema.status}</dd><dt>Read</dt><dd>{form.context.capabilities.get}</dd><dt>Create</dt><dd>{form.context.capabilities.create}</dd><dt>Update</dt><dd>{form.context.capabilities.update}</dd></dl>;
}
