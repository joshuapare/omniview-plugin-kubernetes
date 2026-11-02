import { useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection, ExactValueField, KeyValueFields, ReferencePicker, patchError, setDraftField, useFieldValidity } from '../../editor-controls';
import { group, version, text } from './policy';
import ResourceLinkChip from '../../../../shared/ResourceLinkChip';

export default function GroupSnapshotForm(form: ResourceEditorFormProps) {
  const { draft, context } = form;
  const validity = useFieldValidity(form);
  const [error, setError] = useState<string | null>(null);
  const editing = context.intent !== 'create';
  const inspect = form.disabled || context.intent === 'inspect' || (editing && context.ownership?.status !== 'application');
  const commit = (operations: readonly ResourceEditorPatch[]) => { const failure = patchError(form.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations })); setError(failure); validity('patch', failure); };
  const field = (label: string, path: ResourceEditorPath, locked = false, optional = false) => <ExactValueField key={JSON.stringify(path)} label={label} identity={`${draft.sessionID}:${JSON.stringify(path)}`} value={text(draft, path)} disabled={inspect || locked} parse={value => optional || value.trim() ? { valid: true, value } : { valid: false, error: 'Required.' }} onCommit={value => patchError(setDraftField(form, path, value))} onValidityChange={message => validity(JSON.stringify(path), message)} />;
  const reference = (label: string, path: ResourceEditorPath, resource: string, locked = false, namespace?: string) => <ReferencePicker form={form} label={label} value={text(draft, path)} disabled={inspect || locked} query={{ group: resource === 'csidrivers' ? 'storage.k8s.io' : group, version: resource === 'csidrivers' ? 'v1' : version, resource, namespace }} onChange={value => commit([value ? { op: 'set', path, value } : { op: 'remove', path }])} />;
  const policyPath = context.kind === 'VolumeGroupSnapshotClass' ? ['deletionPolicy'] : ['spec', 'deletionPolicy'];
  const policy = <><EditorChoice label="Deletion policy" value={text(draft, policyPath)} disabled={inspect} options={[{ value: 'Retain', label: 'Retain physical snapshots' }, { value: 'Delete', label: 'Delete physical snapshots' }]} onChange={value => commit([{ op: 'set', path: policyPath, value }])} help="Delete permits removal of physical group and member snapshots when the bound request is deleted. Retain keeps content and underlying storage snapshots." />{text(draft, policyPath) === 'Delete' && <p role="note">Deleting the bound request can delete physical snapshots.</p>}</>;
  const safeForm = { ...form, disabled: inspect };
  return <EditorSection title={context.kind === 'VolumeGroupSnapshotClass' ? 'Driver policy' : context.kind === 'VolumeGroupSnapshot' ? 'Group snapshot request' : 'Group snapshot content'}>
    {context.kind === 'VolumeGroupSnapshotClass' ? <>
      {reference('CSI driver', ['driver'], 'csidrivers')}{policy}
      <details><summary>Driver parameters</summary><MaskedParameters form={safeForm} /></details>
    </> : context.kind === 'VolumeGroupSnapshot' ? <>
      {reference('Group snapshot class (optional)', ['spec', 'volumeGroupSnapshotClassName'], 'volumegroupsnapshotclasses')}
      <EditorChoice label="Snapshot source" value={draft.has(['spec', 'source', 'volumeGroupSnapshotContentName']) ? 'existing' : draft.has(['spec', 'source', 'selector']) ? 'selector' : ''} disabled={inspect || editing} options={[{ value: 'selector', label: 'PVC label selector' }, { value: 'existing', label: 'Bind existing content' }]} help="Source is immutable after creation. Label selectors match PVCs in this namespace. Binding requires both resources to reference each other." onChange={value => commit(value === 'selector' ? [{ op: 'remove', path: ['spec', 'source', 'volumeGroupSnapshotContentName'] }, { op: 'set', path: ['spec', 'source', 'selector'], value: {} }] : [{ op: 'remove', path: ['spec', 'source', 'selector'] }, { op: 'set', path: ['spec', 'source', 'volumeGroupSnapshotContentName'], value: '' }])} />
      {draft.has(['spec', 'source', 'selector']) && <><KeyValueFields form={{ ...safeForm, disabled: inspect || editing }} label="PVC label" path={['spec', 'source', 'selector', 'matchLabels']} /><details><summary>Advanced selector</summary><p>Use shared source view for matchExpressions. Existing expressions remain unchanged.</p></details></>}
      {draft.has(['spec', 'source', 'volumeGroupSnapshotContentName']) && reference('Existing group content', ['spec', 'source', 'volumeGroupSnapshotContentName'], 'volumegroupsnapshotcontents', editing)}
    </> : <>
      {draft.has(['spec', 'source', 'volumeHandles']) && <p role="note">Controller-generated content. Source and binding are inspection-only.</p>}
      {reference('CSI driver', ['spec', 'driver'], 'csidrivers', editing)}{policy}
      {reference('Group snapshot class (optional)', ['spec', 'volumeGroupSnapshotClassName'], 'volumegroupsnapshotclasses', editing)}
      {field('Binding namespace', ['spec', 'volumeGroupSnapshotRef', 'namespace'], editing)}
      {reference('Binding snapshot', ['spec', 'volumeGroupSnapshotRef', 'name'], 'volumegroupsnapshots', editing, text(draft, ['spec', 'volumeGroupSnapshotRef', 'namespace']))}
      {!draft.has(['spec', 'source', 'volumeHandles']) && <>{field('Existing group snapshot handle', ['spec', 'source', 'groupSnapshotHandles', 'volumeGroupSnapshotHandle'], editing)}<MemberHandles form={{ ...safeForm, disabled: inspect || editing }} /></>}
      <p role="note">Import creates a Kubernetes representation only. Bidirectional binding remains unverified.</p>
    </>}
    {context.kind !== 'VolumeGroupSnapshotClass' && editing && <details open><summary>Readiness and membership</summary><dl><dt>Ready to use</dt><dd>{draft.get(['status', 'readyToUse']) === true ? 'Ready' : draft.get(['status', 'readyToUse']) === false ? 'Not ready' : 'Unknown'}</dd><dt>Creation time</dt><dd>{text(draft, ['status', 'creationTime']) || 'Unknown'}</dd><dt>Binding</dt><dd>{text(draft, ['status', 'boundVolumeGroupSnapshotContentName']) || 'Not verified'}</dd><dt>Member snapshot count</dt><dd>{Array.isArray(draft.get(['status', 'volumeSnapshotHandlePairList'])) ? (draft.get(['status', 'volumeSnapshotHandlePairList']) as unknown[]).length : 'Unknown'}</dd></dl></details>}
      {editing && text(draft, ['spec', 'volumeGroupSnapshotRef', 'name']) && <ResourceLinkChip connectionID={context.connectionID} namespace={text(draft, ['spec', 'volumeGroupSnapshotRef', 'namespace'])} resourceName="Bound group snapshot" ownerReference={{ apiVersion: `${group}/${version}`, kind: 'VolumeGroupSnapshot', name: text(draft, ['spec', 'volumeGroupSnapshotRef', 'name']), uid: text(draft, ['spec', 'volumeGroupSnapshotRef', 'uid']) }} />}
    {error && <p role="alert">{error}</p>}
  </EditorSection>;
}
function MemberHandles({ form }: { form: ResourceEditorFormProps }) {
  const path = ['spec', 'source', 'groupSnapshotHandles', 'volumeSnapshotHandles'];
  const values = form.draft.get(path);
  const validity = useFieldValidity(form);
  const [next, setNext] = useState('');
  const apply = (operations: readonly ResourceEditorPatch[]) => validity('members', patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations })));
  return <div role="group" aria-label="Member snapshot handles">{Array.isArray(values) && values.map((value, index) => typeof value === 'string' ? <div key={index}><ExactValueField label={`Member snapshot ${index + 1}`} value={value} identity={`${form.draft.sessionID}:member:${index}`} disabled={form.disabled} parse={text => text.trim() ? { valid: true, value: text } : { valid: false, error: 'Required.' }} onCommit={value => patchError(setDraftField(form, [...path, index], value))} onValidityChange={message => validity(`member:${index}`, message)} /><Button size="sm" disabled={form.disabled} onClick={() => apply([{ op: 'remove', path: [...path, index] }])}>Remove member {index + 1}</Button></div> : null)}<EditorField label="New member snapshot handle" value={next} onChange={setNext} disabled={form.disabled} /><Button size="sm" disabled={form.disabled || !next.trim()} onClick={() => { apply(Array.isArray(values) ? [{ op: 'insert', path, index: values.length, value: next }] : [{ op: 'set', path, value: [next] }]); setNext(''); }}>Add member</Button></div>;
}
function MaskedParameters({ form }: { form: ResourceEditorFormProps }) {
  const [key, setKey] = useState(''); const [value, setValue] = useState('');
  const validity = useFieldValidity(form);
  const apply = (operations: readonly ResourceEditorPatch[]) => { const error = patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations })); validity('parameter', error); if (!error) { setKey(''); setValue(''); } };
  return <div><EditorField label="Parameter key" value={key} onChange={setKey} disabled={form.disabled} help="Enter an exact driver-specific parameter key. Existing values remain masked. Changes affect only this key." /><EditorField label="Replacement parameter value" value={value} type="password" onChange={setValue} disabled={form.disabled} /><Button size="sm" disabled={form.disabled || !key} onClick={() => apply([{ op: 'set', path: ['parameters', key], value }])}>Set parameter</Button><Button size="sm" disabled={form.disabled || !key} onClick={() => apply([{ op: 'remove', path: ['parameters', key] }])}>Remove parameter</Button></div>;
}
