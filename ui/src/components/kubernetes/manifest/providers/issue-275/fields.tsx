import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { useEffect, useState } from 'react';
import { EditorField, EditorHelp, EditorSection, useFieldValidity } from '../../editor-controls';
import { object, reviewOutcome } from './authentication';
import './forms.css';

export function useAuthenticationForm(form: ResourceEditorFormProps) {
  const validity = useFieldValidity(form);
  const [patchError, setPatchError] = useState<string | null>(null);
  const commit = (operations: readonly ResourceEditorPatch[]) => {
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
    const error = result.status === 'accepted' ? null : 'Request changed or this field cannot be edited. Keep your input and retry.';
    validity('patch', error);
    setPatchError(error);
    return error;
  };
  return { validity, commit, patchError };
}
export type Commit = (operations: readonly ResourceEditorPatch[]) => string | null;
export type Validity = (key: string, error: string | null) => void;

export function Audiences({ form, commit, validity, required = false }: { form: ResourceEditorFormProps; commit: Commit; validity: Validity; required?: boolean }) {
  const current = form.draft.get(['spec', 'audiences']);
  const audiences = Array.isArray(current) ? current as string[] : [];
  const [partial, setPartial] = useState<Record<number, string>>({});
  const [addition, setAddition] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => validity('audiences', Object.keys(partial).length ? 'Complete, retry, or remove pending audience rows.' : addition ? 'Add the audience or clear its input.' : null), [partial, addition, validity]);
  return <EditorSection title="Intended audiences">
    <div className="auth275-heading"><span>{required ? 'At least one audience' : 'Optional · API server audience when omitted'}</span><EditorHelp label="Intended audiences">An audience identifies a token recipient. Multiple audiences expand where an issued token can be used. Explicit TokenReview audiences require a matching returned audience.</EditorHelp></div>
    {audiences.map((value, index) => <div className="auth275-row" key={index}>
      <EditorField label={`Audience ${index + 1}`} value={partial[index] ?? value} disabled={form.disabled} error={partial[index] !== undefined ? partial[index].trim() ? 'Change not applied. Retry this value.' : 'Audience cannot be empty.' : null} onChange={next => {
        if (!next.trim()) { setPartial(old => ({ ...old, [index]: next })); return; }
        if (commit([{ op: 'set', path: ['spec', 'audiences', index], value: next }])) setPartial(old => ({ ...old, [index]: next }));
        else setPartial(old => { const updated = { ...old }; delete updated[index]; return updated; });
      }} />
      <Button size="sm" variant="ghost" disabled={form.disabled} aria-label={`Remove audience ${index + 1}`} onClick={() => {
        if (!commit([{ op: 'remove', path: ['spec', 'audiences', index] }])) setPartial(old => Object.fromEntries(Object.entries(old).filter(([key]) => Number(key) !== index).map(([key, val]) => [Number(key) > index ? Number(key) - 1 : Number(key), val])));
      }}>Remove</Button>
    </div>)}
    <div className="auth275-row"><EditorField label="New audience" value={addition} disabled={form.disabled} error={error} onChange={next => { setAddition(next); setError(null); }} />
      <Button size="sm" variant="outline" disabled={form.disabled} onClick={() => {
        if (!addition.trim()) { setError('Enter an audience.'); return; }
        const operations: ResourceEditorPatch[] = current === undefined ? [{ op: 'set', path: ['spec', 'audiences'], value: [addition] }] : [{ op: 'insert', path: ['spec', 'audiences'], index: audiences.length, value: addition }];
        if (!commit(operations)) setAddition('');
      }}>Add audience</Button></div>
  </EditorSection>;
}

export function AuthenticationResult({ form }: { form: ResourceEditorFormProps }) {
  const result = form.requestResult;
  if (!result) return null;
  if (result.status !== 'ready') return <p role="alert">{({ denied: 'Request denied. Check create permission for this endpoint.', unavailable: 'Request service unavailable. Draft retained.', absent: 'Endpoint not installed.', invalid: 'Server rejected the request. Check request fields.', cancelled: 'Request cancelled.' })[result.status]}</p>;
  const status = object(object(result.output).status);
  const kind = form.context.kind;
  if (kind === 'TokenReview') {
    const requested = form.draft.get(['spec', 'audiences']);
    const outcome = reviewOutcome(result.output, Array.isArray(requested) ? requested as string[] : []);
    const message = { authenticated: Array.isArray(requested) && requested.length ? 'Authenticated · requested audience accepted' : 'Authenticated · API server audience', unauthenticated: 'Not authenticated', 'audience-mismatch': 'Audience mismatch · do not accept this token', error: 'Token could not be checked. Server details hidden for privacy.' }[outcome];
    return <EditorSection title="Review result"><p role={outcome === 'authenticated' ? 'status' : 'alert'}>{message}</p><MaskedIdentity value={status.user} /></EditorSection>;
  }
  if (kind === 'SelfSubjectReview') return <EditorSection title="Current identity"><MaskedIdentity value={status.userInfo} /></EditorSection>;
  if (status.token === undefined) return <p role="alert">Token response incomplete. No credential displayed.</p>;
  const expiration = typeof status.expirationTimestamp === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(status.expirationTimestamp) ? status.expirationTimestamp : 'Not returned';
  return <EditorSection title="Issued token"><div role="status">Token: masked</div><dl className="auth275-result"><dt>Server expiration</dt><dd>{expiration}</dd></dl></EditorSection>;
}
function MaskedIdentity({ value }: { value: unknown }) {
  return <dl className="auth275-result"><dt>Identity</dt><dd>{value === undefined ? 'Not returned' : 'Masked'}</dd></dl>;
}
