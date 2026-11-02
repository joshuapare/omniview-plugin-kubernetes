import type { ResourceEditorFormProps } from '@omniviewdev/runtime';

import { EditorHelp, EditorSection, scalarText } from '../../editor-controls';

import { Lifecycle } from './fields';

const bindingFields = [
  ['signerName', 'Signer'], ['podName', 'Pod'], ['podUID', 'Pod UID'],
  ['serviceAccountName', 'Service account'], ['serviceAccountUID', 'Service account UID'],
  ['nodeName', 'Node'], ['nodeUID', 'Node UID'], ['maxExpirationSeconds', 'Maximum lifetime (seconds)'],
] as const;
export default function PodCertificateRequestForm(form: ResourceEditorFormProps) {
  if (form.section === 'lifecycle') return <EditorSection title="Kubelet certificate lifecycle"><Lifecycle form={form} pod /></EditorSection>;
  return <EditorSection title="Kubelet-owned certificate request"><div className="cert-editor-stack"><p role="note">Kubelet owns this request. Specification is immutable; signer owns status.</p>
    <dl className="cert-editor-details">{bindingFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{scalarText(form.draft.get(['spec', key])) || 'Not reported'}</dd></div>)}</dl>
    <details><summary>Material and policy</summary><dl className="cert-editor-details">{[['pkixPublicKey', 'Public key'], ['proofOfPossession', 'Proof of possession'], ['unverifiedUserAnnotations', 'Signer annotations']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{form.draft.has(['spec', key]) ? 'Present · hidden' : 'Not reported'}</dd></div>)}</dl><EditorHelp label="Kubelet ownership">No ordinary Create, Edit, Approve or Retry-Issue operation. PodCertificateRequest is beta and default-off in Kubernetes 1.35. Discovery does not establish signer availability. The kubelet manages projected-volume renewal.</EditorHelp></details>
  </div></EditorSection>;
}
