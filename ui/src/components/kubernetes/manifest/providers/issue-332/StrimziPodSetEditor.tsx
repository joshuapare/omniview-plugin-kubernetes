import { useState } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorField, EditorHelp, EditorSection, useEditorReferences } from '../../editor-controls';
import { desiredNames, exactCount, generationState, hasIgnoredExpressions, identifier, record, rows } from './model';
import ResourceLinkChip from '../../../../shared/ResourceLinkChip';

export default function StrimziPodSetEditor(form: ResourceEditorFormProps) {
  const { draft, section, context } = form;
  const [filter, setFilter] = useState('');
  const pods = useEditorReferences(form, { group: '', version: 'v1', resource: 'pods', namespace: context.namespace, projection: 'metadata' });
  const names = desiredNames(draft);
  const owners = rows(draft.get(['metadata', 'ownerReferences']));
  const generation = draft.get(['metadata', 'generation']);
  const observed = draft.get(['status', 'observedGeneration']);
  return <div style={{ fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>
    <p role="note">Operator-managed · inspection only. Configure Kafka or KafkaNodePool instead.</p>
    {section === 'overview' && <EditorSection title="Managed workload">
      <dl><dt>Managed Pods</dt><dd>{exactCount(draft.get(['status', 'pods']))}</dd><dt>Ready Pods</dt><dd>{exactCount(draft.get(['status', 'readyPods']))}</dd><dt>Current revision Pods</dt><dd>{exactCount(draft.get(['status', 'currentPods']))}</dd><dt>Reconciliation</dt><dd>{generationState(generation, observed)}</dd></dl>
      <EditorHelp label="Pod counts">Counts come from operator status, not desired membership. Current revision does not imply readiness or controller health.</EditorHelp>
    </EditorSection>}
    {section === 'membership' && <EditorSection title="Desired Pod membership">
      <EditorField label="Filter Pod names" value={filter} onChange={setFilter} help="Filters desired membership locally. Embedded Pod definitions remain untouched." />
      <div role="status">{pods.status === 'ready' ? 'Pod metadata lookup complete' : pods.status === 'loading' ? 'Loading Pod metadata…' : pods.status === 'denied' ? 'Pod lookup denied' : pods.status === 'absent' ? 'Pod API absent' : 'Pod lookup unavailable'}</div>
      <table style={{ width: '100%' }}><thead><tr><th scope="col">Desired Pod</th><th scope="col">Observed membership</th></tr></thead><tbody>{names.filter(name => name.toLowerCase().includes(filter.toLowerCase())).map((name, index) => <tr key={`${name}-${index}`}><td>{name}</td><td>{pods.status !== 'ready' ? 'Unknown' : pods.items.some(pod => pod.name === name && pod.namespace === context.namespace) ? 'Present' : 'Not found in lookup'}</td></tr>)}</tbody></table>
      {!names.length && <p>No desired Pods available in safe projection.</p>}
      {pods.status === 'ready' && <div aria-label="Open observed Pods">{pods.items.filter(pod => names.includes(pod.name) && pod.namespace === context.namespace && pod.name.toLowerCase().includes(filter.toLowerCase())).map(pod => <ResourceLinkChip key={pod.uid ?? pod.name} connectionID={context.connectionID} namespace={context.namespace} ownerReference={{ apiVersion: 'v1', kind: 'Pod', name: pod.name, ...(pod.uid ? { uid: pod.uid } : {}) }} resourceName={pod.name} />)}</div>}
      {!!names.length && !names.some(name => name.toLowerCase().includes(filter.toLowerCase())) && <p>No matching Pod names.</p>}
      <EditorHelp label="Pod observation">Metadata lookup confirms presence only. Readiness and revision require the existing Pod inspector; this view does not infer them or offer restart.</EditorHelp>
      <details><summary>Selector</summary><p>{Object.keys(record(draft.get(['spec', 'selector', 'matchLabels']))).length} label requirements</p><EditorHelp label="Selector values">Label values stay omitted from this privacy-safe inspection.</EditorHelp>{hasIgnoredExpressions(draft) && <p role="alert">Strimzi ignores matchExpressions.</p>}</details>
    </EditorSection>}
    {section === 'ownership' && <EditorSection title="Controller ownership">
      {!owners.length && <p>No owner reference. Direct editing remains disabled.</p>}
      <dl>{owners.map((value, index) => { const owner = record(value); return <div key={index}><dt>{owner.controller === true ? 'Controller owner' : 'Owner reference'}</dt><dd>{identifier(owner.apiVersion)} · {identifier(owner.kind)} · {identifier(owner.name)}</dd></div>; })}</dl>
      <EditorHelp label="Ownership boundary">Owner references identify declared ownership, not permission or controller health. No create, delete, scale, restart, status write, or mutation payload is offered.</EditorHelp>
    </EditorSection>}
    {section === 'reconciliation' && <EditorSection title="Reconciliation diagnostics">
      <dl><dt>Generation</dt><dd>{exactCount(generation)}</dd><dt>Observed generation</dt><dd>{exactCount(observed)}</dd><dt>Observation</dt><dd>{generationState(generation, observed)}</dd></dl>
      <table style={{ width: '100%' }}><thead><tr><th scope="col">Condition</th><th scope="col">Status</th><th scope="col">Reason</th></tr></thead><tbody>{rows(draft.get(['status', 'conditions'])).map((value, index) => { const condition = record(value); return <tr key={index}><td>{identifier(condition.type)}</td><td>{['True', 'False', 'Unknown'].includes(String(condition.status)) ? String(condition.status) : 'Unknown'}</td><td>{identifier(condition.reason)}</td></tr>; })}</tbody></table>
      {!rows(draft.get(['status', 'conditions'])).length && <p>No conditions reported.</p>}
      <EditorHelp label="Condition privacy">Free-text messages are omitted because they may contain credentials. Generation lag alone does not prove a failed controller.</EditorHelp>
    </EditorSection>}
  </div>;
}
