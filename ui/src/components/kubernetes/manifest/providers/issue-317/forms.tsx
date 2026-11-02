import { Button } from '@omniviewdev/base-ui';
import { useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection, ExactValueField, ReferencePicker, scalarText, useFieldValidity, type ExactParseResult } from '../../editor-controls';
import { allocatorReadOnly, boundedInteger, duration, ratio, toggleMember } from './policy';

function useControls(form: ResourceEditorFormProps) {
  const validity = useFieldValidity(form);
  const disabled = form.disabled || form.context.intent === 'inspect' || (form.context.kind === 'TargetAllocator' && allocatorReadOnly(form.draft, form.context));
  const commit = (operations: ResourceEditorPatch[]) => {
    if (disabled) return 'Resource is read-only.';
    const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
    const error = result.status === 'accepted' ? null : result.message;
    validity('patch', error);
    return error;
  };
  const text = (label: string, path: ResourceEditorPath, help?: string) => <EditorField key={path.join('.')} label={label} value={scalarText(form.draft.get(path))} disabled={disabled} help={help} onChange={value => commit([{ op: 'set', path, value }])} />;
  const choice = (label: string, path: ResourceEditorPath, values: string[], help?: string) => <EditorChoice key={path.join('.')} label={label} value={scalarText(form.draft.get(path))} disabled={disabled} help={help} options={values.map(value => ({ value, label: value }))} onChange={value => commit([{ op: 'set', path, value }])} />;
  const boolean = (label: string, path: ResourceEditorPath, help?: string) => <EditorChoice key={path.join('.')} label={label} value={form.draft.has(path) ? String(form.draft.get(path)) : ''} options={[{ value: '', label: 'Operator default' }, { value: 'true', label: 'Enabled' }, { value: 'false', label: 'Disabled' }]} disabled={disabled} help={help} onChange={value => commit([value === '' ? { op: 'remove', path } : { op: 'set', path, value: value === 'true' }])} />;
  const exact = (label: string, path: ResourceEditorPath, parse: (text: string) => ExactParseResult) => <ExactValueField key={path.join('.')} identity={`${form.draft.sessionID}:${path.join('.')}`} label={label} value={scalarText(form.draft.get(path))} disabled={disabled} parse={parse} onCommit={value => commit([{ op: 'set', path, value }])} onValidityChange={error => validity(path.join('.'), error)} />;
  const account = <ReferencePicker form={form} label="Service account" value={scalarText(form.draft.get(['spec', 'serviceAccount']))} disabled={disabled} query={{ group: '', version: 'v1', resource: 'serviceaccounts', namespace: form.context.namespace }} onChange={value => commit([{ op: 'set', path: ['spec', 'serviceAccount'], value }])} help="Existing account only. Lookup does not establish permission." />;
  return { text, choice, boolean, exact, account, commit, disabled };
}

export function Collector(form: ResourceEditorFormProps) {
  const c = useControls(form);
  const [exporterName, setExporterName] = useState('');
  const [pipelineName, setPipelineName] = useState('');
  const config = form.draft.get(['spec', 'config']);
  if (config !== undefined && (typeof config !== 'object' || config === null || Array.isArray(config))) return <p role="status">Collector configuration requires structured v1beta1 source.</p>;
  const exporters = form.draft.get(['spec', 'config', 'exporters']);
  const pipelines = form.draft.get(['spec', 'config', 'service', 'pipelines']);
  return <EditorSection title="Collector"><p role="note">Mode and pipeline changes can interrupt telemetry.</p>
    {c.choice('Deployment mode', ['spec', 'mode'], ['deployment', 'daemonset', 'statefulset', 'sidecar'])}
    {form.draft.get(['spec', 'mode']) !== 'daemonset' && form.draft.get(['spec', 'mode']) !== 'sidecar' && c.exact('Replicas', ['spec', 'replicas'], boundedInteger)}
    {c.boolean('Target allocator', ['spec', 'targetAllocator', 'enabled'], 'Requires Prometheus receiver configuration and operator support.')}
    <EditorField label="New OTLP exporter name" value={exporterName} disabled={c.disabled} onChange={setExporterName} help="Use otlp or otlp/name. Configure its endpoint after adding." />
    <Button size="sm" disabled={c.disabled || !/^otlp(?:\/[A-Za-z0-9_-]+)?$/.test(exporterName) || form.draft.has(['spec', 'config', 'exporters', exporterName])} onClick={() => { if (!c.commit([{ op: 'set', path: ['spec', 'config', 'exporters', exporterName], value: {} }])) setExporterName(''); }}>Add exporter</Button>
    <EditorField label="New pipeline name" value={pipelineName} disabled={c.disabled} onChange={setPipelineName} help="Use traces, metrics, logs, or a named variant such as traces/backend. Wire receiver and exporter components in source." />
    <Button size="sm" disabled={c.disabled || !/^(traces|metrics|logs)(?:\/[A-Za-z0-9_-]+)?$/.test(pipelineName) || form.draft.has(['spec', 'config', 'service', 'pipelines', pipelineName])} onClick={() => { if (!c.commit([{ op: 'set', path: ['spec', 'config', 'service', 'pipelines', pipelineName], value: { receivers: [], processors: [], exporters: [] } }])) setPipelineName(''); }}>Add pipeline</Button>
    <EditorSection title="Exporter endpoints">{exporters && typeof exporters === 'object' && !Array.isArray(exporters) ? Object.keys(exporters).filter(name => name.split('/')[0] === 'otlp' || name.split('/')[0] === 'otlphttp').map(name => c.text(name, ['spec', 'config', 'exporters', name, 'endpoint'], 'Credentials and headers remain masked in source.')) : <span>No OTLP exporter configured.</span>}</EditorSection>
    <EditorSection title="Telemetry pipelines">{pipelines && typeof pipelines === 'object' && !Array.isArray(pipelines) ? Object.keys(pipelines).map(name => {
      const path = ['spec', 'config', 'service', 'pipelines', name, 'processors'];
      const value = form.draft.get(path);
      const supported = value === undefined || Array.isArray(value) && value.every(item => typeof item === 'string');
      return <div key={name}><strong>{name}</strong><Button size="sm" disabled={c.disabled || !supported} onClick={() => {
        const operations = toggleMember(path, value, 'batch');
        if (!(Array.isArray(value) && value.includes('batch')) && !form.draft.has(['spec', 'config', 'processors', 'batch'])) operations.unshift({ op: 'set', path: ['spec', 'config', 'processors', 'batch'], value: {} });
        c.commit(operations);
      }}>{Array.isArray(value) && value.includes('batch') ? 'Remove batch from pipeline' : 'Add batch to pipeline'}</Button></div>;
    }) : <span>Configure receivers and pipelines in source.</span>}</EditorSection>
    <details><summary>Advanced deployment</summary>{c.text('Image', ['spec', 'image'])}{c.account}</details>
  </EditorSection>;
}

