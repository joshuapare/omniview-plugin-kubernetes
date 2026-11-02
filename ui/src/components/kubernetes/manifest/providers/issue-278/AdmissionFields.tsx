import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { Choice, Remove, Section } from '../../ResourceFormFields';
import { EditorField, EditorHelp, KeyValueFields, ReferencePicker, patchFields } from '../../editor-controls';
import { managed, rows, text, validWebhookURL } from './model';
import './admission.css';

type Session = { form: ResourceEditorFormProps; disabled: boolean; commit: (operations: readonly ResourceEditorPatch[]) => string | null; validity: (key: string, error: string | null) => void; partial: Map<string, { value: string; error: string }>; remember: (key: string, value: string, error: string | null) => void };
const Fields = createContext<Session | null>(null);
export function useAdmission() { const value = useContext(Fields); if (!value) throw new Error('Admission fields require their editor.'); return value; }
export function AdmissionPanel({ form, children }: { form: ResourceEditorFormProps; children: ReactNode }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [partial, setPartial] = useState(() => new Map<string, { value: string; error: string }>());
  const remember = (key: string, value: string, error: string | null) => setPartial(previous => {
    const next = new Map(previous);
    if (error) next.set(key, { value, error }); else next.delete(key);
    return next;
  });
  const validity = useCallback((key: string, error: string | null) => setErrors(old => {
    if ((old[key] ?? null) === error) return old;
    const next = { ...old }; if (error) next[key] = error; else delete next[key]; return next;
  }), []);
  useEffect(() => { form.onValidityChange(Object.values(errors)[0] ?? null); }, [errors, form.onValidityChange]);
  const disabled = form.disabled || form.context.intent === 'inspect' || managed(form.draft) || form.context.ownership?.status === 'controller' || form.context.ownership?.status === 'system';
  const commit = (operations: readonly ResourceEditorPatch[]) => {
    if (disabled) return 'This admission configuration is read-only.';
    const result = patchFields(form, operations);
    if (result.status === 'accepted') for (const operation of operations) {
      if (operation.op !== 'remove') continue;
      const scope = typeof operation.path.at(-1) === 'number' ? operation.path.slice(0, -1) : operation.path;
      const prefix = JSON.stringify(scope).slice(0, -1);
      for (const key of partial.keys()) if (key.startsWith(prefix)) validity(key, null);
      setPartial(previous => new Map([...previous].filter(([key]) => !key.startsWith(prefix))));
    }
    return result.status === 'accepted' ? null : result.message;
  };
  return <Fields.Provider value={{ form, disabled, commit, validity, partial, remember }}><div className="admission-editor">
    {disabled && <p role="status">Inspection only · no admission configuration changes.</p>}
    {children}
  </div></Fields.Provider>;
}
export function Scalar({ path, label, required = false, help, parse, multiline = false, type = 'text', publicURL = false }: { path: ResourceEditorPath; label: string; required?: boolean; help?: string; parse?: (value: string) => unknown; multiline?: boolean; type?: 'text' | 'password'; publicURL?: boolean }) {
  const { form, disabled, commit, validity, partial, remember } = useAdmission();
  const source = form.draft.get(path);
  // Imported unsafe/opaque endpoints remain canonical, but only validated public HTTPS enters the view.
  const current = publicURL ? typeof source === 'string' && validWebhookURL(source) ? source : '' : text(source);
  const key = JSON.stringify(path);
  const [local, setLocal] = useState(partial.get(key)?.value ?? current);
  const [error, setError] = useState<string | null>(partial.get(key)?.error ?? null);
  const id = useId();
  const display = error ? local : current;
  const change = (value: string) => {
    setLocal(value);
    let failure: string | null;
    try {
      if (required && !value.trim()) failure = `${label} is required.`;
      else {
        const parsed = value || required ? parse ? parse(value) : value : undefined;
        failure = commit([
          ...(publicURL && source !== undefined && typeof source !== 'string' ? [{ op: 'remove' as const, path }] : []),
          { op: !value && !required ? 'remove' : 'set', path, ...(value || required ? { value: parsed } : {}) } as ResourceEditorPatch,
        ]);
      }
    } catch (caught) { failure = caught instanceof Error ? caught.message : 'Enter a valid value.'; }
    remember(key, value, failure); setError(failure); validity(key, failure);
  };
  if (!multiline) return <EditorField label={label} value={display} onChange={change} disabled={disabled} help={help} error={error} type={type} placeholder={publicURL && !current && form.draft.has(path) ? 'Stored endpoint unchanged; enter replacement' : undefined} />;
  return <div className="admission-field"><div className="admission-label"><label htmlFor={id}>{label}</label>{help && <EditorHelp label={label}>{help}</EditorHelp>}</div><textarea id={id} value={display} onChange={event => change(event.target.value)} disabled={disabled} rows={3} spellCheck={false} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />{error && <span role="alert" id={`${id}-error`}>{error}</span>}</div>;
}
export function boundedInteger(min: number, max: number) { return (value: string) => {
  if (!/^\d+$/.test(value) || BigInt(value) < BigInt(min) || BigInt(value) > BigInt(max)) throw new Error(`Enter a whole number from ${min} to ${max}.`);
  return Number(value);
}; }
export function Pick({ path, label, options, help, required = false }: { path: ResourceEditorPath; label: string; options: readonly string[]; help?: string; required?: boolean }) {
  const { form, disabled, commit, validity } = useAdmission();
  return <Choice label={label} value={text(form.draft.get(path))} options={[{ value: '', label: required ? 'Choose…' : 'API default (omitted)' }, ...options.map(value => ({ value, label: value }))]} help={help} disabled={disabled} onChange={value => validity(JSON.stringify(path), commit([value ? { op: 'set', path, value } : { op: 'remove', path }]))} />;
}
export function List({ path, label, help, required = false, allowed, coreGroup = false }: { path: ResourceEditorPath; label: string; help?: string; required?: boolean; allowed?: readonly string[]; coreGroup?: boolean }) {
  const { form, disabled, commit, validity, partial, remember } = useAdmission();
  const values = rows(form.draft.get(path));
  const current = values.map(value => value === '' && coreGroup ? 'core' : text(value)).join(', ');
  const key = JSON.stringify(path);
  const [local, setLocal] = useState(partial.get(key)?.value ?? current);
  const [error, setError] = useState<string | null>(partial.get(key)?.error ?? null);
  return <EditorField label={label} value={error ? local : current} disabled={disabled} error={error} help={help ?? 'Comma-separated entries; order is preserved.'} onChange={value => {
    setLocal(value);
    const parts = value.split(',').map(part => part.trim());
    const parsed = parts.map(part => coreGroup && part === 'core' ? '' : part);
    let failure = (required || value) && parts.some(part => !part) ? 'Complete each comma-separated entry.' : null;
    if (!failure && allowed && parsed.some(part => !allowed.includes(part))) failure = `Choose from ${allowed.join(', ')}.`;
    if (!failure) failure = commit([{ op: 'set', path, value: value ? parsed : [] }]);
    remember(key, value, failure); setError(failure); validity(key, failure);
  }} />;
}
export function Repeat({ path, label, initial, children, max }: { path: ResourceEditorPath; label: string; initial: unknown; children: (path: ResourceEditorPath, index: number) => ReactNode; max?: number }) {
  const { form, disabled, commit, validity } = useAdmission();
  const values = rows(form.draft.get(path));
  return <Section title={label} action={<Button size="sm" variant="ghost" disabled={disabled || (max !== undefined && values.length >= max)} onClick={() => validity(JSON.stringify(path), commit(form.draft.has(path) ? [{ op: 'insert', path, index: values.length, value: initial }] : [{ op: 'set', path, value: [initial] }]))}>Add</Button>}>
    {values.length === 0 && <span className="admission-empty">No {label.toLowerCase()} configured</span>}
    {values.map((_, index) => <div className="admission-row" key={`${form.draft.sessionID}:${values.length}:${index}`}><div className="admission-row-heading"><strong>{label} {index + 1}</strong><Remove label={`Remove ${label.toLowerCase()} ${index + 1}`} disabled={disabled} onClick={() => validity(JSON.stringify(path), commit([{ op: 'remove', path: [...path, index] }]))} /></div>{children([...path, index], index)}</div>)}
  </Section>;
}
export function Advanced({ label = 'Advanced', children }: { label?: string; children: ReactNode }) { return <details className="admission-advanced"><summary>{label}</summary>{children}</details>; }
export function Selector({ path, label }: { path: ResourceEditorPath; label: string }) {
  const { form, disabled, validity } = useAdmission();
  const key = JSON.stringify(path);
  return <Section title={label}>
    <KeyValueFields form={{ ...form, disabled, onValidityChange: error => validity(`${key}:labels`, error) }} path={[...path, 'matchLabels']} label={`${label} labels`} />
    <Repeat path={[...path, 'matchExpressions']} label={`${label} expressions`} initial={{ key: '', operator: 'In', values: [] }}>{p => <><Scalar path={[...p, 'key']} label="Label key" required /><SelectorOperator path={p} /><SelectorValues path={p} /></>}</Repeat>
  </Section>;
}
function SelectorOperator({ path }: { path: ResourceEditorPath }) {
  const { form, disabled, commit, validity } = useAdmission();
  return <Choice label="Operator" value={text(form.draft.get([...path, 'operator']))} options={['In', 'NotIn', 'Exists', 'DoesNotExist'].map(value => ({ value, label: value }))} disabled={disabled} onChange={value => validity(JSON.stringify(path), commit([
    { op: 'set', path: [...path, 'operator'], value },
    ...(value === 'Exists' || value === 'DoesNotExist' ? [{ op: 'remove' as const, path: [...path, 'values'] }] : !form.draft.has([...path, 'values']) ? [{ op: 'set' as const, path: [...path, 'values'], value: [] }] : []),
  ]))} />;
}
function SelectorValues({ path }: { path: ResourceEditorPath }) {
  const { form } = useAdmission();
  const operator = text(form.draft.get([...path, 'operator']));
  return operator === 'In' || operator === 'NotIn' ? <List path={[...path, 'values']} label="Label values" required /> : null;
}
export function Matching({ path, webhook = false, mutation = false }: { path: ResourceEditorPath; webhook?: boolean; mutation?: boolean }) {
  return <>
    <Pick path={[...path, 'matchPolicy']} label="Version matching" options={['Equivalent', 'Exact']} help="Equivalent includes equivalent resource versions. Exclusions win over includes. Wildcard * does not include subresources." />
    <Rules path={[...path, webhook ? 'rules' : 'resourceRules']} mutation={mutation} named={!webhook} label="Matching rules" />
    {!webhook && <Advanced label="Exclude rules"><Rules path={[...path, 'excludeResourceRules']} mutation={mutation} named label="Excluded rules" /></Advanced>}
    <Advanced label="Namespace and object selectors"><Selector path={[...path, 'namespaceSelector']} label="Namespace selector" /><Selector path={[...path, 'objectSelector']} label="Object selector" /></Advanced>
  </>;
}
function Rules({ path, label, mutation, named }: { path: ResourceEditorPath; label: string; mutation: boolean; named: boolean }) {
  return <Repeat path={path} label={label} initial={{ operations: [], apiGroups: [], apiVersions: [], resources: [] }}>{p => <><List path={[...p, 'operations']} label="Operations" allowed={mutation ? ['*', 'CREATE', 'UPDATE', 'CONNECT'] : ['*', 'CREATE', 'UPDATE', 'DELETE', 'CONNECT']} required /><div className="admission-grid"><List path={[...p, 'apiGroups']} label="API groups" coreGroup required help="Comma-separated API groups. Use core for the empty core group; * must stand alone." /><List path={[...p, 'apiVersions']} label="API versions" required /><List path={[...p, 'resources']} label="Resources / subresources" required /><Pick path={[...p, 'scope']} label="Resource scope" options={['*', 'Cluster', 'Namespaced']} /></div>{named && <List path={[...p, 'resourceNames']} label="Resource names (optional)" />}</>}</Repeat>;
}
export function Conditions({ path }: { path: ResourceEditorPath }) { return <Repeat path={path} label="Match conditions" initial={{ name: '', expression: '' }} max={64}>{p => <><Scalar path={[...p, 'name']} label="Condition name" required /><Scalar path={[...p, 'expression']} label="Condition CEL" multiline required help="Evaluates to boolean before policy variables exist. False skips admission; errors follow failure behavior. CEL validation happens on the API server." /></>}</Repeat>; }
export function Reference({ path, label, resource, version, namespace, group = 'admissionregistration.k8s.io' }: { path: ResourceEditorPath; label: string; resource: string; version: string; namespace?: string; group?: string }) {
  const { form, disabled, commit, validity, partial, remember } = useAdmission();
  const key = JSON.stringify(path);
  const current = text(form.draft.get(path));
  const [local, setLocal] = useState(partial.get(key)?.value ?? current);
  const [error, setError] = useState<string | null>(partial.get(key)?.error ?? null);
  const change = (value: string) => {
    setLocal(value);
    const failure = value.trim() ? commit([{ op: 'set', path, value }]) : `${label} is required.`;
    setError(failure); remember(key, value, failure); validity(key, failure);
  };
  if (group === '' && !namespace) return <EditorField label={label} value={error ? local : current} onChange={change} error={error} disabled={disabled} help="Enter the Service namespace before lookup." />;
  return <ReferencePicker form={form} query={{ group, version, resource, namespace, projection: 'metadata' }} label={label} value={error ? local : current} error={error} disabled={disabled} help="Manual unresolved names remain valid. Lookup does not prove service health or policy validity." onChange={change} />;
}
