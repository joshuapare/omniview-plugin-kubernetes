import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorField, EditorHelp, patchFields } from '../../editor-controls';
import { parseMaterial } from './material';
import './styles.css';

export function BufferedField({ form, label, path, help, validate, optional, numeric, locked, report }: {
  form: ResourceEditorFormProps; label: string; path: ResourceEditorPath; help: string;
  validate(value: string): string | null; optional?: boolean; numeric?: boolean; locked?: boolean;
  report(key: string, error: string | null): void;
}) {
  const raw = form.draft.get(path);
  const source = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint' ? String(raw) : '';
  const [text, setText] = useState(source);
  const [error, setError] = useState<string | null>(null);
  const key = path.join('.');
  useEffect(() => { if (!error) setText(source); }, [source, error]);
  useEffect(() => () => report(key, null), [key, report]);
  return <EditorField label={label} value={text} error={error} help={help} disabled={form.disabled || locked} inputMode={numeric ? 'numeric' : 'text'} onChange={next => {
    setText(next);
    let failure = validate(next);
    if (!failure) {
      const result = patchFields(form, [!next && optional ? { op: 'remove', path } : { op: 'set', path, value: numeric ? Number(next) : next }]);
      failure = result.status === 'accepted' ? null : 'Field could not be changed. Refresh this form and retry.';
    }
    setError(failure); report(key, failure);
  }} />;
}
export function MaterialUpload({ form, kind, locked, report }: {
  form: ResourceEditorFormProps; kind: 'request' | 'trust'; locked?: boolean;
  report(key: string, error: string | null): void;
}) {
  const path = ['spec', kind === 'request' ? 'request' : 'trustBundle'];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const identity = `${form.draft.sessionID}:${form.draft.revision}:${form.section}:${!!locked}:${form.disabled}`;
  useLayoutEffect(() => {
    generation.current++;
    setBusy(false);
    return () => { generation.current++; };
  }, [identity, kind, report, form.patch]);
  useEffect(() => { report(kind, busy ? 'Wait for the material import or cancel it.' : error); }, [busy, error, kind, report]);
  useEffect(() => () => report(kind, null), [kind, report]);
  const label = kind === 'request' ? 'Certificate signing request' : 'CA trust bundle';
  const disabled = form.disabled || locked;
  return <div className="cert-editor-material"><div className="cert-editor-row"><strong>{label}</strong><EditorHelp label={label}>{kind === 'request' ? 'Import one PEM PKCS#10 request. Contents stay hidden. API admission verifies the signature; the signer decides issuance.' : 'Import PEM CA certificates, without headers or duplicates. Basic constraints must set CA. API admission remains authoritative. No private keys.'}</EditorHelp></div>
    <span role="status">{busy ? 'Reading material…' : form.draft.has(path) ? 'Material attached · contents hidden' : 'No material attached'}</span>
    <input ref={input} type="file" hidden accept=".pem,.crt,.csr" aria-label={`Attach ${label}`} disabled={disabled} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file || disabled) return;
      const token = ++generation.current;
      setBusy(true); setError(null); report(kind, 'Wait for the material import or cancel it.');
      void (async () => {
        try {
          if (file.size > 1024 * 1024) throw new Error('size');
          const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
          if (token !== generation.current) return;
          const parsed = parseMaterial(text, kind);
          if (!parsed.valid) { setError(parsed.error); report(kind, parsed.error); return; }
          const result = patchFields(form, [{ op: 'set', path, value: parsed.value }]);
          if (result.status !== 'accepted') { setError('Material was not applied. Refresh this form and retry.'); report(kind, 'Material was not applied.'); }
          else { setError(null); report(kind, null); }
        } catch {
          if (token === generation.current) { setError('Material could not be read. Use a UTF-8 PEM file up to 1 MiB.'); report(kind, 'Material could not be read.'); }
        } finally { if (token === generation.current) setBusy(false); }
      })();
    }} />
    <div className="cert-editor-row"><Button size="sm" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>{form.draft.has(path) ? 'Replace PEM' : 'Attach PEM'}</Button>
      {busy && <Button size="sm" variant="ghost" onClick={() => { generation.current++; setBusy(false); setError(null); report(kind, null); }}>Cancel import</Button>}
      {error && <Button size="sm" variant="ghost" onClick={() => { setError(null); report(kind, null); }}>Dismiss import error</Button>}
    </div>{error && <p role="alert">{error}</p>}
  </div>;
}
export function Lifecycle({ form, pod = false }: { form: ResourceEditorFormProps; pod?: boolean }) {
  const conditions = form.draft.get(['status', 'conditions']);
  const issued = form.draft.has(['status', pod ? 'certificateChain' : 'certificate']);
  return <div className="cert-editor-stack"><dl className="cert-editor-details"><dt>Certificate material</dt><dd>{issued ? 'Present · hidden' : 'Not reported'}</dd>
    {pod && (['notBefore', 'notAfter', 'beginRefreshAt'] as const).map(key => {
      const value = form.draft.get(['status', key]);
      return <div key={key}><dt>{{ notBefore: 'Valid from', notAfter: 'Expires', beginRefreshAt: 'Refresh hint' }[key]}</dt><dd>{typeof value === 'string' && /^\d{4}-\d\d-\d\dT[0-9:.+Z-]+$/.test(value) ? value : 'Not reported'}</dd></div>;
    })}</dl>
    <div aria-label="Signer conditions">{Array.isArray(conditions) && conditions.length ? conditions.map((_, index) => {
      const type = form.draft.get(['status', 'conditions', index, 'type']);
      const status = form.draft.get(['status', 'conditions', index, 'status']);
      return <div key={index} className="cert-editor-row"><strong>{typeof type === 'string' && ['Approved', 'Denied', 'Failed', 'Issued'].includes(type) ? type : 'Other condition'}</strong><span>{typeof status === 'string' && ['True', 'False', 'Unknown'].includes(status) ? status : 'Unknown'}</span></div>;
    }) : <span>No conditions reported</span>}</div>
    <EditorHelp label="Signer lifecycle">Conditions and certificate data belong to the signer. Approval is not issuance. Raw condition messages and material stay hidden.</EditorHelp>
  </div>;
}
