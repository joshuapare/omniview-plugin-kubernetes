import { CertificateExtras, HTTPChallenge, UnionChoice } from './StructuredFields';
import { ControllerActions } from './ControllerActions';
import { useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection, ExactValueField, ReferencePicker, scalarText, useFieldValidity } from '../../editor-controls';
import { backends, durationSeconds } from './domain';

function Fields({ form, fields }: { form: ResourceEditorFormProps; fields: readonly [string, string][] }) {
  const [error, setError] = useState<string | null>(null);
  return <>{fields.map(([label, field]) => {
    const props = { label, value: scalarText(form.draft.get(['spec', ...field.split('.')])), disabled: form.disabled, onChange: (value: string) => {
      const path = ['spec', ...field.split('.')];
      const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [value ? { op: 'set', path, value } : { op: 'remove', path }] });
      setError(result.status === 'accepted' ? null : result.message);
    } };
    const secretReference = /secret/i.test(label) && !/key|entry/i.test(label);
    return secretReference && form.context.scope === 'Namespaced'
      ? <ReferencePicker key={field} {...props} form={form} query={{ group: '', version: 'v1', resource: 'secrets', namespace: form.context.namespace, projection: 'metadata' }} />
      : <EditorField key={field} {...props} />;
  })}{error && <p role="alert">{error}</p>}</>;
}
function Choice({ form, label, path, options }: { form: ResourceEditorFormProps; label: string; path: ResourceEditorPath; options: readonly string[] }) {
  const [error, setError] = useState<string | null>(null);
  return <EditorChoice label={label} value={scalarText(form.draft.get(path))} options={['', ...options].map(value => ({ value, label: value || 'Unspecified' }))} disabled={form.disabled} error={error} onChange={value => {
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [value ? { op: 'set', path, value } : { op: 'remove', path }] });
    setError(result.status === 'accepted' ? null : result.message);
  }} />;
}
function StringRows({ form, label, path, report }: { form: ResourceEditorFormProps; label: string; path: ResourceEditorPath; report: (field: string, error: string | null) => void }) {
  const value = form.draft.get(path);
  const rows = Array.isArray(value) ? value : [];
  const [pending, setPending] = useState('');
  const [error, setError] = useState<string | null>(null);
  function apply(operations: ResourceEditorPatch[]) {
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
    setError(result.status === 'accepted' ? null : result.message);
    if (result.status === 'accepted') setPending('');
  }
  return <EditorSection title={label}>{rows.map((row, index) => <div key={index}>
    <ExactValueField label={`${label} ${index + 1}`} value={scalarText(row)} identity={`${form.draft.sessionID}/${path.join('/')}/${index}`} disabled={form.disabled} parse={text => text.trim() ? { valid: true, value: text } : { valid: false, error: 'Enter a value or remove this row.' }} onValidityChange={message => report(`${path.join('/')}/${index}`, message)} onCommit={value => {
      const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [{ op: 'set', path: [...path, index], value }] });
      return result.status === 'accepted' ? null : result.message;
    }} />
    <button type="button" disabled={form.disabled} onClick={() => { apply([{ op: 'remove', path: [...path, index] }]); report(`${path.join('/')}/${index}`, null); }}>Remove {label} {index + 1}</button>
  </div>)}<EditorField label={`New ${label}`} value={pending} onChange={setPending} disabled={form.disabled} /><button type="button" disabled={form.disabled || !pending.trim()} onClick={() => apply(form.draft.has(path) ? [{ op: 'insert', path, index: rows.length, value: pending }] : [{ op: 'set', path, value: [pending] }])}>Add {label}</button>{error && <span role="alert">{error}</span>}</EditorSection>;
}
export function Certificate(form: ResourceEditorFormProps) {
  const report = useFieldValidity(form);
  const [error, setError] = useState<string | null>(null);
  if (form.section === 'observed' || form.context.intent === 'action') return <Observed form={form} />;
  const kind = scalarText(form.draft.get(['spec', 'issuerRef', 'kind'])) || 'Issuer';
  return <EditorSection title="Certificate"><CertificateExtras form={form} />{form.context.intent === 'edit' && <p>Identity and key changes may trigger reissuance.</p>}<Fields form={form} fields={[["Output Secret", 'secretName']]} /><Choice form={form} label="Issuer scope" path={['spec', 'issuerRef', 'kind']} options={['Issuer', 'ClusterIssuer']} /><ReferencePicker form={form} label="Issuer" query={{ group: 'cert-manager.io', version: 'v1', resource: kind === 'ClusterIssuer' ? 'clusterissuers' : 'issuers', namespace: kind === 'ClusterIssuer' ? undefined : form.context.namespace }} value={scalarText(form.draft.get(['spec', 'issuerRef', 'name']))} error={error} onChange={value => {
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [{ op: 'set', path: ['spec', 'issuerRef', 'name'], value }] });
    setError(result.status === 'accepted' ? null : result.message);
  }} />{(['dnsNames', 'ipAddresses', 'uris', 'emailAddresses'] as const).map((key, i) => <StringRows key={key} form={form} report={report} label={['DNS name', 'IP address', 'URI', 'Email'][i]} path={['spec', key]} />)}<details><summary>Validity and renewal</summary>{['duration', 'renewBefore'].map(key => <ExactValueField key={key} label={key === 'duration' ? 'Requested duration' : 'Renew before'} help="Go duration units: h, m, s. Omit to use controller policy." value={scalarText(form.draft.get(['spec', key]))} identity={`${form.draft.sessionID}/${key}`} disabled={form.disabled} parse={text => !text || durationSeconds(text) !== null ? { valid: true, value: text } : { valid: false, error: 'Enter a Go duration.' }} onValidityChange={message => report(key, message)} onCommit={value => {
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [value ? { op: 'set', path: ['spec', key], value } : { op: 'remove', path: ['spec', key] }] });
    return result.status === 'accepted' ? null : result.message;
  }} />)}
  <ExactValueField label="Renew before percentage" value={scalarText(form.draft.get(['spec', 'renewBeforePercentage']))} identity={`${form.draft.sessionID}/percent`} disabled={form.disabled} parse={text => !text ? { valid: true, value: '' } : /^([1-9]|[1-9][0-9])$/.test(text) ? { valid: true, value: Number(text) } : { valid: false, error: 'Enter 1–99.' }} onValidityChange={message => report('percentage', message)} onCommit={value => {
    const path = ['spec', 'renewBeforePercentage'];
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [value === '' ? { op: 'remove', path } : { op: 'set', path, value }] });
    return result.status === 'accepted' ? null : result.message;
  }} />
  </details>
  <details><summary>Subject and private key</summary>
    <Fields form={form} fields={[["Common name", 'commonName'], ['Literal subject', 'literalSubject']]} />
    <Choice form={form} label="Key algorithm" path={['spec', 'privateKey', 'algorithm']} options={['RSA', 'ECDSA', 'Ed25519']} />
    <Choice form={form} label="Key encoding" path={['spec', 'privateKey', 'encoding']} options={['PKCS1', 'PKCS8']} />
    <Choice form={form} label="Rotation policy" path={['spec', 'privateKey', 'rotationPolicy']} options={['Always', 'Never']} />
    <ExactValueField label="Key size (bits)" value={scalarText(form.draft.get(['spec', 'privateKey', 'size']))} identity={`${form.draft.sessionID}/size`} disabled={form.disabled} parse={text => !text ? { valid: true, value: '' } : /^(256|384|521|2048|4096|8192)$/.test(text) ? { valid: true, value: Number(text) } : { valid: false, error: 'Choose valid RSA or ECDSA size.' }} onValidityChange={message => report('size', message)} onCommit={value => {
      const path = ['spec', 'privateKey', 'size'];
      const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [value === '' ? { op: 'remove', path } : { op: 'set', path, value }] });
      return result.status === 'accepted' ? null : result.message;
    }} />
  </details></EditorSection>;
}
export function Issuer(form: ResourceEditorFormProps) {
  const report = useFieldValidity(form);
  const [error, setError] = useState<string | null>(null);
  const active = backends.find(key => form.draft.has(['spec', key]));
  if (form.section === 'observed') return <Observed form={form} />;
  return <EditorSection title={form.context.kind}>{form.context.scope === 'Cluster' && <p>Credential namespace follows controller configuration; no namespace is assumed.</p>}<EditorChoice label="Signing backend" value={active ?? ''} disabled={form.disabled} options={[{ value: '', label: 'Choose backend' }, ...backends.map(value => ({ value, label: value }))]} error={error} help="Changing backend removes its previous configuration. Review trust changes before saving." onChange={value => {
    if (!value || value === active) return;
    if (active && !window.confirm('Replace the configured signing backend? Existing backend settings will be removed.')) return;
    const operations: ResourceEditorPatch[] = backends.filter(key => form.draft.has(['spec', key])).map(key => ({ op: 'remove', path: ['spec', key] }));
    operations.push({ op: 'set', path: ['spec', value], value: {} });
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
    setError(result.status === 'accepted' ? null : result.message);
  }} />
  {active === 'ca' && <Fields form={form} fields={[["Signing Secret", 'ca.secretName']]} />}
  {active === 'selfSigned' && <><p>Self-signed certificates do not establish external trust.</p><StringRows form={form} report={report} label="CRL distribution point" path={['spec', 'selfSigned', 'crlDistributionPoints']} /></>}
  {active === 'acme' && <><Fields form={form} fields={[["Directory URL", 'acme.server'], ['Contact email', 'acme.email'], ['Account Secret', 'acme.privateKeySecretRef.name']]} /><HTTPChallenge form={form} /></>}
  {active === 'vault' && <>
    <Fields form={form} fields={[["Vault server", 'vault.server'], ['Signing path', 'vault.path'], ['Vault namespace', 'vault.namespace'], ['CA Secret', 'vault.caBundleSecretRef.name'], ['CA Secret key', 'vault.caBundleSecretRef.key']]} />
    <UnionChoice form={form} label="Vault authentication" path={['spec', 'vault', 'auth']} choices={['kubernetes', 'tokenSecretRef', 'appRole', 'clientCertificate']} />
    {form.draft.has(['spec', 'vault', 'auth', 'kubernetes']) && <Fields form={form} fields={[[ 'Service account', 'vault.auth.kubernetes.serviceAccountRef.name'], ['Role', 'vault.auth.kubernetes.role'], ['Mount path', 'vault.auth.kubernetes.mountPath']]} />}
    {form.draft.has(['spec', 'vault', 'auth', 'tokenSecretRef']) && <Fields form={form} fields={[[ 'Token Secret', 'vault.auth.tokenSecretRef.name'], ['Token key', 'vault.auth.tokenSecretRef.key']]} />}
    {form.draft.has(['spec', 'vault', 'auth', 'appRole']) && <Fields form={form} fields={[[ 'AppRole path', 'vault.auth.appRole.path'], ['Role ID', 'vault.auth.appRole.roleId'], ['Secret name', 'vault.auth.appRole.secretRef.name'], ['Secret key', 'vault.auth.appRole.secretRef.key']]} />}
    {form.draft.has(['spec', 'vault', 'auth', 'clientCertificate']) && <Fields form={form} fields={[[ 'Mount path', 'vault.auth.clientCertificate.mountPath'], ['Client certificate Secret', 'vault.clientCertSecretRef.name'], ['Certificate key', 'vault.clientCertSecretRef.key'], ['Client key Secret', 'vault.clientKeySecretRef.name'], ['Private key entry', 'vault.clientKeySecretRef.key']]} />}
  </>}
  {active === 'venafi' && <>
    <Fields form={form} fields={[["Policy zone", 'venafi.zone']]} />
    <UnionChoice form={form} label="Venafi platform" path={['spec', 'venafi']} choices={['tpp', 'cloud']} />
    {form.draft.has(['spec', 'venafi', 'tpp']) && <Fields form={form} fields={[["TPP URL", 'venafi.tpp.url'], ['Credentials Secret', 'venafi.tpp.credentialsRef.name']]} />}
    {form.draft.has(['spec', 'venafi', 'cloud']) && <Fields form={form} fields={[["Cloud URL", 'venafi.cloud.url'], ['API token Secret', 'venafi.cloud.apiTokenSecretRef.name'], ['API token key', 'venafi.cloud.apiTokenSecretRef.key']]} />}
  </>}
  </EditorSection>;
}
export function Observed({ form }: { form: ResourceEditorFormProps }) {
  const conditions = form.draft.get(['status', 'conditions']);
  return <EditorSection title="Observed issuance"><Fields form={{ ...form, disabled: true }} fields={[["Issuer", 'issuerRef.name']]} /><dl>{['notBefore', 'notAfter', 'renewalTime', 'failureTime', 'lastFailureTime', 'revision'].map(key => <div key={key}><dt>{key}</dt><dd>{scalarText(form.draft.get(['status', key])) || 'Not reported'}</dd></div>)}</dl>{Array.isArray(conditions) && conditions.filter(condition => condition && typeof condition === 'object').map((condition, index) => { const item = condition as Record<string, unknown>; return <p key={index}>{scalarText(item.type)}: {scalarText(item.status)} · {scalarText(item.reason)} · {scalarText(item.lastTransitionTime)}</p>; })}<p>Certificate and CA bytes stay masked. Status is controller-owned.</p>{['Certificate', 'CertificateRequest'].includes(form.context.kind) && <ControllerActions form={form} />}</EditorSection>;
}
export function CertificateRequest(form: ResourceEditorFormProps) {
  const owners = form.draft.get(['metadata', 'ownerReferences']);
  const ownerRows: readonly unknown[] = Array.isArray(owners) ? owners : [];
  const inspection = { ...form, disabled: true };
  return <><p>Immutable one-shot request. Controller-owned requests must be managed through their Certificate.</p>
    <Fields form={inspection} fields={[['Issuer kind', 'issuerRef.kind'], ['Issuer group', 'issuerRef.group'], ['Requested duration', 'duration']]} />
    <EditorSection title="Ownership">{ownerRows.length ? ownerRows.map((owner, index) => owner !== null && typeof owner === 'object' ? <p key={index}>{scalarText('kind' in owner ? owner.kind : undefined)} / {scalarText('name' in owner ? owner.name : undefined)}{'controller' in owner && owner.controller === true ? ' · controller' : ''}</p> : null) : <span>No owner reference reported.</span>}</EditorSection>
    <Observed form={form} />
    <details><summary>Advanced CSR submission</summary><p>Persistent CSR submission requires a separate explicit creation workflow. This inspection interface does not submit or alter immutable request bytes.</p></details>
  </>;
}
