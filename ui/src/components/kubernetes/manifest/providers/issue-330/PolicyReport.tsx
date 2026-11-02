import { useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection } from '../../editor-controls';
import ResourceLinkChip from '../../../../shared/ResourceLinkChip';
import { filterResults, list, outcomes, record, summaryMismatch, text } from './report';

function Reference({ value, connectionID }: { value: unknown; connectionID?: string }) {
  const reference = record(value);
  const navigable = connectionID && typeof reference.apiVersion === 'string' && typeof reference.kind === 'string' && typeof reference.name === 'string' && typeof reference.uid === 'string';
  return <>{navigable && <ResourceLinkChip connectionID={connectionID} namespace={typeof reference.namespace === 'string' ? reference.namespace : undefined} ownerReference={{ apiVersion: reference.apiVersion as string, kind: reference.kind as string, name: reference.name as string, uid: reference.uid as string }} resourceName={reference.name as string} />}<dl>{['apiVersion', 'kind', 'name', 'namespace', 'uid', 'resourceVersion', 'fieldPath'].filter(key => key in reference).map(key => <div key={key}><dt>{key}</dt><dd>{text(reference[key])}</dd></div>)}</dl></>;
}
function Selector({ value }: { value: unknown }) {
  const selector = record(value);
  return <><dl>{Object.entries(record(selector.matchLabels)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{text(value)}</dd></div>)}</dl>{list(selector.matchExpressions).map((value, index) => {
    const expression = record(value);
    return <p key={index}>{text(expression.key)} {text(expression.operator)} {list(expression.values).map(text).join(', ')}</p>;
  })}{!Object.keys(selector).length && <span>Not specified</span>}</>;
}
export default function PolicyReport({ context, draft, section }: ResourceEditorFormProps) {
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState('');
  const [producer, setProducer] = useState('');
  const results = list(draft.get(['results']));
  const summary = record(draft.get(['summary']));
  const visible = filterResults(results, search, outcome, producer);
  const producers = [...new Set(results.map(value => record(value).source).filter((value): value is string => typeof value === 'string'))];
  if (context.discovery.status !== 'available' || context.capabilities.get !== 'available') {
    return <p role="status">Report inspection: {context.discovery.status !== 'available' ? context.discovery.status : context.capabilities.get}.</p>;
  }
  if (section === 'ownership') return <EditorSection title="Producer and ownership">
    <p>Generated output · read-only</p><EditorHelp label="Report ownership">Producer identifiers, owner references and field managers are separate attribution. Missing ownership never permits report authoring.</EditorHelp>
    <h4>Producers</h4><p>{producers.join(', ') || 'Unknown'}</p>
    <h4>Owner references</h4>{list(draft.get(['metadata', 'ownerReferences'])).map((owner, index) => <Reference key={index} value={owner} connectionID={context.connectionID} />)}
    <h4>Field managers</h4><p>{[...new Set(list(draft.get(['metadata', 'managedFields'])).map(value => text(record(value).manager)))].join(', ') || 'Unknown'}</p>
    <h4>Report scope</h4><Reference value={draft.get(['scope'])} connectionID={context.connectionID} />
    <h4>Scope selector</h4><Selector value={draft.get(['scopeSelector'])} />
  </EditorSection>;
  return <EditorSection title="Policy results">
    <p role="note">Inspection only · no report mutations</p>
    <EditorHelp label="Reported summary">Counts come from the producer, not independent compliance verification. Filters change this view only. Messages and arbitrary properties remain hidden for privacy.</EditorHelp>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{outcomes.map(value => <Button key={value} size="sm" variant="outline" aria-pressed={outcome === value} onClick={() => setOutcome(outcome === value ? '' : value)}>{value}: {text(summary[value])}</Button>)}</div>
    {summaryMismatch(results, summary) && <p role="alert">Reported summary differs from result counts.</p>}
    <EditorField label="Policy or rule" value={search} onChange={setSearch} />
    <EditorChoice label="Producer" value={producer} onChange={setProducer} options={[{value:'',label:'All producers'},...producers.map(value=>({value,label:value}))]} />
    <Button size="sm" variant="outline" onClick={() => { setSearch(''); setProducer(''); setOutcome(''); }}>Clear filters</Button>
    {!results.length && <p>No reported results. Compliance is unknown.</p>}
    {!!results.length && !visible.length && <p role="status">No matching results.</p>}
    <div style={{ minWidth: 0, overflow: 'auto' }}>{visible.map(({ value, index }) => <details key={`${draft.sessionID}:${index}`} style={{ borderBottom: '1px solid var(--ov-color-border-default)', padding: '8px 0' }}>
      <summary>{text(value.result)} · {text(value.policy)} / {text(value.rule)} · {text(value.source)}</summary>
      <dl>{['severity', 'category', 'scored'].map(key => <div key={key}><dt>{key}</dt><dd>{text(value[key])}</dd></div>)}<div><dt>Timestamp seconds</dt><dd>{text(record(value.timestamp).seconds)}</dd></div><div><dt>Timestamp nanos</dt><dd>{text(record(value.timestamp).nanos)}</dd></div></dl>
      {value.message !== undefined && <p>Result message hidden for privacy.</p>}
      {value.properties !== undefined && <p>Additional properties hidden for privacy.</p>}
      <h4>Resources</h4>{list(value.resources).map((reference, referenceIndex) => <Reference key={referenceIndex} value={reference} connectionID={context.connectionID} />)}
      {!list(value.resources).length && !value.resourceSelector && <Reference value={draft.get(['scope'])} connectionID={context.connectionID} />}
      <EditorHelp label={`Resource navigation ${index + 1}`}>References are producer evidence, not verified destinations. Navigation requires exact discovered GVK, scope, independent read permission and UID verification; this inspector does not guess a plural.</EditorHelp>
      <h4>Resource selector</h4><Selector value={value.resourceSelector} />
    </details>)}</div>
  </EditorSection>;
}
