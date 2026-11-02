import { useEffect, useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, ExactValueField, EditorHelp, EditorSection, ReferencePicker, useFieldValidity } from '../../editor-controls';
import { endpointError, eventTypes, publicEndpointReference, readOnly } from './model';

function TextField({ form, path, label, endpoint = false, help, report }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string; endpoint?: boolean; help?: string; report?: (this: void, field: string, error: string | null) => void }) {
  const value = form.draft.get(path);
  const visible = endpoint ? publicEndpointReference(value) : typeof value === 'string' ? value : '';
  const hidden = endpoint && value !== undefined && visible === '';
  return <ExactValueField label={label} value={visible} placeholder={hidden ? 'Stored reference unchanged' : undefined} identity={`${form.draft.sessionID}/${JSON.stringify(path)}`} type="text" help={help} disabled={form.disabled || readOnly(form.draft, form.context)} parse={next => {
    const invalid = endpoint ? endpointError(next) : null;
    return invalid ? { valid: false, error: invalid } : { valid: true, value: next };
  }} onCommit={next => {
    if (!next && hidden) return null;
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [next ? { op: 'set', path, value: next } : { op: 'remove', path }] });
    return result.status === 'accepted' ? null : 'Change could not be applied. Refresh this field.';
  }} onValidityChange={error => report?.(label, error)} />;
}

export default function CloudEventEditor(form: ResourceEditorFormProps) {
  const { draft, context } = form;
  const locked = form.disabled || readOnly(draft, context);
  const [error, setError] = useState<string | null>(null);
  const report = useFieldValidity(form);
  useEffect(() => { report('patch', error); return () => report('patch', null); }, [error, report]);
  function patch(operations: readonly ResourceEditorPatch[]) {
    const result = form.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations });
    setError(result.status === 'accepted' ? null : 'Change could not be applied. Source remains unchanged.');
  }
  const kindValue = draft.get(['spec', 'authenticationRef', 'kind']);
  const kind = typeof kindValue === 'string' ? kindValue : 'TriggerAuthentication';
  const auth = draft.get(['spec', 'authenticationRef', 'name']);
  const included = draft.get(['spec', 'eventSubscription', 'includedEventTypes']);
  const excluded = draft.get(['spec', 'eventSubscription', 'excludedEventTypes']);
  const overlaps = Array.isArray(included) && Array.isArray(excluded) && included.some(event => excluded.includes(event));
  if (form.section === 'observed') {
    const conditions = draft.get(['status', 'conditions']);
    const rows: readonly unknown[] = Array.isArray(conditions) ? conditions : [];
    return <EditorSection title="Observed conditions">{rows.length ? rows.map((condition, index) => {
      const type = condition !== null && typeof condition === 'object' && 'type' in condition && typeof condition.type === 'string' ? condition.type : 'Condition';
      const status = condition !== null && typeof condition === 'object' && 'status' in condition && (condition.status === 'True' || condition.status === 'False') ? condition.status : 'Unknown';
      return <div key={index}>{type}: {status}</div>;
    }) : <div role="status">No observed conditions available.</div>}</EditorSection>;
  }
  if (form.section === 'filters') return <EditorSection title="Event filters"><EditorHelp label="Event filters">Include limits delivery to selected types. Exclude suppresses selected types. Empty lists leave filtering to KEDA.</EditorHelp>{(['includedEventTypes', 'excludedEventTypes'] as const).map(field => {
    const path = ['spec', 'eventSubscription', field];
    const raw = draft.get(path);
    const selected: readonly unknown[] = Array.isArray(raw) ? raw : [];
    return <fieldset key={field} disabled={locked}><legend>{field === 'includedEventTypes' ? 'Include events' : 'Exclude events'}</legend>{eventTypes.map(event => <label key={event} style={{ display: 'flex', gap: 8, overflowWrap: 'anywhere', paddingBlock: 4 }}><input type="checkbox" checked={selected.includes(event)} onChange={e => {
      const index = selected.indexOf(event);
      if (e.target.checked) patch([draft.has(path) ? { op: 'insert', path, index: selected.length, value: event } : { op: 'set', path, value: [event] }]);
      else if (selected.length === 1) patch([{ op: 'remove', path }]);
      else patch([{ op: 'remove', path: [...path, index] }]);
    }} />{event}</label>)}</fieldset>;
  })}{overlaps && <div role="status">Some included events are also excluded.</div>}{error && <div role="alert">{error}</div>}</EditorSection>;
  if (form.section === 'advanced') return <EditorSection title="Source identity"><TextField form={form} path={['spec', 'clusterName']} label="Cluster name override" help="Optional event source identity. Omit to use the operator's configured identity." /></EditorSection>;
  return <EditorSection title="Event destinations">
    <div role="note">{context.scope === 'Cluster' ? 'Delivers events across namespaces to external destinations.' : 'Delivers namespace events to external destinations.'}</div>
    <TextField form={form} report={report} path={['spec', 'destination', 'http', 'uri']} label="HTTP sink URL" endpoint help="Independent HTTP sink. Both destination types may coexist. Credentials belong in authentication resources." />
    <TextField form={form} report={report} path={['spec', 'destination', 'azureEventGridTopic', 'endpoint']} label="Azure Event Grid endpoint" endpoint help="Uses azureEventGridTopic from the pinned KEDA schema. Configure authentication separately." />
    {(['http', 'azureEventGridTopic'] as const).map(branch => {
      const path = ['spec', 'destination', branch];
      const value = draft.get(path);
      const key = branch === 'http' ? 'uri' : 'endpoint';
      const removable = !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(field => field === key);
      return draft.has(path) ? <button key={branch} type="button" disabled={locked || !removable} onClick={() => patch([{ op: 'remove', path }])}>Remove {branch === 'http' ? 'HTTP sink' : 'Event Grid sink'}</button> : null;
    })}
    {draft.has(['spec', 'authenticationRef']) && <button type="button" disabled={locked || (() => { const value = draft.get(['spec', 'authenticationRef']); return !value || typeof value !== 'object' || Object.keys(value).some(key => !['name', 'kind'].includes(key)); })()} onClick={() => patch([{ op: 'remove', path: ['spec', 'authenticationRef'] }])}>Remove authentication reference</button>}
    <details><summary>Authentication</summary>
      <EditorChoice label="Authentication scope" value={kind} disabled={locked} options={[{ value: 'TriggerAuthentication', label: 'Namespace authentication' }, { value: 'ClusterTriggerAuthentication', label: 'Cluster authentication' }]} onChange={value => patch([{ op: 'set', path: ['spec', 'authenticationRef', 'kind'], value }])} />
      {context.scope === 'Cluster' && kind !== 'ClusterTriggerAuthentication' ? <><div role="status">Operator namespace is required for namespaced authentication lookup.</div><TextField form={form} path={['spec', 'authenticationRef', 'name']} label="Authentication reference" /></> : <ReferencePicker label="Authentication reference" value={typeof auth === 'string' ? auth : ''} form={form} disabled={locked} query={{ group: 'keda.sh', version: 'v1alpha1', resource: kind === 'ClusterTriggerAuthentication' ? 'clustertriggerauthentications' : 'triggerauthentications', namespace: kind === 'TriggerAuthentication' ? context.namespace : undefined, projection: 'metadata' }} onChange={value => patch([value ? { op: 'set', path: ['spec', 'authenticationRef', 'name'], value } : { op: 'remove', path: ['spec', 'authenticationRef', 'name'] }])} help="Reference only. No credentials are fetched or companion objects created." />}
    </details>{error && <div role="alert">{error}</div>}
  </EditorSection>;
}
