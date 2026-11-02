import { useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection, ExactValueField, ReferencePicker, useFieldValidity } from '../../editor-controls';
import { generated, group, inspectOnly } from './policy';

export default function SnapshotEditor(form: ResourceEditorFormProps) {
  return <SnapshotSession key={form.draft.sessionID} form={form} />;
}
function SnapshotSession({ form }: { form: ResourceEditorFormProps }) {
  const { draft, context } = form;
  const validity = useFieldValidity(form);
  const [importEnabled, setImportEnabled] = useState(false);
  const [source, setSource] = useState(draft.has(['spec', 'source', 'volumeSnapshotContentName']) ? 'content' : 'pvc');
  const [parameterKey, setParameterKey] = useState('');
  const [parameterValue, setParameterValue] = useState('');
  const isClass = context.kind === 'VolumeSnapshotClass';
  const isContent = context.kind === 'VolumeSnapshotContent';
  const editing = context.intent !== 'create';
  const readonly = form.disabled || inspectOnly(draft, context);
  const locked = readonly || editing || (isContent && !importEnabled);
  const prefix = isClass ? [] : ['spec'];
  const text = (path: ResourceEditorPath) => { const value = draft.get(path); return typeof value === 'string' ? value : ''; };
  const commit = (operations: readonly ResourceEditorPatch[]) => {
    const result = form.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations });
    return result.status === 'accepted' ? null : result.message;
  };
  const set = (path: ResourceEditorPath, value: string, optional = false) => commit([{ op: optional && !value ? 'remove' : 'set', path, ...(optional && !value ? {} : { value }) } as ResourceEditorPatch]);
  const field = (label: string, path: ResourceEditorPath, disabled = locked, optional = false) => <ExactValueField label={label} value={text(path)} identity={`${draft.sessionID}:${path.join('.')}`} disabled={disabled} parse={value => optional || value.trim() ? { valid: true, value } : { valid: false, error: 'Required.' }} onCommit={value => set(path, String(value), optional)} onValidityChange={error => validity(path.join('.'), error)} />;
  const reference = (label: string, path: ResourceEditorPath, resource: string, namespace?: string, apiGroup = group, disabled = locked) => <LocalReference key={`${draft.sessionID}:${path.join('.')}`} form={form} label={label} value={text(path)} disabled={disabled} resource={resource} namespace={namespace} apiGroup={apiGroup} optional={path.at(-1) === 'volumeSnapshotClassName'} commit={value => {
    if (context.kind === 'VolumeSnapshot' && path[1] === 'source') {
      const sibling = path[2] === 'persistentVolumeClaimName' ? 'volumeSnapshotContentName' : 'persistentVolumeClaimName';
      const error = commit([{ op: 'remove', path: ['spec', 'source', sibling] }, { op: 'set', path, value }]);
      if (!error) validity('source', null);
      return error;
    }
    return set(path, value, path.at(-1) === 'volumeSnapshotClassName');
  }} report={error => validity(path.join('.'), error)} />;
  const policyPath = [...prefix, 'deletionPolicy'];
  return <EditorSection title={context.kind}>
    {isContent && !editing && <><Button size="sm" disabled={readonly} onClick={() => setImportEnabled(value => !value)}>{importEnabled ? 'Cancel import authoring' : 'Author pre-provisioned import'}</Button><EditorHelp label="Pre-provisioned import">Represent an existing storage snapshot only. This does not create a companion VolumeSnapshot or verify the driver and binding.</EditorHelp></>}
    {isContent && generated(draft) && <div role="status">Controller-generated content · inspection only</div>}
    {context.kind === 'VolumeSnapshot' ? <>
      <EditorChoice label="Create from" value={source} disabled={locked} options={[{ value: 'pvc', label: 'Persistent volume claim' }, { value: 'content', label: 'Existing snapshot content' }]} onChange={value => {
        setSource(value);
        validity('source', 'Choose a source reference to apply this change.');
      }} />
      {source === 'pvc' ? reference('Source PVC', ['spec', 'source', 'persistentVolumeClaimName'], 'persistentvolumeclaims', context.namespace, '') : reference('Existing content', ['spec', 'source', 'volumeSnapshotContentName'], 'volumesnapshotcontents')}
      {reference('Snapshot class (optional)', ['spec', 'volumeSnapshotClassName'], 'volumesnapshotclasses')}
      <EditorHelp label="Snapshot consistency">A request does not guarantee application consistency, quiescence, driver capability, or controller health. Omit class to request the driver default.</EditorHelp>
    </> : <>
      {field('CSI driver', [...prefix, 'driver'])}
      <EditorChoice label="Deletion policy" value={text(policyPath)} disabled={readonly || (isContent && !editing && !importEnabled)} options={[{ value: 'Retain', label: 'Retain snapshot data' }, { value: 'Delete', label: 'Delete snapshot data' }]} onChange={value => validity('policy', set(policyPath, value))} />
      <div role="note">{text(policyPath) === 'Delete' ? 'Delete may permanently remove physical snapshot data.' : 'Retain leaves storage cleanup and costs with you.'}</div>
      {isClass ? <details><summary>Driver parameters</summary><EditorHelp label="Driver parameters">Values are masked and never read back. Existing opaque values remain untouched. Policy changes do not update existing content.</EditorHelp>
        <EditorField label="Parameter key" value={parameterKey} disabled={locked} onChange={setParameterKey} />
        <EditorField label="Parameter value" type="password" value={parameterValue} disabled={locked} onChange={setParameterValue} />
        <Button size="sm" disabled={locked} onClick={() => { const error = !parameterKey.trim() ? 'Enter a parameter key.' : draft.has(['parameters', parameterKey]) ? 'Existing parameter cannot be overwritten here.' : set(['parameters', parameterKey], parameterValue); validity('parameters', error); if (!error) { setParameterKey(''); setParameterValue(''); } }}>Add parameter</Button>
      </details> : <>
        {field('Existing snapshot handle', ['spec', 'source', 'snapshotHandle'])}
        {field('Target snapshot namespace', ['spec', 'volumeSnapshotRef', 'namespace'])}
        {reference('Target snapshot', ['spec', 'volumeSnapshotRef', 'name'], 'volumesnapshots', text(['spec', 'volumeSnapshotRef', 'namespace']))}
        <details><summary>Advanced import</summary>
          {reference('Snapshot class (optional)', ['spec', 'volumeSnapshotClassName'], 'volumesnapshotclasses')}
          <EditorChoice label="Source volume mode" value={text(['spec', 'sourceVolumeMode'])} disabled={locked || context.discovery.features['snapshot.storage.k8s.io/sourceVolumeMode'] !== 'available'} help="Alpha field. Available only with confirmed installed feature support. Unknown stays omitted." options={[{ value: '', label: 'Unknown (omit)' }, { value: 'Filesystem', label: 'Filesystem' }, { value: 'Block', label: 'Block' }]} onChange={value => validity('mode', set(['spec', 'sourceVolumeMode'], value, true))} />
        </details>
      </>}
    </>}
    {!isClass && <details open={editing}><summary>Binding and readiness</summary><dl>
      <dt>Snapshot</dt><dd>{isContent ? `${text(['spec', 'volumeSnapshotRef', 'namespace']) || 'Unknown'}/${text(['spec', 'volumeSnapshotRef', 'name']) || 'Unknown'}` : context.name || 'Not created'}</dd>
      <dt>Content</dt><dd>{isContent ? context.name || 'Not created' : text(['status', 'boundVolumeSnapshotContentName']) || 'Unknown'}</dd>
      <dt>Reciprocal UID binding</dt><dd>Unverified</dd>
      <dt>Ready to use</dt><dd>{typeof draft.get(['status', 'readyToUse']) === 'boolean' ? draft.get(['status', 'readyToUse']) ? 'Reported ready (binding unverified)' : 'Reported not ready' : 'Unknown'}</dd>
    </dl><EditorHelp label="Binding safety">Verify both objects and UID before use. Driver errors and storage handles are not exposed in this inspection. Delete requires a separate authorized resource action and explicit risk confirmation.</EditorHelp></details>}
  </EditorSection>;
}
function LocalReference({ form, label, value, disabled, resource, namespace, apiGroup, optional, commit, report }: { form: ResourceEditorFormProps; label: string; value: string; disabled: boolean; resource: string; namespace?: string; apiGroup: string; optional: boolean; commit(this: void, value: string): string | null; report(this: void, error: string | null): void }) {
  const [local, setLocal] = useState(value);
  const [error, setError] = useState<string | null>(null);
  return <ReferencePicker form={form} label={label} value={local} disabled={disabled} error={error} query={{ group: apiGroup, version: 'v1', resource, namespace }} onChange={next => {
    setLocal(next);
    const failure = !optional && !next.trim() ? 'Required.' : commit(next);
    setError(failure);
    report(failure);
  }} />;
}
