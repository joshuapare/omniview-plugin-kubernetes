import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { Choice } from '../../ResourceFormFields';
import { EditorHelp } from '../../editor-controls';
import { AdmissionPanel, Advanced, Conditions, List, Matching, Pick, Reference, Repeat, Scalar, boundedInteger, useAdmission } from './AdmissionFields';
import { clientBranch, isMutating, text, validWebhookURL } from './model';

function Client({ path }: { path: ResourceEditorPath }) {
  const { form, commit, validity, disabled } = useAdmission();
  const branch = form.draft.has([...path, 'url']) ? 'url' : 'service';
  return <>
    <Choice label="Webhook endpoint" value={branch} options={[{ value: 'service', label: 'Cluster Service' }, { value: 'url', label: 'External HTTPS URL' }]} disabled={disabled} help="Choose exactly one client. Changing endpoint can redirect admission requests. CA data remains untouched." onChange={value => validity(JSON.stringify(path), commit(clientBranch(path, value === 'url' ? 'url' : 'service')))} />
    {branch === 'service' ? <><Scalar path={[...path, 'service', 'namespace']} label="Service namespace" required /><Reference path={[...path, 'service', 'name']} label="Service" group="" version="v1" resource="services" namespace={text(form.draft.get([...path, 'service', 'namespace'])) || undefined} /><div className="admission-grid"><Scalar path={[...path, 'service', 'port']} label="Service port" parse={boundedInteger(1, 65535)} help="Omitted uses port 443." /><Scalar path={[...path, 'service', 'path']} label="Service path" parse={value => { if (!value.startsWith('/')) throw new Error('Path must start with /.'); return value; }} /></div></> : <Scalar path={[...path, 'url']} label="HTTPS URL" required publicURL parse={value => { if (!validWebhookURL(value)) throw new Error('Use HTTPS without credentials, query or fragment.'); return value; }} help="HTTPS only; no credentials, query or fragment. Use Service for in-cluster endpoints." />}
    <div className="admission-inline"><span>CA bundle: {form.draft.has([...path, 'caBundle']) ? 'configured · masked · preserved' : 'omitted · API server system roots'}</span><EditorHelp label="Webhook trust">The form never reads, replaces or reveals CA material. Trust and reachability are not verified here.</EditorHelp></div>
  </>;
}
export default function WebhookEditor(form: ResourceEditorFormProps) {
  const mutation = isMutating(form.context.kind);
  return <AdmissionPanel key={form.draft.sessionID} form={form}>
    <p className="admission-consequence">{mutation ? 'Matching requests may be changed before admission.' : 'Matching requests may be rejected before admission.'}</p>
    <Repeat path={['webhooks']} label="Webhooks" initial={{ name: '', clientConfig: { service: { namespace: '', name: '' } }, sideEffects: 'None', admissionReviewVersions: ['v1'] }}>{path => <>
      <Scalar path={[...path, 'name']} label="Webhook DNS name" required help="Unique fully qualified webhook name with at least three DNS segments." />
      {(form.section === 'configuration' || !form.section) && <><Client path={[...path, 'clientConfig']} /><div className="admission-grid"><Pick path={[...path, 'sideEffects']} label="Side effects" options={['None', 'NoneOnDryRun']} required help="NoneOnDryRun requires the webhook to suppress side effects for dry-run requests." /><List path={[...path, 'admissionReviewVersions']} label="AdmissionReview versions" required help="Ordered protocol preference. API server and webhook must share a version." /></div><Advanced label="Failure, timeout and reinvocation"><div className="admission-grid"><Pick path={[...path, 'failurePolicy']} label="Call failure behavior" options={['Fail', 'Ignore']} help="Fail rejects requests on call errors. Ignore bypasses this webhook on call errors." /><Scalar path={[...path, 'timeoutSeconds']} label="Timeout (seconds)" parse={boundedInteger(1, 30)} help="1–30 seconds. Omitted uses API default of 10 seconds." />{mutation && <Pick path={[...path, 'reinvocationPolicy']} label="Reinvocation" options={['Never', 'IfNeeded']} help="IfNeeded may call this webhook again after other mutations. Ordering is not guaranteed." />}</div></Advanced></>}
      {form.section === 'matching' && <><Matching path={path} webhook /><Conditions path={[...path, 'matchConditions']} /></>}
    </>}</Repeat>
  </AdmissionPanel>;
}
