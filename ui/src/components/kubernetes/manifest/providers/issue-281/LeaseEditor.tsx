import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useEffect, useState } from 'react';

import { EditorChoice, EditorField, EditorHelp, EditorSection, scalarText } from '../../editor-controls';

import { coordinationShapeError, leaseFields, leaseWriteBoundary, parseLeaseField, readAvailability, type LeaseField } from './coordination';
import './coordination.css';

export default function LeaseEditor(props: ResourceEditorFormProps) {
  const unavailable = readAvailability(props.context);
  if (unavailable) return <div role="status">{unavailable}</div>;
  const unsupported = coordinationShapeError(props.draft);
  if (unsupported) return <div role="status">{unsupported}</div>;
  return <LeaseSession key={props.draft.sessionID} {...props} />;
}

function LeaseSession(props: ResourceEditorFormProps) {
  const { context, draft, section, disabled, patch, onValidityChange } = props;
  const boundary = leaseWriteBoundary(draft, context);
  const readOnly = boundary !== null;
  const [acknowledged, setAcknowledged] = useState(false);
  const [local, setLocal] = useState<Record<string, { text: string; error: string }>>({});
  const error = readOnly ? null : Object.values(local)[0]?.error ?? (!acknowledged ? 'Confirm the coordination change before review.' : null);
  useEffect(() => { onValidityChange(error); }, [error, onValidityChange]);

  function change(field: LeaseField, text: string) {
    if (disabled || readOnly) return;
    const parsed = parseLeaseField(field, text);
    let failure: string | null = parsed.valid ? null : parsed.error;
    if (parsed.valid) {
      const result = patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations: [parsed.value === undefined
        ? { op: 'remove', path: ['spec', field.name] }
        : { op: 'set', path: ['spec', field.name], value: parsed.value }] });
      if (result.status !== 'accepted') failure = result.status === 'stale' ? 'Draft changed. Retry this field.' : 'This change could not be applied. Source remains unchanged.';
    }
    const next = { ...local };
    if (failure) next[field.name] = { text, error: failure };
    else delete next[field.name];
    setLocal(next);
    onValidityChange(Object.values(next)[0]?.error ?? (!acknowledged ? 'Confirm the coordination change before review.' : null));
  }

  function fieldControl(field: LeaseField) {
    const pending = local[field.name];
    return <EditorField key={field.name} label={field.label}
      value={pending?.text ?? scalarText(draft.get(['spec', field.name]))}
      onChange={text => change(field, text)} readOnly={readOnly} disabled={disabled}
      error={readOnly ? null : pending?.error} help={field.help}
      inputMode={field.kind === 'positive' || field.kind === 'counter' ? 'numeric' : 'text'} />;
  }

  return <div className="coordination-editor">
    {boundary && <div role="status" className="coordination-boundary">{boundary}</div>}
    {section === 'ownership' ? <EditorSection title="Ownership and availability">
      <dl className="coordination-facts">
        <dt>Writer policy</dt><dd>{context.ownership?.status ?? 'unknown'}</dd>
        <dt>API</dt><dd>{context.group}/{context.version}</dd>
        <dt>Resource</dt><dd>{context.resource} · Namespaced</dd>
        <dt>Create / update</dt><dd>{context.capabilities.create} / {context.capabilities.update}</dd>
        <dt>Schema</dt><dd>{context.schema.status}</dd>
        <dt>CoordinatedLeaderElection</dt><dd>{context.discovery.features.CoordinatedLeaderElection ?? 'unknown'}</dd>
      </dl>
      <EditorHelp label="Lease ownership">A trusted host policy must establish an application coordination contract. An acknowledgement, owner reference, managed-field entry, API schema or successful read does not establish exclusive ownership. Heartbeat and election writers retain their records. API serving, authorization, feature gates and controller operation are independent.</EditorHelp>
    </EditorSection> : <>
      <EditorSection title={readOnly ? 'Holder and renewal' : 'Application coordination'}>
        {!readOnly && <>
          <div className="coordination-boundary">Changing coordination fields can transfer ownership or disrupt contenders.</div>
          <EditorChoice label="Coordination change" value={acknowledged ? 'confirmed' : 'unconfirmed'} disabled={disabled}
            onChange={value => setAcknowledged(value === 'confirmed')}
            options={[{ value: 'unconfirmed', label: 'Not confirmed' }, { value: 'confirmed', label: 'I understand the coordination change' }]}
            help="This confirms the consequence only. It does not grant permission or establish application ownership, and writes no manifest field." />
        </>}
        <div className="coordination-grid">{leaseFields.slice(0, 2).map(fieldControl)}</div>
      </EditorSection>
      <details className="coordination-advanced"><summary>Timing and transitions</summary>
        <div className="coordination-grid">{leaseFields.slice(2).map(fieldControl)}</div>
      </details>
      {(draft.has(['spec', 'strategy']) || draft.has(['spec', 'preferredHolder'])) && <EditorSection title="Coordinated election">
        <div className="coordination-grid">
          <EditorField label="Selection strategy" value={scalarText(draft.get(['spec', 'strategy']))} readOnly onChange={() => {}}
            help="OldestEmulationVersion or a qualified custom strategy. This value does not prove that a coordinator is operating." />
          <EditorField label="Preferred holder" value={scalarText(draft.get(['spec', 'preferredHolder']))} readOnly onChange={() => {}}
            help="A writer-owned signal asking the current holder to yield. Requires a strategy; this is not a takeover control." />
        </div>
      </EditorSection>}
    </>}
  </div>;
}
