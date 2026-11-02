import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection, ExactValueField, ReferencePicker, patchError, setDraftField, removeDraftField, useFieldValidity } from '../../editor-controls';
import { durationError, ownershipReason } from './policy';

const kinds = ['GitRepository', 'OCIRepository', 'Bucket', 'ExternalArtifact'];
const sourceResources: Record<string, { group: string; version: string; resource: string }> = {
  GitRepository: { group: 'source.toolkit.fluxcd.io', version: 'v1', resource: 'gitrepositories' },
  OCIRepository: { group: 'source.toolkit.fluxcd.io', version: 'v1', resource: 'ocirepositories' },
  Bucket: { group: 'source.toolkit.fluxcd.io', version: 'v1', resource: 'buckets' },
  ExternalArtifact: { group: 'source.toolkit.fluxcd.io', version: 'v1', resource: 'externalartifacts' },
};
export default function KustomizationEditor(props: ResourceEditorFormProps) {
  const reason = ownershipReason(props.draft, props.context);
  const form = { ...props, disabled: props.disabled || !!reason || props.context.intent === 'inspect' };
  const validity = useFieldValidity(form);
  const text = (path: ResourceEditorPath) => { const value = form.draft.get(path); return typeof value === 'string' ? value : ''; };
  const put = (path: ResourceEditorPath, value: Parameters<typeof setDraftField>[2]) => validity(JSON.stringify(path), patchError(value === '' ? removeDraftField(form, path) : setDraftField(form, path, value)));
  const field = (label: string, path: ResourceEditorPath, help?: string, duration = false) => <ExactValueField key={JSON.stringify(path)} label={label} value={text(path)} identity={`${form.draft.sessionID}:${JSON.stringify(path)}`} disabled={form.disabled} help={help} parse={value => duration && value && durationError(value) ? { valid: false, error: durationError(value)! } : { valid: true, value }} onCommit={value => patchError(value === '' ? removeDraftField(form, path) : setDraftField(form, path, value))} onValidityChange={error => validity(JSON.stringify(path), error)} />;
  const choice = (label: string, path: ResourceEditorPath, values: readonly string[], help?: string) => <EditorChoice label={label} value={text(path)} disabled={form.disabled} help={help} options={[{ value: '', label: 'Not set' }, ...values.map(value => ({ value, label: value }))]} onChange={value => put(path, value)} />;
  const boolean = (label: string, key: string, help?: string) => <EditorChoice label={label} value={form.draft.has(['spec', key]) ? String(form.draft.get(['spec', key])) : ''} disabled={form.disabled} help={help} options={[{ value: '', label: 'Not set' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} onChange={value => put(['spec', key], value === '' ? '' : value === 'true')} />;
  const reference = (label: string, path: ResourceEditorPath, group: string, version: string, resource: string, namespace = form.context.namespace) => <ReferencePicker form={form} label={label} value={text(path)} query={{ group, version, resource, namespace, projection: 'metadata' }} disabled={form.disabled} onChange={value => put(path, value)} />;
  const rows = (title: string, path: ResourceEditorPath, fields: readonly string[], defaults: Record<string, string> = {}) => {
    const value = form.draft.get(path);
    const count = Array.isArray(value) ? value.length : 0;
    return <EditorSection title={title}>{Array.from({ length: count }, (_, index) => <div key={index} className="resource-editor-map-row">{fields.map(key => key === 'kind' && title === 'Substitution references' ? <EditorChoice key={key} label={`Reference ${index + 1} kind`} value={text([...path, index, key])} disabled={form.disabled} options={['ConfigMap', 'Secret'].map(value => ({ value, label: value }))} onChange={next => put([...path, index, key], next)} /> : field(`${title} ${index + 1}: ${key}`, [...path, index, key]))}<Button size="sm" disabled={form.disabled} aria-label={`Remove ${title} ${index + 1}`} onClick={() => validity(title, patchError(removeDraftField(form, [...path, index])))}>Remove</Button></div>)}<Button size="sm" disabled={form.disabled} onClick={() => validity(title, patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: form.draft.has(path) ? [{ op: 'insert', path, index: count, value: defaults }] : [{ op: 'set', path, value: [defaults] }] })))}>Add {title}</Button></EditorSection>;
  };
  const kind = text(['spec', 'sourceRef', 'kind']);
  return <div>{reason && <p role="status">{reason}</p>}{form.section === 'source' && <EditorSection title="Source & destination">
    {choice('Source kind', ['spec', 'sourceRef', 'kind'], kinds, 'ExternalArtifact requires a supporting installed controller. Discovery alone does not establish support.')}
    {sourceResources[kind] && reference('Source name', ['spec', 'sourceRef', 'name'], sourceResources[kind].group, sourceResources[kind].version, sourceResources[kind].resource, text(['spec', 'sourceRef', 'namespace']) || form.context.namespace)}
    {field('Source namespace', ['spec', 'sourceRef', 'namespace'], 'Omit for this namespace. Cross-namespace references depend on controller policy.')}
    {field('Directory', ['spec', 'path'], 'Relative directory in the source artifact. Omit for source root.')}
    {field('Reconcile interval', ['spec', 'interval'], 'Duration in ms, s, m or h.', true)}
    {field('Target namespace', ['spec', 'targetNamespace'], 'Namespace must already exist. No companion namespace is created.')}
  </EditorSection>}
  {form.section === 'reconciliation' && <EditorSection title="Reconciliation">
    {boolean('Prune removed resources', 'prune', 'Required choice. Yes deletes previously managed resources absent from the source.')}
    {choice('On Kustomization deletion', ['spec', 'deletionPolicy'], ['MirrorPrune', 'Delete', 'WaitForTermination', 'Orphan'])}
    {boolean('Wait for health', 'wait', 'When enabled, explicit healthChecks are ignored.')}
    {boolean('Force recreation', 'force', 'May delete and recreate resources when immutable fields change.')}
    {boolean('Suspend reconciliation', 'suspend', 'Does not stop reconciliation already running. Resume by selecting No.')}
    {field('Timeout', ['spec', 'timeout'], undefined, true)}{field('Retry interval', ['spec', 'retryInterval'], undefined, true)}
    {(form.draft.get(['spec', 'prune']) === true || form.draft.get(['spec', 'force']) === true) && <p role="status">Managed resources may be deleted or recreated.</p>}
  </EditorSection>}
  {form.section === 'health' && <>{rows('Dependencies', ['spec', 'dependsOn'], ['name', 'namespace', 'readyExpr'])}<EditorHelp label="Dependency readiness">readyExpr replaces built-in readiness unless AdditiveCELDependencyCheck is enabled.</EditorHelp>{form.draft.get(['spec', 'wait']) === true && <p role="status">Wait overrides explicit health checks.</p>}{rows('Health checks', ['spec', 'healthChecks'], ['kind', 'name', 'apiVersion', 'namespace'])}</>}
  {form.section === 'substitutions' && <>{rows('Substitution references', ['spec', 'postBuild', 'substituteFrom'], ['kind', 'name'], { kind: 'ConfigMap' })}<EditorHelp label="Substitutions">Secret and ConfigMap references are resolved by Flux, never imported here. Literal substitutions remain in the protected canonical source editor.</EditorHelp></>}
  {form.section === 'decryption' && <EditorSection title="Decryption & identity"><EditorChoice label="Decryption provider" value={text(['spec', 'decryption', 'provider'])} disabled={form.disabled} options={[{ value: '', label: 'Disabled' }, { value: 'sops', label: 'SOPS' }]} onChange={value => value ? put(['spec', 'decryption', 'provider'], value) : validity('decryption', patchError(removeDraftField(form, ['spec', 'decryption'])))} />{form.draft.has(['spec', 'decryption']) && <>{reference('Decryption Secret', ['spec', 'decryption', 'secretRef', 'name'], '', 'v1', 'secrets')}{reference('Decryption service account', ['spec', 'decryption', 'serviceAccountName'], '', 'v1', 'serviceaccounts')}<EditorHelp label="Decryption identity">Static credentials in the referenced Secret take priority over workload identity. No credential values are fetched.</EditorHelp></>}{reference('Apply service account', ['spec', 'serviceAccountName'], '', 'v1', 'serviceaccounts')}</EditorSection>}
  {form.section === 'advanced' && <EditorSection title="Advanced & inventory"><EditorHelp label="Advanced source fields">Use the shared YAML editor for images, patches, components, commonMetadata, namePrefix/nameSuffix, healthCheckExprs and remote kubeConfig. Unknown siblings and comments remain canonical. Remote kubeConfig requires exactly one ConfigMap or Secret reference. No credentials are resolved.</EditorHelp><EditorField label="Inventory entries" value={String(Array.isArray(form.draft.get(['status', 'inventory', 'entries'])) ? (form.draft.get(['status', 'inventory', 'entries']) as unknown[]).length : 0)} readOnly onChange={() => undefined} /><EditorHelp label="Inventory and reconcile">Inventory is controller-owned. Use existing resource inspection for inventory and drift. Reconcile remains an existing controller action; this form never claims execution success.</EditorHelp></EditorSection>}
  </div>;
}
