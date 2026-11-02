import { useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorField, EditorChoice, EditorSection, ExactValueField, ReferencePicker, scalarText, useFieldValidity } from '../../editor-controls';
import { common, fields, lists, isReadOnly, type Field } from './domain';

function SourceField({ form, field, path = field.path.split('.'), report }: { form: ResourceEditorFormProps; field: Field; path?: ResourceEditorPath; report: (field: string, error: string | null) => void }) {
 const current = form.draft.get(path);
 const text = typeof current === 'string' || typeof current === 'boolean' ? String(current) : '';
 const commit = (next: string | number | bigint) => {
  const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [next === '' ? { op: 'remove', path } : { op: 'set', path, value: field.options?.includes('true') ? next === 'true' : next }] });
  return result.status === 'accepted' ? null : result.message;
 };
 const props = { label: field.label, value: text, help: field.help, disabled: form.disabled };
 if (field.reference) return <ReferencePicker {...props} form={form} query={{ group: '', version: 'v1', resource: field.reference, namespace: form.context.namespace, projection: 'metadata' }} onChange={next => report(path.join('.'), commit(next))} />;
 if (field.options) return <EditorChoice {...props} options={field.options.map(option => ({ value: option, label: option || 'Not specified' }))} onChange={next => report(path.join('.'), commit(next))} />;
 return <ExactValueField {...props} identity={`${form.draft.sessionID}:${path.join('.')}`} parse={next => !next || !['spec.interval', 'spec.timeout'].includes(field.path) || (field.path === 'spec.timeout' ? /^([0-9]+(\.[0-9]+)?(ms|s|m))+$/ : /^([0-9]+(\.[0-9]+)?(ms|s|m|h))+$/).test(next) ? { valid: true, value: next } : { valid: false, error: 'Enter a duration such as 5m.' }} onCommit={commit} onValidityChange={error => report(path.join('.'), error)} />;
}
function ReferenceChoice({ form, report }: { form: ResourceEditorFormProps; report: (field: string, error: string | null) => void }) {
 const keys = form.context.kind === 'GitRepository' ? ['branch', 'tag', 'semver', 'name', 'commit'] : ['tag', 'semver', 'digest'];
 const existing = keys.filter(key => form.draft.has(['spec', 'ref', key]));
 const [selected, setSelected] = useState(existing[0] ?? keys[0]);
 return <EditorSection title="Revision selection">
  <EditorChoice label="Reference type" value={selected} options={keys.map(key => ({ value: key, label: key }))} disabled={form.disabled} help="Changing type removes other selectors. Existing combined selectors remain intact until explicitly changed." onChange={next => {
   const operations: ResourceEditorPatch[] = existing.filter(key => key !== next).map(key => ({ op: 'remove', path: ['spec', 'ref', key] }));
   if (!operations.length) { setSelected(next); return; }
   const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
   report('reference-choice', result.status === 'accepted' ? null : result.message);
   if (result.status === 'accepted') setSelected(next);
  }} />
  <SourceField form={form} report={report} field={{ label: `${selected} reference`, path: `spec.ref.${selected}` }} />
  {existing.length > 1 && <div role="status">Multiple existing selectors use controller precedence. Changing type removes other selectors.</div>}
 </EditorSection>;
}
function SourceEditor(form: ResourceEditorFormProps) {
 const [error, setError] = useState<string | null>(null);
 const readonly = isReadOnly(form.draft, form.context);
 const report = useFieldValidity(form);
 const owners = form.draft.get(['metadata', 'ownerReferences']);
 const patch = (operations: ResourceEditorPatch[]) => {
  const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
  setError(result.status === 'accepted' ? null : result.message);
  report('rows', result.status === 'accepted' ? null : result.message);
 };
 if (readonly) return <EditorSection title={form.context.kind === 'ExternalArtifact' ? 'External producer artifact' : 'Controller-owned chart'}>
  <div role="status">{form.context.kind === 'ExternalArtifact' ? 'Produced externally. Source and status are read-only.' : 'Edit the owning HelmRelease, not its generated HelmChart.'}</div>
  {['apiVersion', 'kind', 'name', 'namespace'].map(key => <EditorField key={key} label={`Producer ${key}`} value={scalarText(form.draft.get(['spec', 'sourceRef', key]))} readOnly onChange={() => {}} />)}
  {['revision', 'digest', 'lastUpdateTime'].map(key => <EditorField key={key} label={`Observed ${key}`} value={scalarText(form.draft.get(['status', 'artifact', key]))} readOnly onChange={() => {}} />)}
  {Array.isArray(owners) && Array.from({length: owners.length}, (_, index) => <div key={index}>{scalarText(form.draft.get(['metadata','ownerReferences',index,'kind']))}: {scalarText(form.draft.get(['metadata','ownerReferences',index,'name']))}</div>)}
 </EditorSection>;
 const kindFields = fields[form.context.kind] ?? [];
 return <div style={{ display: 'grid', gap: 16 }}>
  <EditorSection title={`${form.context.kind} source`}>
   {(form.context.kind === 'GitRepository' || form.context.kind === 'OCIRepository') && <ReferenceChoice key={form.draft.sessionID} form={form} report={report} />}
   {kindFields.filter(field => (!field.path.startsWith('spec.ref.') || field.path === 'spec.ref.semverFilter') && (!field.when || field.when(form.draft))).map(field => <SourceField key={field.path} form={form} field={field} report={report} />)}
   {form.context.kind === 'HelmRepository' && form.draft.get(['spec', 'passCredentials']) === true && <div role="alert">Credentials may be sent to other hosts referenced by the repository index.</div>}
  </EditorSection>
  <details><summary>Polling, credentials and advanced options</summary><EditorSection title="Reconciliation">{common.filter(field => form.context.kind !== 'HelmChart' || !['spec.secretRef.name', 'spec.timeout'].includes(field.path)).map(field => <SourceField key={field.path} form={form} field={field} report={report} />)}</EditorSection>
   {(lists[form.context.kind] ?? []).map(list => {
    const path = list.path.split('.');
    const rows = form.draft.get(path);
    return <EditorSection key={list.path} title={list.label}>
     {Array.isArray(rows) && rows.map((_row, index) => <div key={index} style={{ display: 'grid', gap: 8 }}>
      {list.columns.map(column => <SourceField key={column.path} form={form} report={report} field={{ label: column.label, path: list.path }} path={[...path, index, ...column.path.split('.').filter(Boolean)]} />)}
      <Button size="sm" disabled={form.disabled} onClick={() => patch([{ op: 'remove', path: [...path, index] }])}>Remove row {index + 1}</Button>
     </div>)}
     <Button size="sm" disabled={form.disabled} onClick={() => patch(Array.isArray(rows) ? [{ op: 'insert', path, index: rows.length, value: list.columns[0].path ? {} : '' }] : [{ op: 'set', path, value: [list.columns[0].path ? {} : ''] }])}>Add {list.label.toLowerCase()}</Button>
    </EditorSection>;
   })}
  </details>
  {form.context.intent !== 'create' && <details><summary>Observed artifact provenance</summary>
   {['revision', 'digest', 'lastUpdateTime'].map(key => <EditorField key={key} label={`Observed ${key}`} value={scalarText(form.draft.get(['status', 'artifact', key]))} readOnly onChange={() => {}} />)}
  </details>}
  {error && <div role="alert">{error}</div>}
 </div>;
}
export const GitRepositoryEditor = SourceEditor;
export const OCIRepositoryEditor = SourceEditor;
export const BucketEditor = SourceEditor;
export const HelmRepositoryEditor = SourceEditor;
export const HelmChartEditor = SourceEditor;
export const ExternalArtifactEditor = SourceEditor;
