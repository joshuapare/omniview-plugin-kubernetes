import { useState } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection } from '../../editor-controls';
import { filterResults, outcomes, record, rows, scalar, timestamp } from './evidence';
import ResourceLinkChip from '../../../../shared/ResourceLinkChip';

function ReferenceLink({ value, connectionID, namespace }: { value: unknown; connectionID: string; namespace?: string }) {
  const data = record(value);
  if (typeof data.apiVersion !== 'string' || typeof data.kind !== 'string' || typeof data.name !== 'string' || typeof data.uid !== 'string' || !data.uid) return <span>Reference identity unresolved</span>;
  return <ResourceLinkChip connectionID={connectionID} namespace={typeof data.namespace === 'string' ? data.namespace : namespace} ownerReference={{ apiVersion: data.apiVersion, kind: data.kind, name: data.name, uid: data.uid }} resourceName={data.name} />;
}

const referenceFields = ['apiVersion', 'kind', 'name', 'namespace', 'uid', 'resourceVersion', 'fieldPath'] as const;
function Facts({ value, fields }: { value: unknown; fields: readonly string[] }) {
  const data = record(value);
  return <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) minmax(0, 2fr)', gap: 6, overflowWrap: 'anywhere' }}>{fields.map(key => <div key={key} style={{ display: 'contents' }}><dt>{key}</dt><dd style={{ margin: 0 }}>{scalar(data[key])}</dd></div>)}</dl>;
}

export default function EphemeralReportInspector({ draft, context, section }: ResourceEditorFormProps) {
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState('all');
  const filtered = filterResults(draft, query, outcome);
  if (section === 'boundary') return <EditorSection title="Controller-generated evidence">
    <p role="status">Read-only. No create, edit, re-evaluate or rescan operation.</p>
    <EditorHelp label="Evidence lifecycle">Kyverno can aggregate or remove transient reports. Missing evidence does not prove policy success. Any separately authorized host deletion removes evidence, not policy enforcement.</EditorHelp>
    <dl><dt>Destination</dt><dd>{context.kind} / {context.name ?? 'Unnamed'}{context.scope === 'Namespaced' ? ` / ${context.namespace ?? 'Unknown namespace'}` : ' / Cluster'}</dd><dt>Aggregation completion</dt><dd>Unknown</dd></dl>
  </EditorSection>;
  if (section === 'ownership') return <>
    <EditorSection title="Reported owner"><EditorHelp label="Reported owner">spec.owner is not metadata.ownerReferences. Missing ownership never permits authoring. Reference facts do not prove access or UID identity of a live object.</EditorHelp>
      <Facts value={draft.get(['spec', 'owner'])} fields={['apiVersion', 'kind', 'name', 'uid', 'controller', 'blockOwnerDeletion']} />
      <ReferenceLink value={draft.get(['spec', 'owner'])} connectionID={context.connectionID} namespace={context.namespace} />
    </EditorSection>
    <EditorSection title="Aggregation provenance"><dl style={{ overflowWrap: 'anywhere' }}>{['source', 'resource.group', 'resource.kind', 'resource.uid', 'resource.hash'].map(key => <div key={key}><dt>{key}</dt><dd>{scalar(draft.get(['metadata', 'labels', `audit.kyverno.io/${key}`]))}</dd></div>)}<dt>Created</dt><dd>{scalar(draft.get(['metadata', 'creationTimestamp']))}</dd><dt>Aggregation completion</dt><dd>Unknown</dd></dl></EditorSection>
  </>;
  return <EditorSection title="Rule outcomes">
    <EditorHelp label="Transient outcomes">Filters affect this view only. Summary counts are recorded evidence, not controller health. Messages, properties and annotations stay hidden because they may contain payloads.</EditorHelp>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{outcomes.map(key => <span key={key}>{key}: {scalar(draft.get(['spec', 'summary', key]))}</span>)}</div>
    <EditorField label="Search policy, rule or severity" value={query} onChange={setQuery} />
    <EditorChoice label="Outcome" value={outcome} onChange={setOutcome} options={[{ value: 'all', label: 'All outcomes' }, ...outcomes.map(value => ({ value, label: value }))]} />
    {rows(draft.get(['spec', 'results'])).length === 0 ? <p role="status">No recorded results. Enforcement state unknown.</p> : filtered.length === 0 ? <p role="status">No outcomes match these filters.</p> : filtered.map(item => {
      const path = ['spec', 'results', item.index] as const;
      const resources = rows(draft.get([...path, 'resources']));
      const selector = record(draft.get([...path, 'resourceSelector']));
      return <details key={item.index} style={{ borderBottom: '1px solid var(--ov-color-border-default)', padding: '8px 0' }}><summary style={{ cursor: 'pointer', overflowWrap: 'anywhere' }}>{item.result} · {item.policy} / {item.rule} · {item.severity}</summary>
        <Facts value={{ scored: draft.get([...path, 'scored']), category: draft.get([...path, 'category']), source: draft.get([...path, 'source']) }} fields={['scored', 'category', 'source']} />
        <p>{timestamp(draft.get([...path, 'timestamp', 'seconds']), draft.get([...path, 'timestamp', 'nanos']))}</p>
        <h4>Resource references</h4>{resources.length ? resources.map((resource, index) => <div key={index}><ReferenceLink value={resource} connectionID={context.connectionID} namespace={context.namespace} /><Facts value={resource} fields={referenceFields} /></div>) : <p>No explicit resource references recorded.</p>}
        <details><summary>Selector · AND semantics</summary>{Object.entries(record(selector.matchLabels)).map(([key, value]) => <p key={key}>{key} = {scalar(value)}</p>)}{rows(selector.matchExpressions).map((expression, index) => { const value = record(expression); return <p key={index}>{scalar(value.key)} {scalar(value.operator)} [{rows(value.values).map(scalar).join(', ')}]</p>; })}{Object.keys(selector).length === 0 && <p>Not recorded. No matches inferred.</p>}</details>
        <p>Message and properties hidden.</p>
      </details>;
    })}
  </EditorSection>;
}
