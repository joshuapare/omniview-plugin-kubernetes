import type { ResourceEditorFormProps } from '@omniviewdev/runtime';

import { EditorHelp, EditorSection, useFieldValidity } from '../../editor-controls';

import { signerError, stringValue, trustNameError } from './domain';
import { BufferedField, MaterialUpload } from './fields';

export default function ClusterTrustBundleForm(form: ResourceEditorFormProps) {
  const report = useFieldValidity(form);
  const editing = form.context.intent !== 'create';
  const locked = form.disabled || form.context.intent === 'inspect' || form.context.ownership?.status === 'controller' || form.context.ownership?.status === 'system' || (editing ? form.context.capabilities.update : form.context.capabilities.create) !== 'available';
  const signer = stringValue(form.draft.get(['spec', 'signerName']));
  const nameError = trustNameError(stringValue(form.draft.get(['metadata', 'name'])), signer);
  const attest = signer ? form.context.capabilities.actions[`certificates.k8s.io/signers/${signer}/attest`] ?? 'unknown' : null;
  return <EditorSection title="Trust distribution"><div className="cert-editor-stack">
    {locked && <p role="note">{form.context.ownership?.status === 'controller' || form.context.ownership?.status === 'system' ? 'Controller-owned trust bundle · inspect only.' : `Write access: ${editing ? form.context.capabilities.update : form.context.capabilities.create}.`}</p>}
    <BufferedField form={form} report={report} label="Associated signer" path={['spec', 'signerName']} locked={editing || locked} optional validate={value => signerError(value, true)} help="Optional. Signer association is immutable after creation. Signer-bound writes require attest on the exact certificates.k8s.io signers name, in addition to object permissions." />
    {signer && <div className="cert-editor-row"><span>Signer attest access: {attest}</span><EditorHelp label="Signer authorization">Unknown does not mean allowed. Server admission checks attest on this exact signer for every write.</EditorHelp></div>}
    {nameError && <p role="alert">{nameError}</p>}
    <MaterialUpload form={form} kind="trust" locked={locked || attest === 'denied' || attest === 'absent'} report={report} />
    {!locked && <p role="note">Replacing trust anchors can break certificate validation for consumers.</p>}
    <details><summary>Trust and ownership</summary><dl className="cert-editor-details"><dt>API availability</dt><dd>{form.context.discovery.status}</dd><dt>Ownership</dt><dd>{form.context.ownership?.status ?? 'unknown'}</dd><dt>Projection</dt><dd>Not configured by this editor</dd></dl><EditorHelp label="Trust consumers">ClusterTrustBundle is gated. Pod projection uses a separate gate. This editor creates no volumes, companions or rollouts. Trust anchors are cluster-readable; never import private keys.</EditorHelp></details>
  </div></EditorSection>;
}
