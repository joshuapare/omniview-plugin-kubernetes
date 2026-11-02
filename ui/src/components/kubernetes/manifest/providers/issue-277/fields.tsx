import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { EditorField, EditorHelp, patchFields } from '../../editor-controls';

import { parseMaterial } from './material';
import './styles.css';

interface BufferedFieldProps {
  form: ResourceEditorFormProps; label: string; path: ResourceEditorPath; help: string;
  validate: (value: string) => string | null;
  optional?: boolean; numeric?: boolean; locked?: boolean;
  report: (key: string, error: string | null) => void;
}
export function BufferedField(props: BufferedFieldProps) {
  return <BufferedFieldSession key={`${props.form.draft.sessionID}:${props.path.join('.')}`} {...props} />;
}
function BufferedFieldSession({ form, label, path, help, validate, optional, numeric, locked, report }: BufferedFieldProps) {
  const raw = form.draft.get(path);
  const source = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint' ? String(raw) : '';
  const [pending, setPending] = useState<{ text: string; error: string } | null>(null);
  const fieldID = path.join('.');
  useEffect(() => () => report(fieldID, null), [fieldID, report]);
  return <EditorField label={label} value={pending?.text ?? source} error={pending?.error} help={help} disabled={form.disabled || locked} inputMode={numeric ? 'numeric' : 'text'} onChange={next => {
    let failure = validate(next);
    if (!failure) {
      const result = patchFields(form, [!next && optional ? { op: 'remove', path } : { op: 'set', path, value: numeric ? Number(next) : next }]);
      failure = result.status === 'accepted' ? null : 'Field could not be changed. Refresh this form and retry.';
    }
    setPending(failure ? { text: next, error: failure } : null);
    report(fieldID, failure);
  }} />;
}
interface MaterialUploadProps {
  form: ResourceEditorFormProps; kind: 'request' | 'trust'; locked?: boolean;
  report: (key: string, error: string | null) => void;
}
interface MaterialRead {
  controller: AbortController;
  patch: ResourceEditorFormProps['patch'];
  pending: boolean;
  error: string | null;
}
export function MaterialUpload(props: MaterialUploadProps) {
  const { form, kind, locked } = props;
  const identity = `${form.draft.sessionID}:${form.draft.revision}:${form.section}:${kind}:${!!locked}:${form.disabled}`;
  return <MaterialUploadSession key={identity} {...props} />;
}
function MaterialUploadSession({ form, kind, locked, report }: MaterialUploadProps) {
  const path = ['spec', kind === 'request' ? 'request' : 'trustBundle'];
  const [read, setRead] = useState<MaterialRead | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const controller = read?.controller;
  useLayoutEffect(() => () => controller?.abort(), [controller, form.patch]);
  const currentRead = read?.patch === form.patch ? read : null;
  const busy = currentRead?.pending ?? false;
  const error = currentRead?.error ?? null;
  useEffect(() => { report(kind, busy ? 'Wait for the material import or cancel it.' : error); }, [busy, error, kind, report]);
  useEffect(() => () => report(kind, null), [kind, report]);
  const label = kind === 'request' ? 'Certificate signing request' : 'CA trust bundle';
  const disabled = form.disabled || locked;
  return <div className="cert-editor-material"><div className="cert-editor-row"><strong>{label}</strong><EditorHelp label={label}>{kind === 'request' ? 'Import one PEM PKCS#10 request. Contents stay hidden. API admission verifies the signature; the signer decides issuance.' : 'Import PEM CA certificates, without headers or duplicates. Basic constraints must set CA. API admission remains authoritative. No private keys.'}</EditorHelp></div>
    <span role="status">{busy ? 'Reading material…' : form.draft.has(path) ? 'Material attached · contents hidden' : 'No material attached'}</span>
    <input ref={input} type="file" hidden accept=".pem,.crt,.csr" aria-label={`Attach ${label}`} disabled={disabled} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file || disabled) return;
      controller?.abort();
      const request: MaterialRead = { controller: new AbortController(), patch: form.patch, pending: true, error: null };
      setRead(request);
      report(kind, 'Wait for the material import or cancel it.');
      const finish = (message: string | null) => {
        if (request.controller.signal.aborted) return;
        setRead({ ...request, pending: false, error: message });
        report(kind, message);
      };
      void (async () => {
        try {
          if (file.size > 1024 * 1024) throw new Error('size');
          const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
          if (request.controller.signal.aborted) return;
          const parsed = parseMaterial(text, kind);
          if (!parsed.valid) { finish(parsed.error); return; }
          const result = patchFields(form, [{ op: 'set', path, value: parsed.value }]);
          finish(result.status === 'accepted' ? null : 'Material was not applied. Refresh this form and retry.');
        } catch { finish('Material could not be read. Use a UTF-8 PEM file up to 1 MiB.'); }
      })();
    }} />
    <div className="cert-editor-row"><Button size="sm" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>{form.draft.has(path) ? 'Replace PEM' : 'Attach PEM'}</Button>
      {busy && <Button size="sm" variant="ghost" onClick={() => { controller?.abort(); setRead(null); report(kind, null); }}>Cancel import</Button>}
      {error && <Button size="sm" variant="ghost" onClick={() => { setRead(null); report(kind, null); }}>Dismiss import error</Button>}
    </div>{error && <p role="alert">{error}</p>}
  </div>;
}
export function Lifecycle({ form, pod = false }: { form: ResourceEditorFormProps; pod?: boolean }) {
  const conditions = form.draft.get(['status', 'conditions']);
  const issued = form.draft.has(['status', pod ? 'certificateChain' : 'certificate']);
  const known = ['Approved', 'Denied', 'Failed', 'Issued'].flatMap(type => {
    if (!Array.isArray(conditions)) return [];
    const index = conditions.findIndex((_, position) => form.draft.get(['status', 'conditions', position, 'type']) === type);
    if (index < 0) return [];
    const status = form.draft.get(['status', 'conditions', index, 'status']);
    return [{ type, status: typeof status === 'string' && ['True', 'False', 'Unknown'].includes(status) ? status : 'Unknown' }];
  });
  return <div className="cert-editor-stack"><dl className="cert-editor-details"><dt>Certificate material</dt><dd>{issued ? 'Present · hidden' : 'Not reported'}</dd>
    {pod && (['notBefore', 'notAfter', 'beginRefreshAt'] as const).map(key => {
      const value = form.draft.get(['status', key]);
      return <div key={key}><dt>{{ notBefore: 'Valid from', notAfter: 'Expires', beginRefreshAt: 'Refresh hint' }[key]}</dt><dd>{typeof value === 'string' && /^\d{4}-\d\d-\d\dT[0-9:.+Z-]+$/.test(value) ? value : 'Not reported'}</dd></div>;
    })}</dl>
    <div aria-label="Signer conditions">{known.length ? known.map(condition => <div key={condition.type} className="cert-editor-row"><strong>{condition.type}</strong><span>{condition.status}</span></div>) : <span>No recognized conditions reported</span>}{Array.isArray(conditions) && conditions.length > known.length && <span>Other conditions present</span>}</div>
    <EditorHelp label="Signer lifecycle">Conditions and certificate data belong to the signer. Approval is not issuance. Raw condition messages and material stay hidden.</EditorHelp>
  </div>;
}
