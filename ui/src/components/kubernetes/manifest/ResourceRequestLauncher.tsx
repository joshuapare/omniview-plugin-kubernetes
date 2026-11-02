import { Button, Dialog } from '@omniviewdev/base-ui';
import { RESOURCE_EDITOR_EXTENSION_POINT, useExtensionPointSnapshot, useResourceTypes, type ResourceEditorContext, type ResourceEditorContribution } from '@omniviewdev/runtime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { stringify } from 'yaml';
import { PLUGIN_ID } from '@/pluginId';
import ResourceManifestEditor from './ResourceManifestEditor';
import { catalogEditorContext, validateEditorIdentity } from './resourceEditorContext';
import { loadResourceEditorSource } from './resourceEditorServices';
import { ResourcePortalContext } from './ResourcePortalContext';
import { Field } from './ResourceFormFields';
import styles from '../actions/create/CreateResourceModal.module.css';

/** Request-only APIs and response envelopes never pass through named-resource Create/Save. */
export default function ResourceRequestLauncher({ connectionID }: { connectionID: string }) {
  const [open, setOpen] = useState(false);
  return <><Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Requests & inspection</Button>{open && <RequestSession connectionID={connectionID} onClose={() => setOpen(false)} />}</>;
}
function RequestSession({ connectionID, onClose }: { connectionID: string; onClose: () => void }) {
  const snapshot = useExtensionPointSnapshot<ResourceEditorContribution, ResourceEditorContext>(RESOURCE_EDITOR_EXTENSION_POINT);
  const choices = useMemo(() => snapshot.contributions.flatMap((registration) => registration.value.targets.flatMap((target, index) => registration.value.intents.some((intent) => intent === 'inspect' || intent === 'action') ? [{ id: `${registration.id}/${index}`, target, registration }] : [])).sort((left, right) => `${left.registration.label}/${left.target.kind}`.localeCompare(`${right.registration.label}/${right.target.kind}`)), [snapshot.contributions]);
  const [selectedID, setSelectedID] = useState('');
  const selected = choices.find((entry) => entry.id === selectedID);
  const [source, setSource] = useState('');
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [localCapture, setLocalCapture] = useState(false);
  const [intentChoice, setIntentChoice] = useState<'inspect' | 'action'>('inspect');
  const abort = useRef<AbortController | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const { resourceTypes } = useResourceTypes({ pluginID: PLUGIN_ID, route: { connection: connectionID } });
  useEffect(() => () => abort.current?.abort(), []);
  const target = selected?.target;
  const intent: ResourceEditorContext['intent'] = selected?.registration.value.intents.includes(intentChoice) ? intentChoice : selected?.registration.value.intents.includes('action') ? 'action' : 'inspect';
  const resourceKey = target ? `k8s:${target.group}/${target.resource}` : '';
  const descriptor = resourceTypes.data?.find((entry) => entry.type === resourceKey);
  const baseContext = target ? catalogEditorContext(source, resourceKey, connectionID, intent, descriptor) : undefined;
  const context: ResourceEditorContext | undefined = target && baseContext ? {
    ...baseContext, ...target, connectionID, intent, name: name || baseContext.name, namespace: target.scope === 'Namespaced' ? namespace || baseContext.namespace : undefined,
    discovery: { ...baseContext.discovery, ...(target.resource === '' ? { status: 'available' as const } : {}), features: { ...baseContext.discovery.features, ...(localCapture && intent === 'inspect' ? { 'host.local-capture': 'available' as const } : {}) } },
  } : undefined;
  const namedTarget = !!target?.resource && selected?.registration.value.request?.protocol !== 'kubernetes.review.v1';
  const loadable = namedTarget && !target?.resource.includes('/');
  const choose = (id: string) => {
    abort.current?.abort(); setBusy(false); setError(undefined); setName(''); setNamespace(''); setLocalCapture(false); setIntentChoice('inspect'); setSelectedID(id);
    const choice = choices.find((entry) => entry.id === id);
    setSource(choice ? stringify({ apiVersion: choice.target.group ? `${choice.target.group}/${choice.target.version}` : choice.target.version, kind: choice.target.kind, ...(choice.registration.value.intents.includes('action') ? { spec: {} } : {}) }) : '');
  };
  const load = async () => {
    if (!context || !loadable || !name) return;
    abort.current?.abort(); const pending = new AbortController(); abort.current = pending; setBusy(true); setError(undefined);
    try { const loaded = await loadResourceEditorSource(context, pending.signal); if (!pending.signal.aborted) { setSource(loaded); setLocalCapture(false); } }
    catch { if (!pending.signal.aborted) setError('Resource could not be loaded. Check target, API availability and permissions.'); }
    finally { if (abort.current === pending) setBusy(false); }
  };
  return <ResourcePortalContext.Provider value={dialog}><Dialog ref={dialog} open onClose={onClose} size="xl" className={styles.Dialog}>
    <Dialog.Close aria-label="Close requests and inspection" /><Dialog.Title className={styles.Title}>Requests & inspection</Dialog.Title>
    <div style={{ padding: '8px 20px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
      <label>Interface <select aria-label="Request or inspection interface" value={selectedID} onChange={(event) => choose(event.target.value)}><option value="">Choose an interface</option>{choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.registration.label} · {entry.target.kind} · {entry.target.group || 'core'}/{entry.target.version}</option>)}</select></label>
      {selected?.registration.value.intents.includes('inspect') && selected.registration.value.intents.includes('action') && <label>Purpose <select aria-label="Interface purpose" value={intent} onChange={(event) => { abort.current?.abort(); setBusy(false); setIntentChoice(event.target.value as 'inspect' | 'action'); }}><option value="inspect">Inspect</option><option value="action">Request</option></select></label>}
      {namedTarget && <Field label={intent === 'action' ? 'Target name' : 'Resource name'} value={name} onChange={setName} disabled={busy} />}
      {target?.scope === 'Namespaced' && target.resource !== '' && <Field label="Namespace" value={namespace} onChange={setNamespace} disabled={busy} />}
      {loadable && <Button size="sm" disabled={busy || !name || target?.scope === 'Namespaced' && !namespace} onClick={() => void load()}>Load resource</Button>}
      {target && <><Button size="sm" variant="ghost" disabled={busy} onClick={() => file.current?.click()}>Import local YAML</Button><input ref={file} hidden type="file" accept=".yaml,.yml,.json" aria-label="Import local inspection or request" onChange={(event) => {
        const selectedFile = event.target.files?.[0]; event.target.value = ''; if (!selectedFile || !context) return;
        abort.current?.abort(); const pending = new AbortController(); abort.current = pending; setBusy(true);
        void selectedFile.text().then((text) => { if (pending.signal.aborted) return; const invalid = validateEditorIdentity(text, context); if (invalid) setError('Imported document must match the selected interface.'); else { setSource(text); setLocalCapture(true); setError(undefined); } }).catch(() => { if (!pending.signal.aborted) setError('Local document could not be read.'); }).finally(() => { if (abort.current === pending) setBusy(false); });
      }} /></>}
    </div>
    <div className={styles.Content}>{selected && context ? <ResourceManifestEditor key={selected.id} value={source} onChange={setSource} resourceKey={resourceKey} connectionID={connectionID} editorContext={context} preferredProviderID={selected.registration.id} disabled={busy} filename="request.yaml" /> : <div role="status" style={{ padding: 20 }}>Choose a request or inspector. This window never creates or saves a named resource.</div>}</div>
    {target?.resource === '' && !selected?.registration.value.request && <div role="note" style={{ padding: '8px 20px' }}>Local capture inspection only. No replay endpoint is available.</div>}
    {error && <div className={styles.Error} role="alert">{error}</div>}
    <Dialog.Footer className={styles.Footer}><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></Dialog.Footer>
  </Dialog></ResourcePortalContext.Provider>;
}
