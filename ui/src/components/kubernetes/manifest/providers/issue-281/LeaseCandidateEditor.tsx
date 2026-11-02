import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useEffect, useState } from 'react';

import { EditorField, EditorHelp, EditorSection, scalarText, useEditorReferences } from '../../editor-controls';

import { coordinationShapeError, readAvailability } from './coordination';
import './coordination.css';

const candidateFields = [
  ['leaseName', 'Contended Lease', 'Immutable same-namespace Lease reference. Displaying a name does not prove that the Lease exists.'],
  ['binaryVersion', 'Binary version', 'Semantic version without a leading v. The participant reports its binary version.'],
  ['emulationVersion', 'Emulation version', 'Must not exceed the binary version. OldestEmulationVersion requires an emulation version.'],
  ['strategy', 'Election strategy', 'The coordinator resolves participant strategies. A custom qualified strategy is not normalized to a guessed built-in value.'],
  ['pingTime', 'Coordinator ping', 'Writer-owned request for a participant response. This inspector never sends a ping.'],
  ['renewTime', 'Participant renewal', 'Writer-owned participant response. This timestamp does not establish health, freshness or controller operation.'],
] as const;

export default function LeaseCandidateEditor(props: ResourceEditorFormProps) {
  const unavailable = readAvailability(props.context);
  if (unavailable) return <div role="status">{unavailable}</div>;
  const unsupported = coordinationShapeError(props.draft, true);
  if (unsupported) return <div role="status">{unsupported}</div>;
  return <CandidateSession key={props.draft.sessionID} {...props} />;
}

function CandidateSession(props: ResourceEditorFormProps) {
  const { context, draft, onValidityChange, section } = props;
  const [retry, setRetry] = useState(0);
  useEffect(() => { onValidityChange(null); }, [onValidityChange]);
  const namespace = context.namespace ?? scalarText(draft.get(['metadata', 'namespace']));
  return <div className="coordination-editor">
    <div role="status" className="coordination-boundary">Participant and coordinator-owned. Inspection only; no create, ping, renewal or forced election.</div>
    {section === 'ownership' ? <EditorSection title="Gate and ownership">
      <dl className="coordination-facts">
        <dt>API version</dt><dd>{context.version}</dd>
        <dt>Scope / resource</dt><dd>Namespaced · leasecandidates</dd>
        <dt>Read access</dt><dd>{context.capabilities.get}</dd>
        <dt>CoordinatedLeaderElection</dt><dd>{context.discovery.features.CoordinatedLeaderElection ?? 'unknown'}</dd>
        <dt>Writer policy</dt><dd>{context.ownership?.status ?? 'unknown'}</dd>
      </dl>
      <EditorHelp label="Coordinated leader election prerequisites">Kubernetes v1.35 marks CoordinatedLeaderElection Beta and default-off. API serving, gate configuration, authorization, participant writers and coordinator operation are separate prerequisites. Discovery is not proof of a working election. Candidate leaseName is immutable. No status subresource or ordinary user action is implied.</EditorHelp>
    </EditorSection> : <>
      <EditorSection title="Election participant">
        <div className="coordination-grid">{candidateFields.slice(0, 4).map(([name, label, help]) =>
          <EditorField key={name} label={label} help={help} value={scalarText(draft.get(['spec', name]))} readOnly onChange={() => {}} />)}</div>
        {namespace ? <LeaseReference key={`${draft.sessionID}/${namespace}/${retry}`} form={props} namespace={namespace} />
          : <div role="status">Lease reference lookup requires a namespace.</div>}
        <Button size="sm" variant="ghost" onClick={() => setRetry(value => value + 1)} disabled={!namespace}>Refresh Lease reference</Button>
      </EditorSection>
      <details className="coordination-advanced"><summary>Ping and response</summary>
        <div className="coordination-grid">{candidateFields.slice(4).map(([name, label, help]) =>
          <EditorField key={name} label={label} help={help} value={scalarText(draft.get(['spec', name]))} readOnly onChange={() => {}} />)}</div>
      </details>
    </>}
  </div>;
}

function LeaseReference({ form, namespace }: { form: ResourceEditorFormProps; namespace: string }) {
  const result = useEditorReferences(form, { group: 'coordination.k8s.io', version: 'v1', resource: 'leases', namespace, projection: 'metadata' });
  const leaseName = scalarText(form.draft.get(['spec', 'leaseName']));
  const found = result.status === 'ready' && result.items.some(item => item.name === leaseName && (item.namespace === undefined || item.namespace === namespace));
  const message = result.status === 'loading' ? 'Looking up Lease reference…'
    : result.status === 'denied' ? 'Lease reference access denied.'
      : result.status === 'absent' ? 'Lease API not served.'
        : result.status === 'unavailable' ? 'Lease reference lookup unavailable.'
          : result.status !== 'ready' ? 'Lease reference lookup unavailable.'
            : result.items.length === 0 ? 'No Leases returned in this namespace.'
              : found ? 'Lease name found. Election operation is not verified.' : 'Lease name unresolved. Recorded reference retained.';
  return <div role="status" aria-label="Lease reference" data-state={result.status} className="coordination-reference">{message}</div>;
}
