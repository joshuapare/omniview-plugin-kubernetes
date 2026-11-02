import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useState } from 'react';
import { EditorField, EditorSection } from '../../editor-controls';
import { Audiences, AuthenticationResult, useAuthenticationForm } from './fields';

export default function TokenReviewForm(form: ResourceEditorFormProps) {
  return <TokenReviewSession key={form.draft.sessionID} {...form} />;
}
function TokenReviewSession(form: ResourceEditorFormProps) {
  const { commit, validity, patchError } = useAuthenticationForm(form);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  return <div className="auth275-form"><EditorSection title="Review a bearer token">
    <EditorField label="Bearer token" type="password" value={token} disabled={form.disabled} placeholder={form.draft.has(['spec', 'token']) ? 'Token stored securely · enter to replace' : undefined} error={error} help="Sent only to this connection’s TokenReview endpoint. The request is not saved as a Kubernetes resource. Credentials never appear in source previews or results." onChange={value => {
      setToken(value);
      const failure = value ? commit([{ op: 'set', path: ['spec', 'token'], value }]) : 'Enter a token to review. Existing source token retained.';
      setError(failure);
      validity('token', failure);
    }} />
  </EditorSection><Audiences form={form} commit={commit} validity={validity} /><p className="auth275-consequence">Reviews authenticate only. Explicit audiences must match the server response.</p>{patchError && <p role="alert">{patchError}</p>}<AuthenticationResult form={form} /></div>;
}
