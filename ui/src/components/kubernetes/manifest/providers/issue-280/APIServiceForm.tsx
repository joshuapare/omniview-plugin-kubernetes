import { Button } from '@omniviewdev/base-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection, KeyValueFields, ReferencePicker, patchError, patchFields, scalarText } from '../../editor-controls';
import { boundedInteger, encodeCABytes, groupError, labelKeyError, labelValueError, localOperations, ownershipReason, trustOperations, validateAPIService, versionError } from './apiService';
import './apiService.css';

type LocalField = { source: string; text: string; error: string | null };
const routingOptions = [{ value: 'local', label: 'Local API server handler' }, { value: 'remote', label: 'Remote HTTPS Service' }];
const trustOptions = [{ value: 'system', label: 'API server system roots' }, { value: 'custom', label: 'Custom CA bundle' }, { value: 'insecure', label: 'Skip certificate verification' }];

export default function APIServiceForm(props: ResourceEditorFormProps) {
  return <APIServiceSession key={props.draft.sessionID} {...props} />;
}
function APIServiceSession(props: ResourceEditorFormProps) {
  const { draft, context, section } = props;
  const [local, setLocal] = useState<Record<string, LocalField>>({});
  const [patchFailure, setPatchFailure] = useState<string | null>(null);
  const [mapFailure, setMapFailure] = useState<string | null>(null);
  const [customPending, setCustomPending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileReady, setFileReady] = useState(false);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; }, [props]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ownership = ownershipReason(draft) ?? (context.ownership?.status === 'controller' || context.ownership?.status === 'system' ? 'Managed registration. Inspect only; change its owning configuration.' : null);
  const disabled = props.disabled || !!ownership || context.intent === 'inspect';
  const form = { ...props, disabled };
  const remote = draft.has(['spec', 'service']) && draft.get(['spec', 'service']) !== null;
  const hasCA = draft.has(['spec', 'caBundle']);
  const insecure = draft.get(['spec', 'insecureSkipTLSVerify']) === true;
  const namespace = scalarText(draft.get(['spec', 'service', 'namespace']));
  const failures = validateAPIService(draft, context);
  const activeLocalFailure = Object.entries(local).find(([path, value]) => value.source === scalarText(draft.get(JSON.parse(path) as ResourceEditorPath)) && value.error)?.[1].error;
  const validity = disabled ? null : patchFailure ?? mapFailure ?? activeLocalFailure ?? (importing ? 'CA import is in progress.' : customPending && !hasCA ? 'Import a CA bundle or choose another trust mode.' : null);
  useEffect(() => { props.onValidityChange(validity); }, [props.onValidityChange, validity]);

  function commit(operations: readonly ResourceEditorPatch[]): string | null {
    const error = patchError(patchFields(form, operations));
    setPatchFailure(error);
    return error;
  }
  function field(path: ResourceEditorPath, label: string, parse: (text: string) => { value?: unknown; remove?: boolean; error: string | null }, help?: string, locked = false, numeric = false) {
    const key = JSON.stringify(path);
    const source = scalarText(draft.get(path));
    const entry = local[key]?.source === source ? local[key] : undefined;
    return <EditorField key={key} label={label} value={entry?.text ?? source} disabled={disabled || locked} inputMode={numeric ? 'numeric' : 'text'} help={help}
      error={entry?.error ?? failures.find(failure => JSON.stringify(failure.path) === key)?.message} onChange={text => {
        const parsed = parse(text);
        const error = parsed.error ?? commit([parsed.remove ? { op: 'remove', path } : { op: 'set', path, value: parsed.value }]);
        setLocal(previous => ({ ...previous, [key]: { source, text, error } }));
      }} />;
  }
  const reportMap = useCallback((error: string | null) => setMapFailure(error), []);
  const mapForm: ResourceEditorFormProps = { ...form, onValidityChange: reportMap, patch: request => request.operations.some(operation => operation.path[0] === 'metadata' && operation.path[1] === 'labels' && operation.path[2] === 'kube-aggregator.kubernetes.io/automanaged') ? { status: 'forbidden', message: 'Automanagement belongs to controller configuration.' } : props.patch(request) };

  async function importCA(file: File | undefined, input: HTMLInputElement) {
    input.value = '';
    if (!file || disabled) return;
    const started = props;
    setImporting(true);
    setPatchFailure(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!mounted.current) { bytes.fill(0); return; }
      if (latest.current.disabled || latest.current.context.intent === 'inspect' || ownershipReason(latest.current.draft) || latest.current.context.ownership?.status === 'controller' || latest.current.context.ownership?.status === 'system' || latest.current.draft.sessionID !== started.draft.sessionID || latest.current.draft.revision !== started.draft.revision || latest.current.patch !== started.patch) {
        bytes.fill(0);
        setPatchFailure('Draft changed during import. Select the CA file again.');
        return;
      }
      if (!bytes.length) { setPatchFailure('Choose a non-empty CA bundle file.'); return; }
      const encoded = encodeCABytes(bytes);
      bytes.fill(0);
      const result = patchFields({ ...started, disabled }, [{ op: 'set', path: ['spec', 'caBundle'], value: encoded }, { op: 'remove', path: ['spec', 'insecureSkipTLSVerify'] }]);
      const error = patchError(result);
      setPatchFailure(error);
      if (!error) { setCustomPending(false); setFileReady(true); }
    } catch {
      if (mounted.current) setPatchFailure('CA file could not be read. Existing bundle retained.');
    } finally {
      if (mounted.current) setImporting(false);
    }
  }

  return <div className="apiservice-editor">
    {ownership && <div role="status" className="apiservice-notice">{ownership}</div>}
    {!ownership && context.intent !== 'create' && <div className="apiservice-ownership">Ownership: {context.ownership?.status === 'application' ? 'application' : 'not established'}<EditorHelp label="Field ownership">Permission and discovery do not establish field ownership. Admission and field-manager conflicts still apply; this editor never forces ownership.</EditorHelp></div>}
    {(section === 'registration' || !section) && <>
      <EditorSection title="API registration"><div className="apiservice-grid">
        {field(['spec', 'group'], 'API group', value => ({ value, error: groupError(value, value ? scalarText(draft.get(['spec', 'version'])) : 'v1') }), 'DNS subdomain served by the aggregated server. Empty group is allowed only for the core v1 registration.', context.intent !== 'create')}
        {field(['spec', 'version'], 'API version', value => ({ value, error: versionError(value) }), 'Version served by the aggregated server. Group and version must match the immutable registration name.', context.intent !== 'create')}
      </div><div className="apiservice-name">Required name: <code>{scalarText(draft.get(['spec', 'version'])) || 'version'}.{scalarText(draft.get(['spec', 'group'])) || (draft.get(['spec', 'version']) === 'v1' ? '' : 'group')}</code></div>
        {failures.find(issue => issue.path[0] === 'metadata') && <div role="alert" className="resource-editor-error">Name must match version.group in the host identity field.</div>}
      </EditorSection>
      <EditorSection title="Discovery ordering"><div className="apiservice-grid">
        {field(['spec', 'groupPriorityMinimum'], 'Group priority (1–20000)', value => boundedInteger(value, 1, 20000), 'Higher values rank the entire API group earlier in discovery. Other versions can raise the group priority.', false, true)}
        {field(['spec', 'versionPriority'], 'Version priority (1–1000)', value => boundedInteger(value, 1, 1000), 'Higher values rank this version earlier within its group. Ties use Kubernetes version ordering.', false, true)}
      </div></EditorSection>
      <div className="apiservice-notice">Registration changes can redirect API requests or interrupt discovery.</div>
    </>}
    {section === 'service' && <>
      <EditorSection title="Request handling"><EditorChoice label="Routing" value={remote ? 'remote' : 'local'} options={routingOptions} disabled={disabled} help="Local handling delegates to the API server's existing handler chain. This does not install an API handler or create a Service." onChange={value => {
        const error = commit(value === 'local' ? localOperations() : [{ op: 'set', path: ['spec', 'service', 'namespace'], value: '' }, { op: 'set', path: ['spec', 'service', 'name'], value: '' }]);
        if (!error) { setCustomPending(false); setLocal(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.includes('service')))); }
      }} /></EditorSection>
      {!remote ? <div className="apiservice-notice">Uses an existing local handler. No handler or backing server is installed.{(hasCA || insecure) && <Button size="sm" disabled={disabled} onClick={() => { commit(localOperations()); }}>Remove incompatible remote TLS fields</Button>}</div> : <>
        <EditorSection title="Existing HTTPS Service"><div className="apiservice-grid">
          <ReferencePicker form={form} label="Service namespace" value={namespace} onChange={value => commit([{ op: 'set', path: ['spec', 'service', 'namespace'], value }])} query={{ group: '', version: 'v1', resource: 'namespaces', projection: 'metadata' }} help="Namespace of the backing Service. APIService itself is cluster-scoped." error={failures.find(issue => issue.path.at(-1) === 'namespace')?.message} />
          {namespace ? <ReferencePicker key={namespace} form={form} label="Service name" value={scalarText(draft.get(['spec', 'service', 'name']))} onChange={value => commit([{ op: 'set', path: ['spec', 'service', 'name'], value }])} query={{ group: '', version: 'v1', resource: 'services', namespace, projection: 'servicePorts' }} help="Existing Service only. Selecting it does not verify backing-server support or availability." error={failures.find(issue => issue.path.at(-1) === 'name' && issue.path[0] === 'spec')?.message} /> : <EditorField label="Service name" value={scalarText(draft.get(['spec', 'service', 'name']))} disabled={disabled} onChange={value => commit([{ op: 'set', path: ['spec', 'service', 'name'], value }])} help="Enter a namespace to load scoped Service suggestions. Manual names remain allowed." />}
          {field(['spec', 'service', 'port'], 'Service HTTPS port', value => { const parsed = boundedInteger(value, 1, 65535, true); return { ...parsed, remove: value === '' }; }, 'Blank preserves omission; the API default is 443. This is the Service port, not targetPort.', false, true)}
        </div></EditorSection>
        <EditorSection title="TLS trust"><EditorChoice label="Certificate verification" value={customPending || hasCA ? 'custom' : insecure ? 'insecure' : 'system'} options={trustOptions} disabled={disabled} help="Trust settings do not prove certificate validity or server health. Uploaded bytes remain masked in forms and source previews." onChange={value => {
          if (value === 'custom') { setCustomPending(true); return; }
          const error = commit(trustOperations(value === 'insecure' ? 'insecure' : 'system'));
          if (!error) { setCustomPending(false); setFileReady(false); }
        }} />
          {(customPending || hasCA) && <div className="apiservice-ca"><div>{hasCA ? fileReady ? 'Imported CA bundle retained · content hidden' : 'Existing CA bundle retained · content hidden' : 'No CA bundle imported'}</div>
            <label className="apiservice-upload">{hasCA ? 'Replace CA bundle' : 'Import CA bundle'}<input aria-label={hasCA ? 'Replace CA bundle' : 'Import CA bundle'} type="file" accept=".pem,.crt,.cer" disabled={disabled || importing} onChange={event => { void importCA(event.target.files?.[0], event.target); }} /></label>
            <EditorHelp label="CA bundle import">Original file bytes become spec.caBundle. No content or filename is displayed. Import does not validate trust, certificate expiry or hostname coverage. Keep existing bytes by leaving this field unchanged.</EditorHelp>
            {customPending && !hasCA && <Button size="sm" variant="ghost" disabled={disabled || importing} onClick={() => setCustomPending(false)}>Cancel import</Button>}
            {hasCA && <Button size="sm" variant="ghost" disabled={disabled || importing} onClick={() => { if (!commit(trustOperations('system'))) { setCustomPending(false); setFileReady(false); } }}>Remove CA bundle; use system roots</Button>}
          </div>}
          {insecure && <div role="alert" className="apiservice-notice">Certificate verification is disabled. API traffic can be intercepted.</div>}
        </EditorSection>
        <div className="apiservice-notice">Routing and trust changes affect cluster API traffic. No companion resources are created.</div>
      </>}
    </>}
    {section === 'metadata' && <EditorSection title="Registration labels"><KeyValueFields form={mapForm} path={['metadata', 'labels']} label="label" validateKey={labelKeyError} validateValue={labelValueError} /></EditorSection>}
    {section === 'availability' && <EditorSection title="Controller-reported availability"><Availability draft={draft} /></EditorSection>}
    {patchFailure && <div role="alert" className="resource-editor-error">{patchFailure}</div>}
    {importing && <div role="status">Reading CA bundle…</div>}
  </div>;
}
function Availability({ draft }: Pick<ResourceEditorFormProps, 'draft'>) {
  const conditions = draft.get(['status', 'conditions']);
  const safeWord = (value: unknown) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(value) ? value : 'Not reported';
  if (!Array.isArray(conditions) || !conditions.length) return <div role="status">No availability condition reported.</div>;
  return <div className="apiservice-conditions">{conditions.map((_condition, index) => {
    const read = (key: string) => draft.get(['status', 'conditions', index, key]);
    const time = read('lastTransitionTime');
    return <section className="apiservice-condition" key={index}><strong>{safeWord(read('type'))}</strong><dl><dt>Status</dt><dd>{['True', 'False', 'Unknown'].includes(String(read('status'))) ? String(read('status')) : 'Not reported'}</dd><dt>Reason</dt><dd>{safeWord(read('reason'))}</dd><dt>Last transition</dt><dd>{typeof time === 'string' && /^\d{4}-\d\d-\d\dT[\d:.+-]+Z?$/.test(time) ? time : 'Not reported'}</dd><dt>Message</dt><dd>{draft.has(['status', 'conditions', index, 'message']) ? 'Details hidden for privacy' : 'Not reported'}</dd></dl></section>;
  })}<div className="apiservice-notice">Reported status is read-only; it is not a new health check.</div></div>;
}
