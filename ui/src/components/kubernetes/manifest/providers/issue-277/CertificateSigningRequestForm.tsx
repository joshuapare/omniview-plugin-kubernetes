import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useEffect, useRef, useState } from 'react';
import { EditorChoice, EditorHelp, EditorSection, patchFields, useFieldValidity } from '../../editor-controls';
import { approvalBlocked, lifetimeError, signerError, usages } from './domain';
import { BufferedField, Lifecycle, MaterialUpload } from './fields';

export default function CertificateSigningRequestForm(form: ResourceEditorFormProps) {
  const report = useFieldValidity(form);
  const locked = form.context.intent !== 'create' || form.context.capabilities.create !== 'available';
  const [usage, setUsage] = useState('');
  const selected = form.draft.get(['spec', 'usages']);
  const rows = Array.isArray(selected) ? selected : [];
  if (form.section === 'lifecycle') return <EditorSection title="Approval and signing"><Lifecycle form={form} /><Approval form={form} /></EditorSection>;
  return <EditorSection title={form.context.intent !== 'create' ? 'Immutable certificate request' : 'Certificate request'}>
    <div className="cert-editor-stack">
      {locked && <p role="note">{form.context.intent === 'create' ? `Creation access: ${form.context.capabilities.create}.` : 'Request specification is immutable. Signing and approval use separate subresources.'}</p>}
      <BufferedField form={form} report={report} label="Signer" path={['spec', 'signerName']} locked={locked} validate={value => signerError(value) || (value === 'kubernetes.io/legacy-unknown' ? 'The legacy-unknown signer is forbidden in v1.' : null)} help="Choose the exact qualified signer. Availability of this API does not prove signer support. Signers control subjects, usages, trust distribution and certificate lifetime." />
      <MaterialUpload form={form} kind="request" locked={locked} report={report} />
      <EditorSection title="Key usages"><div className="cert-editor-stack">
        {rows.map((item, index) => <div key={index} className="cert-editor-row"><span>{typeof item === 'string' && usages.some(value => value === item) ? item : 'Unsupported usage'}</span><Button size="sm" variant="ghost" aria-label={`Remove usage ${index + 1}`} disabled={form.disabled || locked} onClick={() => {
          const result = patchFields(form, [{ op: 'remove', path: ['spec', 'usages', index] }]);
          report('usages', result.status === 'accepted' ? null : 'Usage was not removed.');
        }}>Remove</Button></div>)}
        {!locked && <div className="cert-editor-row"><EditorChoice label="Add key usage" value={usage} disabled={form.disabled} onChange={next => { setUsage(next); report('usages', next ? 'Add or clear the pending key usage.' : null); }} options={[{ value: '', label: 'Choose usage…' }, ...usages.filter(item => !rows.includes(item)).map(item => ({ value: item, label: item }))]} help="Select usages required by the workload and allowed by the signer. No defaults are inserted." /><Button size="sm" variant="outline" disabled={form.disabled || !usage || rows.includes(usage)} onClick={() => {
          const result = patchFields(form, rows.length || form.draft.has(['spec', 'usages']) ? [{ op: 'insert', path: ['spec', 'usages'], index: rows.length, value: usage }] : [{ op: 'set', path: ['spec', 'usages'], value: [usage] }]);
          report('usages', result.status === 'accepted' ? null : 'Usage was not added.');
          if (result.status === 'accepted') setUsage('');
        }}>Add usage</Button></div>}
      </div></EditorSection>
      <details><summary>Optional lifetime</summary><BufferedField form={form} report={report} label="Requested lifetime (seconds)" path={['spec', 'expirationSeconds']} optional numeric locked={locked} validate={lifetimeError} help="600–2147483647 seconds. Omit to use signer policy. The signer may issue a different duration." /></details>
      {!locked && <p role="note">Creation fixes the request specification. Issuance is asynchronous and not guaranteed.</p>}
    </div>
  </EditorSection>;
}
function Approval({ form }: { form: ResourceEditorFormProps }) {
  const [decision, setDecision] = useState<'Approved' | 'Denied' | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [settled, setSettled] = useState(false);
  const sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const identity = `${form.draft.sessionID}:${form.draft.revision}:${form.context.name}:${form.context.resourceVersion}`;
  useEffect(() => { sequence.current++; abort.current?.abort(); setDecision(null); setBusy(false); setSettled(false); setFeedback(''); return () => { sequence.current++; abort.current?.abort(); }; }, [identity]);
  const capability = form.context.capabilities.actions['kubernetes.csr-approval.v1'] ?? 'unknown';
  const terminal = approvalBlocked(form.draft);
  const enabled = form.context.intent !== 'create' && !!form.context.name && !!form.context.resourceVersion && capability === 'available' && !terminal && !busy && !settled && !form.disabled;
  return <div className="cert-editor-stack"><div className="cert-editor-row"><strong>Approval</strong><EditorHelp label="Approval">Requires update on certificatesigningrequests/approval and approve on the named signer. Approved and Denied are terminal and mutually exclusive. This does not issue a certificate.</EditorHelp></div>
    {terminal ? <span>Approval is closed for this request.</span> : <span>Approval access: {capability}</span>}
    <div className="cert-editor-row"><Button size="sm" variant="outline" disabled={!enabled} onClick={() => setDecision('Approved')}>Review approval</Button><Button size="sm" variant="outline" disabled={!enabled} onClick={() => setDecision('Denied')}>Review denial</Button></div>
    {decision && <section className="cert-editor-review" role="region" aria-label="Approval review"><strong>{decision === 'Approved' ? 'Approve' : 'Deny'} {form.context.name}?</strong><p>{decision === 'Approved' ? 'Allows the signer to issue a certificate. Approval is not issuance.' : 'Permanently denies this request. This does not revoke previously issued certificates.'}</p><div className="cert-editor-row"><Button size="sm" variant="outline" disabled={!enabled} onClick={() => {
      if (!enabled) return;
      const controller = new AbortController(); abort.current = controller;
      const generation = ++sequence.current;
      setBusy(true);
      void form.actions.execute({ protocol: 'kubernetes.csr-approval.v1', sessionID: form.draft.sessionID, generation, signal: controller.signal, input: { apiVersion: 'certificates.k8s.io/v1', kind: 'CertificateSigningRequest', metadata: { name: form.context.name, resourceVersion: form.context.resourceVersion }, status: { conditions: [{ type: decision, status: 'True', reason: decision === 'Approved' ? 'OmniviewApproval' : 'OmniviewDenial' }] } } }).then(result => {
        if (generation !== sequence.current || controller.signal.aborted) return;
        setSettled(true);
        setFeedback(result.status === 'ready' ? 'Approval update accepted. Refresh to inspect signer status; issuance is not implied.' : `Approval update ${result.status}. Request source is unchanged.`);
        setDecision(null);
      }).catch(() => { if (generation === sequence.current && !controller.signal.aborted) { setSettled(true); setFeedback('Approval transport unavailable. Refresh before retrying.'); } }).finally(() => { if (generation === sequence.current) setBusy(false); });
    }}>Confirm {decision === 'Approved' ? 'approval' : 'denial'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setDecision(null)}>Cancel</Button></div></section>}
    {busy && <Button size="sm" variant="ghost" onClick={() => { abort.current?.abort(); sequence.current++; setBusy(false); setSettled(true); setDecision(null); setFeedback('Request cancelled locally. Refresh to check server state before retrying.'); }}>Cancel waiting</Button>}
    {feedback && <p role="status">{feedback}</p>}
  </div>;
}
