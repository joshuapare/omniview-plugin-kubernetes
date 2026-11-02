import { Button } from '@omniviewdev/base-ui';
import { useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection, ExactValueField, KeyValueFields, ReferencePicker, patchError, setDraftField, removeDraftField, scalarText, useFieldValidity } from '../../editor-controls';
import { moduleError, publicModuleReference } from './model';

export default function WasmPluginForm(form: ResourceEditorFormProps) {
  const report = useFieldValidity(form);
  const text = (path: ResourceEditorPath) => scalarText(form.draft.get(path));
  const commit = (path: ResourceEditorPath, value: Parameters<typeof setDraftField>[2]) => patchError(value === '' ? removeDraftField(form, path) : setDraftField(form, path, value));
  const apply = (operations: ResourceEditorPatch[]) => report('patch', patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations })));
  const field = (key: string, label: string, help?: string) => <ExactValueField key={key} label={label} help={help} value={text(['spec', key])} identity={`${form.draft.sessionID}:${key}`} disabled={form.disabled} parse={value => ({ valid: true, value })} onCommit={value => commit(['spec', key], value)} onValidityChange={error => report(key, error)} />;
  const choice = (path: ResourceEditorPath, label: string, values: string[]) => <EditorChoice label={label} value={text(path)} disabled={form.disabled} options={['', ...values].map(value => ({ value, label: value || 'Not specified' }))} onChange={value => report(label, commit(path, value))} />;
  const list = (path: ResourceEditorPath): readonly unknown[] => { const value = form.draft.get(path); return Array.isArray(value) ? value : []; };
  const add = (path: ResourceEditorPath, value: unknown) => apply(form.draft.has(path) ? [{ op: 'insert', path, index: list(path).length, value }] : [{ op: 'set', path, value: [value] }]);
  const remove = (path: ResourceEditorPath) => apply([{ op: 'remove', path }]);
  const rowField = (path: ResourceEditorPath, label: string, sensitive = false) => <ExactValueField label={label} value={sensitive ? '' : text(path)} type={sensitive ? 'password' : 'text'} placeholder={sensitive && form.draft.has(path) ? 'Stored value unchanged' : undefined} identity={`${form.draft.sessionID}:${JSON.stringify(path)}`} disabled={form.disabled} parse={value => ({ valid: true, value })} onCommit={value => commit(path, value)} onValidityChange={error => report(JSON.stringify(path), error)} />;
  if (form.section === 'module') return <EditorSection title="Trusted proxy module">
    <ExactValueField label="Module reference" help="OCI image (default scheme), HTTP(S), or file:// inside the proxy. No module is downloaded. Use Registry Secret for credentials." value={publicModuleReference(form.draft.get(['spec', 'url']))} placeholder={form.draft.has(['spec', 'url']) ? 'Stored reference unchanged' : 'oci://registry/module:v1'} identity={`${form.draft.sessionID}:url`} disabled={form.disabled} parse={value => {
      const error = moduleError(value, text(['spec', 'sha256']));
      return error ? { valid: false, error } : { valid: true, value };
    }} onCommit={value => commit(['spec', 'url'], value)} onValidityChange={error => report('url', error)} />
    {field('sha256', 'SHA-256', '64 lowercase hex characters; must match an @sha256 digest in the module reference.')}
    {choice(['spec', 'imagePullPolicy'], 'Pull policy', ['IfNotPresent', 'Always'])}
    <ReferencePicker form={form} query={{ group: '', version: 'v1', resource: 'secrets', namespace: form.context.namespace, projection: 'secretType' }} label="Registry Secret" value={text(['spec', 'imagePullSecret'])} onChange={value => report('secret', commit(['spec', 'imagePullSecret'], value))} help="Same-namespace Docker pull Secret. Only names and Secret type are queried." />
    <span role="note">Only run trusted modules compatible with your proxies.</span>
  </EditorSection>;
  if (form.section === 'targets') {
    const mode = form.draft.has(['spec', 'targetRefs']) ? 'resources' : form.draft.has(['spec', 'selector']) ? 'labels' : 'all';
    return <EditorSection title="Workload attachment"><EditorChoice label="Attach to" value={mode} disabled={form.disabled} options={[{ value: 'labels', label: 'Workload labels' }, { value: 'resources', label: 'Resource targets' }, { value: 'all', label: 'All applicable workloads' }]} onChange={value => apply([
      ...(form.draft.has(['spec', 'selector']) ? [{ op: 'remove' as const, path: ['spec', 'selector'] }] : []),
      ...(form.draft.has(['spec', 'targetRefs']) ? [{ op: 'remove' as const, path: ['spec', 'targetRefs'] }] : []),
      ...(value === 'labels' ? [{ op: 'set' as const, path: ['spec', 'selector', 'matchLabels'], value: {} }] : value === 'resources' ? [{ op: 'set' as const, path: ['spec', 'targetRefs'], value: [] }] : []),
    ])} />
      {mode === 'all' && <span role="alert">Applies namespace-wide; config-root namespace can affect the whole mesh.</span>}
      {mode === 'labels' && <><KeyValueFields form={form} path={['spec', 'selector', 'matchLabels']} label="Workload label" /><span role="note">Waypoint proxies ignore label selectors.</span></>}
      {mode === 'resources' && <><span role="alert">Mixed revisions before Istio 1.22 may interpret targets as namespace-wide. Pin a compatible revision.</span>{list(['spec', 'targetRefs']).map((_, i) => <div key={i}>
        <EditorChoice label={`Target ${i + 1} kind`} value={text(['spec', 'targetRefs', i, 'kind'])} disabled={form.disabled} options={['Gateway', 'GatewayClass', 'Service', 'ServiceEntry'].map(value => ({ value, label: value }))} onChange={value => apply([{ op: 'set', path: ['spec', 'targetRefs', i, 'kind'], value }, { op: 'set', path: ['spec', 'targetRefs', i, 'group'], value: value === 'Service' ? '' : value === 'ServiceEntry' ? 'networking.istio.io' : 'gateway.networking.k8s.io' }])} />
        {rowField(['spec', 'targetRefs', i, 'name'], `Target ${i + 1} name`)}<Button size="sm" disabled={form.disabled} onClick={() => remove(['spec', 'targetRefs', i])}>Remove target</Button>
      </div>)}<Button size="sm" disabled={form.disabled || list(['spec', 'targetRefs']).length >= 16} onClick={() => add(['spec', 'targetRefs'], { group: 'gateway.networking.k8s.io', kind: 'Gateway', name: '' })}>Add target</Button><EditorHelp label="Target requirements">Service attachment requires a waypoint. GatewayClass requires verified config-root namespace. Other targets stay in the policy namespace.</EditorHelp></>}
    </EditorSection>;
  }
  if (form.section === 'execution') return <EditorSection title="Proxy execution">
    {choice(['spec', 'type'], 'Extension type', ['HTTP', 'NETWORK'])}{choice(['spec', 'phase'], 'Phase', ['AUTHN', 'AUTHZ', 'STATS'])}
    <ExactValueField label="Priority" value={text(['spec', 'priority'])} identity={`${form.draft.sessionID}:priority`} disabled={form.disabled} help="Higher priority runs first within a phase." parse={value => !value ? { valid: true, value: '' } : /^-?\d+$/.test(value) && BigInt(value) >= -2147483648n && BigInt(value) <= 2147483647n ? { valid: true, value: Number(value) } : { valid: false, error: 'Enter a signed 32-bit integer.' }} onCommit={value => commit(['spec', 'priority'], value)} onValidityChange={error => report('priority', error)} />
    {choice(['spec', 'failStrategy'], 'Fatal error strategy', ['FAIL_CLOSE', 'FAIL_OPEN', 'FAIL_RELOAD'])}
    {text(['spec', 'failStrategy']) === 'FAIL_OPEN' && <span role="alert">Failures bypass this plugin, including authentication and authorization.</span>}
    {text(['spec', 'failStrategy']) === 'FAIL_RELOAD' && <span role="note">Reload handles runtime errors only; other failures close traffic.</span>}
    <details><summary>Traffic matching</summary>{list(['spec', 'match']).map((_, i) => <div key={i}>{choice(['spec', 'match', i, 'mode'], `Traffic ${i + 1} direction`, ['CLIENT', 'SERVER', 'CLIENT_AND_SERVER'])}{list(['spec', 'match', i, 'ports']).map((_, j) => <div key={j}><ExactValueField label={`Destination port ${j + 1}`} value={text(['spec', 'match', i, 'ports', j, 'number'])} identity={`${form.draft.sessionID}:port:${i}:${j}`} disabled={form.disabled} parse={value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535 ? { valid: true, value: Number(value) } : { valid: false, error: 'Use port 1–65535.' }} onCommit={value => commit(['spec', 'match', i, 'ports', j, 'number'], value)} onValidityChange={error => report(`port:${i}:${j}`, error)} /><Button size="sm" disabled={form.disabled} onClick={() => remove(['spec', 'match', i, 'ports', j])}>Remove port</Button></div>)}<Button size="sm" disabled={form.disabled} onClick={() => add(['spec', 'match', i, 'ports'], { number: 80 })}>Add port</Button><Button size="sm" disabled={form.disabled} onClick={() => remove(['spec', 'match', i])}>Remove traffic rule</Button></div>)}<Button size="sm" disabled={form.disabled} onClick={() => add(['spec', 'match'], {})}>Add traffic rule</Button></details>
  </EditorSection>;
  return <EditorSection title="Plugin configuration">{field('pluginName', 'Plugin root ID')}
    <Configuration form={form} />
    <details><summary>VM environment</summary>{list(['spec', 'vmConfig', 'env']).map((_, i) => <div key={i}>{rowField(['spec', 'vmConfig', 'env', i, 'name'], `Environment ${i + 1} name`)}<EditorChoice label={`Environment ${i + 1} source`} value={text(['spec', 'vmConfig', 'env', i, 'valueFrom']) || 'INLINE'} disabled={form.disabled} options={['INLINE', 'HOST'].map(value => ({ value, label: value }))} onChange={value => apply([{ op: 'set', path: ['spec', 'vmConfig', 'env', i, 'valueFrom'], value }, ...(value === 'HOST' && form.draft.has(['spec', 'vmConfig', 'env', i, 'value']) ? [{ op: 'remove' as const, path: ['spec', 'vmConfig', 'env', i, 'value'] }] : [])])} />{text(['spec', 'vmConfig', 'env', i, 'valueFrom']) !== 'HOST' && rowField(['spec', 'vmConfig', 'env', i, 'value'], `Environment ${i + 1} replacement value`, true)}<Button size="sm" disabled={form.disabled} onClick={() => remove(['spec', 'vmConfig', 'env', i])}>Remove environment</Button></div>)}<Button size="sm" disabled={form.disabled || list(['spec', 'vmConfig', 'env']).length >= 256} onClick={() => add(['spec', 'vmConfig', 'env'], { name: '', valueFrom: 'INLINE' })}>Add environment</Button></details>
  </EditorSection>;
}
function Configuration({ form }: { form: ResourceEditorFormProps }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const report = useFieldValidity(form);
  return <div><EditorField label="Replacement configuration JSON" value={value} type="password" disabled={form.disabled} error={error} onChange={next => { setValue(next); report('config', next ? 'Apply or clear pending configuration.' : null); }} help="Configuration is masked and never read back. Explicit replacement overwrites the complete configuration. Blank leaves existing configuration unchanged." /><Button size="sm" disabled={form.disabled || !value} onClick={() => {
    let parsed: unknown;
    try { parsed = JSON.parse(value, (_key, item: unknown) => { if (typeof item === 'number' && (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))) throw new Error('Unsafe number'); return item; }); } catch { setError('Enter a valid JSON object with safe numeric values.'); report('config', 'Invalid configuration JSON.'); return; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { setError('Enter a JSON object.'); report('config', 'Configuration must be an object.'); return; }
    const failure = patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [{ op: 'set', path: ['spec', 'pluginConfig'], value: parsed }] })); setError(failure); report('config', failure); if (!failure) setValue('');
  }}>Replace configuration</Button></div>;
}
