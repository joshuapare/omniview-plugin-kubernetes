import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useEffect, useState, type ReactNode } from 'react';
import { EditorHelp, EditorSection } from '../../editor-controls';
import { summarizeAdmissionReview } from './admissionReview';
import styles from './AdmissionReviewInspector.module.css';

function Readout({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <div className={styles.readout}><dt>{label}{help && <EditorHelp label={label}>{help}</EditorHelp>}</dt><dd>{children}</dd></div>;
}

export default function AdmissionReviewInspector({ draft, context, section, onValidityChange }: ResourceEditorFormProps) {
  const summary = summarizeAdmissionReview(draft);
  const [original, setOriginal] = useState(false);
  const identity = JSON.stringify([draft.sessionID, draft.revision]);
  const [checkedIdentity, setCheckedIdentity] = useState<string | null>(null);
  const checked = checkedIdentity === identity;
  const error = summary.issues.length ? 'Exchange cannot be correlated safely. Inspect the reported issues.' : null;
  useEffect(() => { onValidityChange(error); }, [error, onValidityChange]);
  const correlation = !summary.request || !summary.response ? 'Both request and response are required for correlation' : summary.correlated ? 'Request and response UIDs match' : 'UID mismatch';
  if (!summary.supported) return <div className={styles.root} role="status">Unsupported AdmissionReview envelope. Source remains untouched and sensitive content stays withheld.</div>;
  if (!summary.request && !summary.response) return <div className={styles.root}><EditorSection title="No exchange supplied"><p role="status">No admission capture is attached.</p><EditorHelp label="Capture availability">AdmissionReview is a webhook protocol, not a Kubernetes resource. This installation has no capture transport. No cluster discovery, resource read, replay, or webhook call is attempted.</EditorHelp></EditorSection></div>;
  return <div className={styles.root}>
    <div className={styles.banner}>Protocol inspection only · Nothing is sent or replayed.<EditorHelp label="Protocol ownership">The API server owns the request; the webhook owns the response. The inspector owns neither. AdmissionReview has no persisted resource, plural endpoint, or namespace scope. Retained v1beta1 schema does not prove webhook negotiation support.</EditorHelp></div>
    {summary.issues.length > 0 && <ul className={styles.errors} role="alert">{summary.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    {(section === 'request' || !['response', 'payloads', 'review'].includes(section)) && <EditorSection title="API-server request">
      {!summary.request ? <p role="status">No request supplied. A response alone cannot establish correlation.</p> : <>
        <dl className={styles.grid}>
          <Readout label="Protocol">{summary.version}</Readout>
          <Readout label="Operation" help="CREATE, UPDATE, DELETE, or CONNECT describes the reviewed operation. It is not an editor action.">{summary.operation}</Readout>
          <Readout label="Request UID" help="This UID correlates one API-server/webhook round trip, not the original user request.">{summary.requestUID}</Readout>
          <Readout label="Dry run">{summary.dryRun}</Readout>
          <Readout label="Converted kind">{summary.targetKind}</Readout>
          <Readout label="Converted resource">{summary.targetResource}</Readout>
          <Readout label="Subresource">{summary.subresource}</Readout>
          <Readout label="Object name" help="CREATE may have an empty name when the server will generate one. No name is invented here.">{summary.name}</Readout>
          <Readout label="Reviewed namespace" help="This describes the reviewed object, not an AdmissionReview namespace. Omission alone does not prove object scope.">{summary.namespace}</Readout>
        </dl>
        <Button size="sm" variant="ghost" aria-expanded={original} aria-controls="admission-original-request" onClick={() => setOriginal(value => !value)}>{original ? 'Hide original request' : 'Show original request'}</Button>
        {original && <dl id="admission-original-request" className={styles.grid}>
          <Readout label="Original kind" help="An equivalent webhook match may convert a request. Original fields remain independent of converted fields.">{summary.originalKind}</Readout>
          <Readout label="Original resource">{summary.originalResource}</Readout>
          <Readout label="Original subresource">{summary.originalSubresource}</Readout>
        </dl>}
      </>}
    </EditorSection>}
    {section === 'response' && <EditorSection title="Webhook response">
      {!summary.response ? <p role="status">No response supplied. No admission result is inferred.</p> : <>
        <dl className={styles.grid}>
          <Readout label="Webhook decision" help="Allowed means this webhook stage permitted the request. Other admission stages may still reject it.">{summary.decision}</Readout>
          <Readout label="Response UID">{summary.responseUID}</Readout>
          <Readout label="Correlation">{correlation}</Readout>
          <Readout label="Status" help="Status is ignored when allowed is true. Messages and details remain withheld.">{summary.status}</Readout>
          <Readout label="Status reason">{summary.reason}</Readout>
          <Readout label="HTTP status code">{summary.code}</Readout>
          <Readout label="Patch type" help="Patch bytes are never decoded, displayed, validated, or applied by this inspector.">{summary.patchType}</Readout>
          <Readout label="Patch bytes">{summary.payloads.find(item => item.path === 'response.patch')?.state}</Readout>
          <Readout label="Warnings" help="Warning contents are withheld. Kubernetes recommends short warnings and may truncate long or numerous entries.">{summary.payloads.find(item => item.path === 'response.warnings')?.state}</Readout>
          <Readout label="Audit annotations">{summary.payloads.find(item => item.path === 'response.auditAnnotations')?.state}</Readout>
        </dl>
      </>}
    </EditorSection>}
    {section === 'payloads' && <EditorSection title="Sensitive payload boundaries">
      <p className={styles.banner}>Values hidden · No raw reveal, import, export, or patch replay.</p>
      <dl className={styles.boundaries}>{summary.payloads.map(payload => <Readout key={payload.path} label={payload.label} help={`${payload.path} stays with its source owner. Presence is not permission to inspect contents.`}>{payload.state}</Readout>)}</dl>
    </EditorSection>}
    {section === 'review' && <EditorSection title="Exchange check">
      <dl className={styles.grid}>
        <Readout label="Connection">{context.connectionID ? 'Selected connection' : 'No connection selected'}</Readout>
        <Readout label="Destination">None · local inspection</Readout>
        <Readout label="Request owner">Kubernetes API server</Readout>
        <Readout label="Response owner">Webhook</Readout>
        <Readout label="Correlation">{correlation}</Readout>
        <Readout label="Decision">{summary.decision}</Readout>
        <Readout label="Persistence">Not a resource · no Create, Edit, or Save</Readout>
        <Readout label="Capture transport">Not provided by this installation</Readout>
      </dl>
      <Button size="sm" variant="outline" onClick={() => setCheckedIdentity(identity)}>Check exchange locally</Button>
      {checked && <p role="status">{summary.issues.length ? 'Exchange has reported issues. No replay or mutation was attempted.' : !summary.request || !summary.response ? 'Incomplete exchange. No admission outcome can be inferred.' : 'UIDs correlate. This does not prove final admission, webhook negotiation, or patch validity.'}</p>}
    </EditorSection>}
  </div>;
}
