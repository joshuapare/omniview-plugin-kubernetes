import { useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, scalarText } from '../../editor-controls';
export function CertificateExtras({ form }: { form: ResourceEditorFormProps }) {
  const [error, setError] = useState<string | null>(null);
  const [oid, setOid] = useState('');
  const [value, setValue] = useState('');
  const other = form.draft.get(['spec', 'otherNames']);
  const rows = Array.isArray(other) ? other : [];
  const usages = form.draft.get(['spec', 'usages']);
  function apply(operations: ResourceEditorPatch[]) {
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
    setError(result.status === 'accepted' ? null : result.message);
    return result.status === 'accepted';
  }
  return <details><summary>Other names and key usages</summary>{rows.map((_, index) => <div key={index}>{['oid', 'utf8Value'].map(key => <EditorField key={key} label={key === 'oid' ? `Other name ${index + 1} OID` : `Other name ${index + 1} UTF-8 value`} value={scalarText(form.draft.get(['spec', 'otherNames', index, key]))} disabled={form.disabled} onChange={text => apply([{ op: 'set', path: ['spec', 'otherNames', index, key], value: text }])} />)}<button type="button" disabled={form.disabled} onClick={() => apply([{ op: 'remove', path: ['spec', 'otherNames', index] }])}>Remove other name {index + 1}</button></div>)}<EditorField label="New OID" value={oid} onChange={setOid} disabled={form.disabled} /><EditorField label="New UTF-8 value" value={value} onChange={setValue} disabled={form.disabled} /><button type="button" disabled={form.disabled || !/^\d+(?:\.\d+)+$/.test(oid) || !value} onClick={() => { if (apply(form.draft.has(['spec', 'otherNames']) ? [{ op: 'insert', path: ['spec', 'otherNames'], index: rows.length, value: { oid, utf8Value: value } }] : [{ op: 'set', path: ['spec', 'otherNames'], value: [{ oid, utf8Value: value }] }])) { setOid(''); setValue(''); } }}>Add other name</button><fieldset disabled={form.disabled}><legend>Requested usages</legend>{['signing', 'digital signature', 'content commitment', 'key encipherment', 'key agreement', 'data encipherment', 'cert sign', 'crl sign', 'encipher only', 'decipher only', 'any', 'server auth', 'client auth', 'code signing', 'email protection', 's/mime', 'ipsec end system', 'ipsec tunnel', 'ipsec user', 'timestamping', 'ocsp signing', 'microsoft sgc', 'netscape sgc'].map(usage => {
    const index = Array.isArray(usages) ? usages.indexOf(usage) : -1;
    return <label key={usage}><input type="checkbox" checked={index >= 0} onChange={event => apply(event.target.checked ? form.draft.has(['spec', 'usages']) ? [{ op: 'insert', path: ['spec', 'usages'], index: Array.isArray(usages) ? usages.length : 0, value: usage }] : [{ op: 'set', path: ['spec', 'usages'], value: [usage] }] : [{ op: 'remove', path: ['spec', 'usages', index] }])} />{usage}</label>;
  })}</fieldset>{error && <p role="alert">{error}</p>}</details>;
}
export function HTTPChallenge({ form }: { form: ResourceEditorFormProps }) {
  const [error, setError] = useState<string | null>(null);
  const solvers = form.draft.get(['spec', 'acme', 'solvers']);
  const rows = Array.isArray(solvers) ? solvers : [];
  function apply(operations: ResourceEditorPatch[]) {
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
    setError(result.status === 'accepted' ? null : result.message);
  }
  return <details><summary>HTTP-01 challenge solvers</summary>{rows.map((_, index) => {
    const path: ResourceEditorPath = ['spec', 'acme', 'solvers', index];
    if (form.draft.has([...path, 'dns01'])) return <p key={index}>DNS-01 solver {index + 1} preserved in source.</p>;
    return <div key={index}><EditorField label={`Solver ${index + 1} ingress class`} help="HTTP-01 cannot solve wildcard identifiers. Existing selectors stay unchanged." disabled={form.disabled} value={scalarText(form.draft.get([...path, 'http01', 'ingress', 'ingressClassName']))} onChange={value => apply([{ op: 'set', path: [...path, 'http01', 'ingress', 'ingressClassName'], value }])} /><button type="button" disabled={form.disabled} onClick={() => apply([{ op: 'remove', path }])}>Remove HTTP solver {index + 1}</button></div>;
  })}<button type="button" disabled={form.disabled} onClick={() => apply(form.draft.has(['spec', 'acme', 'solvers']) ? [{ op: 'insert', path: ['spec', 'acme', 'solvers'], index: rows.length, value: { http01: { ingress: {} } } }] : [{ op: 'set', path: ['spec', 'acme', 'solvers'], value: [{ http01: { ingress: {} } }] }])}>Add HTTP-01 solver</button>{error && <p role="alert">{error}</p>}</details>;
}
export function UnionChoice({ form, path, choices, label }: { form: ResourceEditorFormProps; path: ResourceEditorPath; choices: readonly string[]; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const active = choices.find(key => form.draft.has([...path, key]));
  return <EditorChoice label={label} value={active ?? ''} options={[{ value: '', label: 'Choose' }, ...choices.map(value => ({ value, label: value }))]} disabled={form.disabled} error={error} help="Changing this choice removes previous branch settings. Unknown fields outside that branch remain unchanged." onChange={value => {
    if (!value || value === active || (active && !window.confirm('Replace previous branch configuration?'))) return;
    const operations: ResourceEditorPatch[] = choices.filter(key => form.draft.has([...path, key])).map(key => ({ op: 'remove', path: [...path, key] }));
    operations.push({ op: 'set', path: [...path, value], value: {} });
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
    setError(result.status === 'accepted' ? null : result.message);
  }} />;
}