export function Instrumentation(form: ResourceEditorFormProps) {
  const c = useControls(form);
  const propagators = form.draft.get(['spec', 'propagators']);
  const sampler = form.draft.get(['spec', 'sampler', 'type']);
  return <EditorSection title="Instrumentation"><p role="note">Workloads must opt in. Creating this resource does not instrument existing Pods.</p>
    {c.text('Exporter endpoint', ['spec', 'exporter', 'endpoint'])}
    {c.choice('Sampler', ['spec', 'sampler', 'type'], ['always_on', 'always_off', 'traceidratio', 'parentbased_always_on', 'parentbased_always_off', 'parentbased_traceidratio'])}
    {typeof sampler === 'string' && sampler.includes('traceidratio') && c.exact('Sampling ratio', ['spec', 'sampler', 'argument'], ratio)}
    <EditorSection title="Propagation">{['tracecontext', 'baggage', 'b3', 'b3multi', 'jaeger', 'xray', 'ottrace'].map(name => <Button key={name} size="sm" disabled={c.disabled || propagators !== undefined && (!Array.isArray(propagators) || !propagators.every(item => typeof item === 'string'))} onClick={() => c.commit(toggleMember(['spec', 'propagators'], propagators, name))}>{Array.isArray(propagators) && propagators.includes(name) ? 'Remove' : 'Add'} {name}</Button>)}</EditorSection>
    <details><summary>Language images</summary>{['java', 'python', 'nodejs', 'dotnet', 'go', 'apacheHttpd', 'nginx'].map(language => c.text(`${language} image`, ['spec', language, 'image'], 'Injection requires installed operator language support and workload opt-in.'))}</details>
  </EditorSection>;
}

export function Bridge(form: ResourceEditorFormProps) {
  const c = useControls(form);
  return <EditorSection title="OpAMP bridge">{c.text('Server endpoint', ['spec', 'endpoint'])}{c.boolean('Accept remote configuration', ['spec', 'capabilities', 'AcceptsRemoteConfig'])}{c.boolean('Report effective configuration', ['spec', 'capabilities', 'ReportsEffectiveConfig'])}
    {form.draft.get(['spec', 'capabilities', 'AcceptsRemoteConfig']) === true && <p role="note">Remote server can change Collector configuration.</p>}
    {c.exact('Replicas', ['spec', 'replicas'], text => boundedInteger(text, 1))}{c.account}
    <details><summary>Advanced deployment</summary>{c.text('Image', ['spec', 'image'])}{c.choice('Upgrade strategy', ['spec', 'upgradeStrategy'], ['automatic', 'none'])}</details>
  </EditorSection>;
}

export function Allocator(form: ResourceEditorFormProps) {
  const c = useControls(form);
  return <EditorSection title="Target allocation">{allocatorReadOnly(form.draft, form.context) ? <p role="status">Inspection only. Edit Collector spec.targetAllocator for generated allocators. Independent ownership must be established before authoring.</p> : <p role="note">Allocation changes can reassign scrape targets.</p>}
    {c.choice('Allocation strategy', ['spec', 'allocationStrategy'], ['consistent-hashing', 'least-weighted', 'per-node'], 'Only consistent-hashing supports high availability.')}
    {form.draft.get(['spec', 'allocationStrategy']) === 'per-node' && <p role="note">Requires daemonset collectors. Targets without a node are skipped.</p>}
    {c.choice('Filter strategy', ['spec', 'filterStrategy'], ['relabel-config'])}
    {c.exact('Collector not-ready grace period', ['spec', 'collectorNotReadyGracePeriod'], duration)}
    {c.boolean('Discover Prometheus monitors', ['spec', 'prometheusCR', 'enabled'], 'Discovery follows service-account permissions and may cross namespaces. Empty selectors select all; null selects none.')}{c.account}
    <details><summary>Advanced deployment</summary>{c.text('Image', ['spec', 'image'])}{c.exact('Replicas', ['spec', 'replicas'], boundedInteger)}</details>
  </EditorSection>;
}
