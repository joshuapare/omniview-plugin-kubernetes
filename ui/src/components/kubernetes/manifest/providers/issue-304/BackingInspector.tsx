import { useState } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection, useEditorReferences } from '../../editor-controls';
import { backingResources, type BackingResource } from './inventory';
import { allocationCounts, observedValue, type SafeValue } from './projection';

function Value({ value }: { value: SafeValue }) {
  if (Array.isArray(value)) return value.length ? <ol style={{ paddingLeft: 20 }}>{value.map((item, index) => <li key={index}><Value value={item} /></li>)}</ol> : <span>Empty list</span>;
  if (typeof value === 'object' && value !== null) return Object.keys(value).length ? <dl>{Object.entries(value).map(([key, item]) => <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) minmax(0, 2fr)', gap: 8 }}><dt>{key}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}><Value value={item} /></dd></div>)}</dl> : <span>No known fields recorded</span>;
  return <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value === null ? 'Unallocated / null' : String(value)}</span>;
}

function Destination({ form, resource }: { form: ResourceEditorFormProps; resource: BackingResource }) {
  const state = useEditorReferences(form, { group: 'projectcalico.org', version: 'v3', resource: resource.kind === 'IPAMConfig' ? 'ipamconfigurations' : resource.resource, namespace: resource.scope === 'Namespaced' ? form.context.namespace : undefined, projection: 'metadata' });
  const [selected, setSelected] = useState('');
  return <EditorSection title={`Public ${resource.publicKind}`}>
    <EditorHelp label="Destination mapping">Backing names do not prove public identity. Confirm management provenance and public resource identity before authoring through the public API. This lookup never opens an editor or changes a resource.</EditorHelp>
    <div role="status">{state.status === 'ready' ? state.items.length ? `${state.items.length} public records found` : 'No public records found' : state.status === 'loading' ? 'Looking up public API…' : state.status === 'denied' ? 'Public lookup denied' : state.status === 'absent' ? 'Public API not installed' : 'Public lookup unavailable'}</div>
    {state.status === 'ready' && state.items.length > 0 && <EditorChoice label="Review public candidate" value={selected} onChange={setSelected} options={[{value:'',label:'Select public record'},...state.items.map(item=>({value:item.name,label:item.name}))]} />}
    {selected && state.status === 'ready' && state.items.some(item => item.name === selected) && <div role="status">Candidate: {selected}. Identity mapping remains unverified. No mutation requested.</div>}
  </EditorSection>;
}

export default function BackingInspector(form: ResourceEditorFormProps) {
  const resource = backingResources.find(item => item.kind === form.context.kind);
  if (!resource) return <div role="alert">Unsupported backing resource. Source remains unchanged.</div>;
  const counts = resource.kind === 'IPAMBlock' ? allocationCounts(form.draft.get(['spec', 'allocations']), form.draft.get(['spec', 'unallocated'])) : null;
  return <div style={{ fontSize: 13, minWidth: 0, overflow: 'auto' }}>
    <div role="note">Read-only backing record · direct mutation disabled</div>
    {form.section === 'ownership' ? <>
      <EditorSection title="Management boundary"><EditorField label="Management source" value={form.context.ownership?.status ?? 'unknown'} readOnly onChange={() => {}} help="Only trusted host provenance establishes ownership. A schema, name, or owner reference alone does not prove safe authoring." />
      <div>{resource.publicKind ? 'Use supported public API after confirming identity and ownership.' : 'System allocation/storage record. Use controller configuration; do not edit or release directly.'}</div></EditorSection>
      {resource.publicKind && <Destination key={form.draft.sessionID + resource.kind} form={form} resource={resource} />}
    </> : <EditorSection title={form.section === 'advanced' ? `${resource.kind} · additional observed fields` : `${resource.kind} · observed configuration`}>
      {counts && <div role="status">Allocated slots: {counts.allocated} · Unallocated slots: {counts.free}</div>}
      {Object.entries(resource.fields).filter(([name]) => form.section === 'advanced' ? !resource.primary.includes(name) : resource.primary.includes(name)).map(([name, schema]) => <div key={name} style={{ borderBottom: '1px solid var(--ov-color-border-default, #444)', padding: '8px 0' }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong>{name.replace(/([a-z])([A-Z])/g, '$1 $2')}</strong><EditorHelp label={name}>{schema.description ?? `Observed spec.${name}. Read-only backing value.`}<code> spec.{name}</code></EditorHelp></div><Value value={observedValue(form.draft.get(['spec', name]), schema, name)} /></div>)}
    </EditorSection>}
  </div>;
}
