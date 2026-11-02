import { useState, type ReactNode } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps as Form, ResourceEditorPath as Path } from '@omniviewdev/runtime';
import { EditorChoice, EditorSection, ExactValueField, KeyValueFields, patchError, setDraftField, useFieldValidity } from '../../editor-controls';

type Field = { form: Form; path: Path; label: string; help?: string; required?: boolean; choices?: string[] };
function Text({ form, path, label, help, required, choices }: Field) {
  const validity = useFieldValidity(form);
  const value = form.draft.get(path);
  const scalar = typeof value === 'string' || typeof value === 'boolean';
  if (value !== undefined && !scalar) return <span>{label}: source-only shape</span>;
  if (choices) return <EditorChoice label={label} help={help} value={value === undefined ? '' : String(value)} disabled={form.disabled} options={choices.map(value => ({ value, label: value }))} onChange={next => validity(label, patchError(setDraftField(form, path, next === 'true' ? true : next === 'false' ? false : next)))} />;
  return <ExactValueField label={label} help={help} value={typeof value === 'string' ? value : ''} identity={`${form.draft.sessionID}:${JSON.stringify(path)}`} disabled={form.disabled} parse={text => required && !text.trim() ? { valid: false, error: 'Required.' } : { valid: true, value: text }} onCommit={next => patchError(setDraftField(form, path, next))} onValidityChange={error => validity(label, error)} />;
}
function Rows({ form, path, label, initial, children }: { form: Form; path: Path; label: string; initial: unknown; children(this: void, path: Path, index: number): ReactNode }) {
  const value = form.draft.get(path);
  const [error, setError] = useState<string | null>(null);
  const validity = useFieldValidity(form);
  function apply(operations: Parameters<Form['patch']>[0]['operations']) { const failure = patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations })); setError(failure); validity(label, failure); }
  if (value !== undefined && !Array.isArray(value)) return <span>{label}: source-only shape</span>;
  return <EditorSection title={label}>{(Array.isArray(value) ? value : []).map((_, i) => <div key={i} style={{ borderBottom: '1px solid var(--ov-color-border-default)', paddingBottom: 12 }}>{children([...path, i], i)}<Button size="sm" variant="ghost" disabled={form.disabled} onClick={() => apply([{ op: 'remove', path: [...path, i] }])}>Remove {label} {i + 1}</Button></div>)}<Button size="sm" disabled={form.disabled} onClick={() => apply(value === undefined ? [{ op: 'set', path, value: [initial] }] : [{ op: 'insert', path, index: Array.isArray(value) ? value.length : 0, value: initial }])}>Add {label}</Button>{error && <span role="alert">{error}</span>}</EditorSection>;
}
function Match({ form, path }: { form: Form; path: Path }) {
  return <><Rows form={form} path={[...path, 'any']} label="Any resource match" initial={{ resources: { kinds: [] } }}>{row => <><Rows form={form} path={[...row, 'resources', 'kinds']} label="Kinds" initial="">{p => <Text form={form} path={p} label="Kind or group/version/kind" required />}</Rows><Rows form={form} path={[...row, 'resources', 'names']} label="Names" initial="">{p => <Text form={form} path={p} label="Resource name pattern" required />}</Rows><Rows form={form} path={[...row, 'resources', 'namespaces']} label="Namespaces" initial="">{p => <Text form={form} path={p} label="Namespace pattern" required />}</Rows></>}</Rows></>;
}
function Operation({ form, path }: { form: Form; path: Path }) {
  const validity = useFieldValidity(form);
  const operation = ['validate', 'mutate', 'generate', 'verifyImages'].find(key => form.draft.has([...path, key]));
  return <><EditorChoice label="Rule operation" value={operation ?? ''} disabled={form.disabled || !!operation} help="Existing operation stays intact. Remove the rule explicitly to replace its operation; advanced rule fields remain in source." options={['validate', 'mutate', 'generate'].map(value => ({ value, label: value }))} onChange={value => validity('operation', patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [{ op: 'set', path: [...path, value], value: {} }] })))} />
    {operation === 'validate' && <><Text form={form} path={[...path, 'validate', 'failureAction']} label="Violation action" choices={['Audit', 'Enforce']} help="Enforce can reject matching admission requests." /><Text form={form} path={[...path, 'validate', 'message']} label="Violation message" /><KeyValueFields form={form} path={[...path, 'validate', 'pattern', 'metadata', 'labels']} label="Required label pattern" /></>}
    {operation === 'mutate' && <KeyValueFields form={form} path={[...path, 'mutate', 'patchStrategicMerge', 'metadata', 'labels']} label="Admission label" />}
    {operation === 'generate' && <><p role="note">Generation creates downstream resources. Synchronization can overwrite downstream changes.</p>{['apiVersion', 'kind', 'name', 'namespace'].map(key => <Text key={key} form={form} path={[...path, 'generate', key]} label={`Generated ${key}`} required={key !== 'namespace'} />)}<Text form={form} path={[...path, 'generate', 'synchronize']} label="Synchronize" choices={['true', 'false']} /><KeyValueFields form={form} path={[...path, 'generate', 'data', 'data']} label="Generated string data" /></>}
    {operation === 'verifyImages' && <p>Image verification remains in source; other rule fields stay editable.</p>}</>;
}
export function PolicyForm(form: Form) {
  return <><Text form={form} path={['spec', 'background']} label="Background evaluation" choices={['true', 'false']} /><Rows form={form} path={['spec', 'rules']} label="Rules" initial={{ name: '', match: { any: [] } }}>{path => <><Text form={form} path={[...path, 'name']} label="Rule name" required /><Match form={form} path={[...path, 'match']} /><Operation form={form} path={path} /><details><summary>Exclude resources</summary><Match form={form} path={[...path, 'exclude']} /></details></>}</Rows></>;
}
export function CleanupForm(form: Form) {
  return <><p role="note">Scheduled cleanup permanently deletes matched resources{form.context.scope === 'Cluster' ? ' across the cluster' : ' in this namespace'}. No run-now or undo.</p><Text form={form} path={['spec', 'schedule']} label="Cron schedule" required help="Five cron fields. Controller admission validates the schedule; no execution preview is inferred." /><Text form={form} path={['spec', 'deletionPropagationPolicy']} label="Dependent resource deletion" choices={['Foreground', 'Background', 'Orphan']} /><Match form={form} path={['spec', 'match']} /><details><summary>Exclude resources</summary><Match form={form} path={['spec', 'exclude']} /></details></>;
}
export function ExceptionForm(form: Form) {
  return <><p role="note">Matching resources bypass selected policy rules. No automatic expiry.</p><Rows form={form} path={['spec', 'exceptions']} label="Exceptions" initial={{ policyName: '', ruleNames: [] }}>{path => <><Text form={form} path={[...path, 'policyName']} label="Policy name or namespace/name" required /><Rows form={form} path={[...path, 'ruleNames']} label="Rule names" initial="">{p => <Text form={form} path={p} label="Rule name" required />}</Rows></>}</Rows><Match form={form} path={['spec', 'match']} /><details><summary>Background matching</summary><Text form={form} path={['spec', 'background']} label="Background" choices={['true', 'false']} /></details></>;
}
export function ContextForm(form: Form) {
  const validity = useFieldValidity(form);
  const source = form.draft.has(['spec', 'apiCall']) ? 'apiCall' : form.draft.has(['spec', 'kubernetesResource']) ? 'kubernetesResource' : '';
  return <><EditorChoice label="Context source" value={source} disabled={form.disabled || !!source} help="Existing source is never replaced or copied. Use source mode for an explicit source migration." options={[{ value: 'kubernetesResource', label: 'Kubernetes resource cache' }, { value: 'apiCall', label: 'API call' }]} onChange={key => validity('source', patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [{ op: 'set', path: ['spec', key], value: {} }] })))} />{source === 'kubernetesResource' && <><p role="note">Empty namespace caches all namespaces for namespaced resources.</p>{['group', 'version', 'resource', 'namespace'].map(key => <Text key={key} form={form} path={['spec', source, key]} label={key === 'resource' ? 'Exact resource plural' : key} required={key === 'version' || key === 'resource'} />)}</>}{source === 'apiCall' && <><Text form={form} path={['spec', source, 'urlPath']} label="API URL path" /><Text form={form} path={['spec', source, 'method']} label="Method" choices={['GET', 'POST']} /><Text form={form} path={['spec', source, 'refreshInterval']} label="Refresh interval" help="Duration string, for example seconds or minutes. No test request is executed." />{form.draft.get(['spec', source, 'method']) === 'POST' && <p role="note">Repeated POST calls can cause side effects.</p>}</>}</>;
}
export function UpdateRequestForm(form: Form) {
  const fields: [string, Path][] = [['Policy', ['spec', 'policy']], ['Rule', ['spec', 'rule']], ['Request type', ['spec', 'requestType']], ['State', ['status', 'state']], ['Retries', ['status', 'retryCount']]];
  const generated = form.draft.get(['status', 'generatedResources']);
  if (Array.isArray(generated)) generated.forEach((_, index) => {
    for (const key of ['apiVersion', 'kind', 'namespace', 'name']) fields.push([`Generated ${index + 1} ${key}`, ['status', 'generatedResources', index, key]]);
  });
  return <EditorSection title="Controller work"><p role="note">Controller-owned request. No create, retry, replay, status edit or deletion.</p><dl>{fields.map(([label, path]) => { const value = form.draft.get(path); return <div key={label}><dt>{label}</dt><dd>{typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value) : 'Unavailable'}</dd></div>; })}{['apiVersion', 'kind', 'namespace', 'name'].map(key => { const value = form.draft.get(['spec', 'resource', key]); return <div key={key}><dt>Trigger {key}</dt><dd>{typeof value === 'string' ? value : 'Unavailable'}</dd></div>; })}</dl></EditorSection>;
}
