import { useEffect, useRef, useState } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorHelp } from '../../editor-controls';
export function ControllerActions({ form }: { form: ResourceEditorFormProps }) {
  const [identity, setIdentity] = useState({ actions: form.actions, patch: form.patch, generation: 0 });
  if (identity.actions !== form.actions || identity.patch !== form.patch) {
    setIdentity({ actions: form.actions, patch: form.patch, generation: identity.generation + 1 });
  }
  return <ControllerActionSession key={`${identity.generation}/${form.draft.sessionID}/${form.draft.revision}/${form.context.name}/${form.context.uid}/${form.context.resourceVersion}`} form={form} />;
}
function ControllerActionSession({ form }: { form: ResourceEditorFormProps }) {
  const [choice, setChoice] = useState<'renew' | 'approve' | 'deny' | null>(null);
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const current = useRef<AbortController | null>(null);
  useEffect(() => { generation.current++; current.current?.abort(); return () => current.current?.abort(); }, [form.actions, form.patch]);
  const availability = form.context.capabilities.actions['kubernetes.cert-manager.v1'];
  const conditions = form.draft.get(['status', 'conditions']);
  const rows: readonly unknown[] = Array.isArray(conditions) ? conditions : [];
  const decided = rows.some(item => item !== null && typeof item === 'object' && 'type' in item && (item.type === 'Approved' || item.type === 'Denied') && 'status' in item && item.status === 'True');
  const request = form.context.kind === 'CertificateRequest';
  const unavailable = form.disabled || (form.context.intent !== 'edit' && form.context.intent !== 'action') || availability !== 'available' || !form.context.name || !form.context.resourceVersion || (request && decided);
  return <section><EditorHelp label="Controller actions">Renew requests controller issuance, not successful renewal. Approval and denial are permanent, mutually exclusive decisions. Server checks status and signer authorization.</EditorHelp><div>{(request ? ['approve', 'deny'] as const : ['renew'] as const).map(operation => <button type="button" key={operation} disabled={unavailable || busy} onClick={() => setChoice(operation)}>{operation === 'renew' ? 'Request renewal' : operation === 'approve' ? 'Approve request' : 'Deny request'}</button>)}</div>{unavailable && <span role="status">{decided ? 'Approval decision already recorded.' : `Controller action ${availability ?? 'unknown'}.`}</span>}{choice && <div role="group" aria-label="Confirm controller action"><p>{choice === 'deny' ? 'Denial permanently prevents issuance.' : choice === 'approve' ? 'Approval permits the signer to issue this request.' : 'Request reissuance of this Certificate.'}</p><button type="button" onClick={() => setChoice(null)} disabled={busy}>Cancel</button><button type="button" disabled={busy || unavailable} onClick={() => { if (busy || unavailable) return; void (async () => {
    const controller = new AbortController(); current.current = controller;
    const token = ++generation.current; setBusy(true); setState('Request pending');
    try {
      const result = await form.actions.execute({ protocol: 'kubernetes.cert-manager.v1', input: { operation: choice, resourceVersion: form.context.resourceVersion }, sessionID: form.draft.sessionID, generation: token, signal: controller.signal });
      if (controller.signal.aborted || generation.current !== token) return;
      setState(result.status === 'ready' ? 'Controller request accepted. Refresh observed state; issuance is not guaranteed.' : `Controller request ${result.status}.`);
      setChoice(null);
    } catch { if (!controller.signal.aborted && generation.current === token) setState('Controller request unavailable.'); }
    finally { if (!controller.signal.aborted && generation.current === token) setBusy(false); }
  })(); }}>Confirm {choice}</button></div>}<span role="status">{state}</span></section>;
}
