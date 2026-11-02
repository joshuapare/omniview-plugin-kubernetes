import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useState } from 'react';

import { EditorField, EditorHelp, EditorSection } from '../../editor-controls';

import { identifierError, topologyValuesError } from './rules';
import { Availability, ChoiceValue, DriverField, Parameters, TextValue } from './StorageFields';
import { booleanOptions, omitted, storageBuffer, useStorageForm, type StorageState } from './storageState';

export default function StorageClassForm(form: ResourceEditorFormProps) {
  return <StorageClassSession key={form.draft.sessionID} form={form} />;
}
function StorageClassSession({ form }: { form: ResourceEditorFormProps }) {
  const state = useStorageForm(form);
  const immutable = form.context.intent !== 'create';
  if (form.section === 'availability') return <Availability form={form} />;
  if (form.section === 'advanced') return <div className="storage-form"><EditorSection title="Mount options">
    <EditorHelp label="Mount options">Each row is one exact mount option, including any commas. Invalid options can make mounts fail; Kubernetes does not validate these options.</EditorHelp>
    <MountOptions form={form} state={state} />
  </EditorSection><EditorSection title="Allowed topologies"><EditorHelp label="Topology matching">Terms use OR. Requirements inside a term use AND. An omitted or empty term list imposes no topology restriction. Driver topology support is not inferred.</EditorHelp><Topologies form={form} state={state} /></EditorSection></div>;
  return <div className="storage-form"><EditorSection title="Provisioning">
    {immutable && <p role="status">Provisioner, parameters, reclaim and binding are immutable.</p>}
    <DriverField form={form} state={state} path={['provisioner']} label="Provisioner" disabled={immutable} />
    <Button size="sm" variant="ghost" disabled={state.locked || immutable} onClick={() => { state.report('["provisioner"]', state.commit([{ op: 'set', path: ['provisioner'], value: 'kubernetes.io/no-provisioner' }])); state.buffer('["provisioner"]', 'kubernetes.io/no-provisioner'); }}>No dynamic provisioning</Button>
    <Parameters form={form} state={state} disabled={immutable} />
  </EditorSection><EditorSection title="Binding and retention"><div className="storage-grid">
    <ChoiceValue form={form} state={state} path={['reclaimPolicy']} label="Reclaim policy" disabled={immutable} options={[omitted, { value: 'Delete', label: 'Delete backing volume' }, { value: 'Retain', label: 'Retain backing volume' }]} help="Omission uses the server default Delete. Delete can remove backing storage after claim deletion. No existing PV is changed by editing this class." />
    <ChoiceValue form={form} state={state} path={['volumeBindingMode']} label="Volume binding" disabled={immutable} options={[omitted, { value: 'Immediate', label: 'Immediate' }, { value: 'WaitForFirstConsumer', label: 'Wait for first consumer' }]} help="Omission defaults to Immediate. WaitForFirstConsumer defers provisioning and binding until scheduling." />
    <ChoiceValue form={form} state={state} path={['allowVolumeExpansion']} label="Allow expansion" options={booleanOptions} help="Class permission alone does not prove the driver supports expansion. No PVC is resized here." />
  </div>{(!form.draft.has(['reclaimPolicy']) || form.draft.get(['reclaimPolicy']) === 'Delete') && <p role="status">Deleting a claim may delete its backing storage.</p>}</EditorSection></div>;
}
function MountOptions({ form, state }: { form: ResourceEditorFormProps; state: StorageState }) {
  const values = form.draft.get(['mountOptions']);
  const [value, setValue] = storageBuffer(state, 'new-mount-value');
  const [error, setError] = useState<string | null>(null);
  return <div className="storage-list">{state.rows(['mountOptions']).map(({ id, index }) => <div className="storage-row" key={id}>
    <TextValue form={form} state={state} path={['mountOptions', index]} label={`Mount option ${index + 1}`} required />
    <Button size="sm" variant="ghost" disabled={state.locked} onClick={() => { const failure = state.commit([{ op: 'remove', path: ['mountOptions', index] }]); setError(failure); state.report('mounts', failure); }}>Remove option {index + 1}</Button>
  </div>)}<div className="storage-row"><EditorField label="New mount option" value={value} disabled={state.locked} onChange={next => { setValue(next); state.report('new-mount', next ? 'Add or discard the pending mount option.' : null); }} />
    <Button size="sm" disabled={state.locked || !value} onClick={() => { const failure = state.commit([Array.isArray(values) ? { op: 'insert', path: ['mountOptions'], index: values.length, value } : { op: 'set', path: ['mountOptions'], value: [value] }]); setError(failure); if (!failure) { setValue(''); state.report('new-mount', null); } }}>Add option</Button>
    <Button size="sm" variant="ghost" disabled={state.locked || !value} onClick={() => { setValue(''); state.report('new-mount', null); }}>Discard</Button></div>{error && <p role="alert">{error}</p>}</div>;
}
function Topologies({ form, state }: { form: ResourceEditorFormProps; state: StorageState }) {
  return <div className="storage-list">{state.rows(['allowedTopologies']).map(({ id, index: termIndex }) => {
    const expressions = state.rows(['allowedTopologies', termIndex, 'matchLabelExpressions']);
    return <div className="storage-card" key={id}><div className="storage-heading"><strong>Topology term {termIndex + 1}</strong><Button size="sm" variant="ghost" disabled={state.locked} onClick={() => state.report('topology', state.commit([{ op: 'remove', path: ['allowedTopologies', termIndex] }]))}>Remove term</Button></div>
      {expressions.map(({ id: expressionID, index }) => <div className="storage-row" key={expressionID}>
        <TextValue form={form} state={state} path={['allowedTopologies', termIndex, 'matchLabelExpressions', index, 'key']} label={`Term ${termIndex + 1} topology key ${index + 1}`} required parse={text => { const error = identifierError(text); return error ? { error } : { value: text }; }} />
        <TopologyValues form={form} state={state} term={termIndex} index={index} />
        <Button size="sm" variant="ghost" disabled={state.locked || expressions.length === 1} onClick={() => state.report('topology', state.commit([{ op: 'remove', path: ['allowedTopologies', termIndex, 'matchLabelExpressions', index] }]))}>Remove requirement</Button>
      </div>)}<TopologyBuilder form={form} state={state} term={termIndex} />
    </div>;
  })}<TopologyBuilder form={form} state={state} /></div>;
}
function TopologyValues({ form, state, term, index }: { form: ResourceEditorFormProps; state: StorageState; term: number; index: number }) {
  const path = ['allowedTopologies', term, 'matchLabelExpressions', index, 'values'];
  const values = form.draft.get(path);
  const canonical = Array.isArray(values) && values.every(value => typeof value === 'string') ? values.join(', ') : '';
  const entry = state.buffers[JSON.stringify(path)];
  const text = entry?.canonical === canonical ? entry.text : canonical;
  return <EditorField label={`Term ${term + 1} values ${index + 1}`} value={text} error={state.errors[JSON.stringify(path)]} disabled={state.locked} help="Comma-separated exact topology values. Requirements preserve unrelated terms and unknown expression fields." onChange={next => {
    state.buffer(JSON.stringify(path), next, canonical); const parsed = next.split(',').map(value => value.trim());
    const failure = topologyValuesError(parsed) || state.commit([{ op: 'set', path, value: parsed }]);
    state.report(JSON.stringify(path), failure);
  }} />;
}
function TopologyBuilder({ form, state, term }: { form: ResourceEditorFormProps; state: StorageState; term?: number }) {
  const ledger = JSON.stringify(['allowedTopologies', term ?? 'new', '$builder']);
  const [key, setKey] = storageBuffer(state, JSON.stringify(['allowedTopologies', term ?? 'new', '$builder-key'])); const [values, setValues] = storageBuffer(state, JSON.stringify(['allowedTopologies', term ?? 'new', '$builder-values'])); const [error, setError] = useState<string | null>(null);
  const pending = (nextKey: string, nextValues: string) => state.report(ledger, nextKey || nextValues ? 'Add or discard the pending topology requirement.' : null);
  return <div className="storage-row"><EditorField label={term === undefined ? 'New term topology key' : `Term ${term + 1} new key`} value={key} disabled={state.locked} onChange={next => { setKey(next); pending(next, values); }} /><EditorField label={term === undefined ? 'New term values' : `Term ${term + 1} new values`} value={values} disabled={state.locked} onChange={next => { setValues(next); pending(key, next); }} />
    <Button size="sm" disabled={state.locked || !key || !values} onClick={() => {
      const parsed = values.split(',').map(value => value.trim());
      const expression = { key, values: parsed };
      const terms = form.draft.get(['allowedTopologies']);
      const expressions = term === undefined ? undefined : form.draft.get(['allowedTopologies', term, 'matchLabelExpressions']);
      const failure = identifierError(key) || topologyValuesError(parsed) || (Array.isArray(expressions) && expressions.some((_, index) => form.draft.get(['allowedTopologies', term!, 'matchLabelExpressions', index, 'key']) === key) ? 'Topology keys must be unique within a term.' : null) || state.commit([term === undefined ? Array.isArray(terms) ? { op: 'insert', path: ['allowedTopologies'], index: terms.length, value: { matchLabelExpressions: [expression] } } : { op: 'set', path: ['allowedTopologies'], value: [{ matchLabelExpressions: [expression] }] } : { op: 'insert', path: ['allowedTopologies', term, 'matchLabelExpressions'], index: Array.isArray(expressions) ? expressions.length : 0, value: expression }]);
      setError(failure); if (!failure) { setKey(''); setValues(''); state.report(ledger, null); }
    }}>{term === undefined ? 'Add term' : 'Add requirement'}</Button><Button size="sm" variant="ghost" disabled={state.locked || !key && !values} onClick={() => { setKey(''); setValues(''); setError(null); state.report(ledger, null); }}>Discard</Button>{error && <span role="alert">{error}</span>}</div>;
}
