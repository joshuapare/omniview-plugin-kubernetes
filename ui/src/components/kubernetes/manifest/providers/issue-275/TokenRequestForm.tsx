import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { useId, useState } from 'react';
import { EditorChoice, EditorField, EditorSection, useEditorReferences } from '../../editor-controls';
import { lifetimeError, text } from './authentication';
import { Audiences, AuthenticationResult, type Commit, type Validity, useAuthenticationForm } from './fields';

export default function TokenRequestForm(form: ResourceEditorFormProps) {
  return <TokenRequestSession key={form.draft.sessionID} {...form} />;
}
function TokenRequestSession(form: ResourceEditorFormProps) {
  const { commit, validity, patchError } = useAuthenticationForm(form);
  const canonical = form.draft.get(['spec', 'expirationSeconds']);
  const [partialLifetime, setPartialLifetime] = useState<string | null>(null);
  const accounts = useEditorReferences(form, { group: '', version: 'v1', resource: 'serviceaccounts', namespace: form.context.namespace, projection: 'metadata' });
  return <div className="auth275-form"><EditorSection title="ServiceAccount destination"><dl className="auth275-result"><dt>Namespace</dt><dd>{form.context.namespace || 'Choose namespace in destination'}</dd><dt>ServiceAccount</dt><dd>{form.context.name || 'Choose account in destination'}</dd></dl><div role="status">{accounts.status === 'ready' ? accounts.items.some(item => item.name === form.context.name) ? 'Account found' : 'Account unresolved · server verifies destination' : accounts.status === 'loading' ? 'Looking up account…' : accounts.status === 'denied' ? 'Account lookup denied · destination retained' : accounts.status === 'absent' ? 'Account API absent' : 'Account lookup unavailable · destination retained'}</div></EditorSection>
    <Audiences form={form} commit={commit} validity={validity} required />
    <details className="auth275-advanced"><summary>Lifetime and object binding</summary><EditorSection title="Requested lifetime"><EditorField label="Lifetime (seconds)" inputMode="numeric" disabled={form.disabled} value={partialLifetime ?? (canonical === null || canonical === undefined ? '' : text(canonical))} error={partialLifetime === null ? null : lifetimeError(partialLifetime)} help="Leave empty for server default. Range: 600 to 4294967296 seconds. The issuer can change the duration; server expiration is authoritative." onChange={value => {
      const error = lifetimeError(value);
      if (error) { setPartialLifetime(value); validity('lifetime', error); return; }
      const failure = commit(value === '' ? [{ op: 'remove', path: ['spec', 'expirationSeconds'] }] : [{ op: 'set', path: ['spec', 'expirationSeconds'], value: Number(value) }]);
      setPartialLifetime(failure ? value : null);
      validity('lifetime', failure);
    }} /></EditorSection><Binding form={form} commit={commit} validity={validity} /></details>
    <p className="auth275-consequence">Issuing creates a credential, not a saved TokenRequest. Returned token stays masked.</p>{patchError && <p role="alert">{patchError}</p>}<AuthenticationResult form={form} /></div>;
}
function Binding({ form, commit, validity }: { form: ResourceEditorFormProps; commit: Commit; validity: Validity }) {
  const kind = text(form.draft.get(['spec', 'boundObjectRef', 'kind']));
  const options = [{ value: '', label: 'Not bound' }, { value: 'Pod', label: 'Pod' }, { value: 'Secret', label: 'Secret' }, { value: 'Node', label: 'Node (server-validated)' }];
  return <EditorSection title="Object binding"><EditorChoice label="Bind token to" value={kind} options={options} disabled={form.disabled} help="Bound tokens expire when the object disappears. Pod must use this ServiceAccount. Secret lookup returns metadata only. Node binding is stable in Kubernetes 1.33+; the server verifies support and authorization." onChange={next => {
    const operations: ResourceEditorPatch[] = next ? [{ op: 'set', path: ['spec', 'boundObjectRef', 'apiVersion'], value: 'v1' }, { op: 'set', path: ['spec', 'boundObjectRef', 'kind'], value: next }] : [{ op: 'remove', path: ['spec', 'boundObjectRef'] }];
    if (next && next !== kind) for (const key of ['name', 'uid']) if (form.draft.has(['spec', 'boundObjectRef', key])) operations.push({ op: 'remove', path: ['spec', 'boundObjectRef', key] });
    if (!commit(operations)) { validity('binding-name', null); validity('binding-uid', null); }
  }} />{kind && <BoundObject key={`${form.draft.sessionID}:${kind}`} form={form} kind={kind} commit={commit} validity={validity} />}</EditorSection>;
}
function BoundObject({ form, kind, commit, validity }: { form: ResourceEditorFormProps; kind: string; commit: Commit; validity: Validity }) {
  const resources: Record<string, string> = { Pod: 'pods', Secret: 'secrets', Node: 'nodes' };
  const refs = useEditorReferences(form, { group: '', version: 'v1', resource: resources[kind], namespace: kind === 'Node' ? undefined : form.context.namespace, projection: 'metadata' });
  const list = useId();
  const [partialName, setPartialName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [partialUID, setPartialUID] = useState<string | null>(null);
  return <><EditorField label="Bound object name" list={list} value={partialName ?? text(form.draft.get(['spec', 'boundObjectRef', 'name']))} disabled={form.disabled} error={nameError} onChange={value => {
    if (!value.trim()) { setPartialName(value); setNameError('Enter a bound object name.'); validity('binding-name', 'Enter a bound object name.'); return; }
    const found = refs.status === 'ready' ? refs.items.find(item => item.name === value) : undefined;
    const operations: ResourceEditorPatch[] = [{ op: 'set', path: ['spec', 'boundObjectRef', 'name'], value }];
    if (found?.uid) operations.push({ op: 'set', path: ['spec', 'boundObjectRef', 'uid'], value: found.uid });
    else if (form.draft.has(['spec', 'boundObjectRef', 'uid'])) operations.push({ op: 'remove', path: ['spec', 'boundObjectRef', 'uid'] });
    const error = commit(operations);
    setPartialName(error ? value : null);
    setNameError(error);
    if (!error) { setPartialUID(null); validity('binding-uid', null); }
    validity('binding-name', error);
  }} /><datalist id={list}>{refs.status === 'ready' && refs.items.map(item => <option key={item.uid ?? item.name} value={item.name} />)}</datalist><div role="status">{refs.status === 'ready' ? refs.items.length ? 'Reference suggestions available · manual names allowed' : 'No objects found · manual name retained' : refs.status === 'loading' ? 'Loading bound objects…' : refs.status === 'denied' ? 'Reference access denied · manual name retained' : refs.status === 'absent' ? 'Reference API absent' : 'Reference lookup unavailable · manual name retained'}</div><EditorField label="Bound object UID (optional)" value={partialUID ?? text(form.draft.get(['spec', 'boundObjectRef', 'uid']))} disabled={form.disabled} help="Resolved selection pins the object UID. An omitted UID lets the server resolve the current object. Never invent a UID." onChange={value => {
    const error = commit(value ? [{ op: 'set', path: ['spec', 'boundObjectRef', 'uid'], value }] : [{ op: 'remove', path: ['spec', 'boundObjectRef', 'uid'] }]);
    setPartialUID(error ? value : null);
    validity('binding-uid', error);
  }} /></>;
}
