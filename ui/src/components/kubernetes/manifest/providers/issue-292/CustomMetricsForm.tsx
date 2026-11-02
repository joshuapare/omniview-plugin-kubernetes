import { Button } from '@omniviewdev/base-ui';
import { useEffect, useRef, useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorSection, ExactValueField, KeyValueFields, patchError, patchFields, setDraftField, useFieldValidity } from '../../editor-controls';
import { discoveredMetrics, GROUP, inspectMetricResponse, parseQueryText, PROTOCOL, queryFromDraft, queryIssues, queryPath, supportedVersion, text, type DiscoveredMetric } from './model';
import './custom-metrics.css';

type Discovery = { status: 'loading' } | { status: 'ready'; items: readonly DiscoveredMetric[] } | { status: 'denied' | 'absent' | 'unavailable' | 'unsupported'; message: string };
const statusLabels = { denied: 'Access denied', absent: 'Adapter API not installed', unavailable: 'Adapter unavailable', unsupported: 'Unsupported discovery response' };
const labelKey = (key: string): string | null => /^(?:[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?\/)?[A-Za-z0-9](?:[-A-Za-z0-9_.]*[A-Za-z0-9])?$/.test(key) && key.split('/').at(-1)!.length <= 63 ? null : 'Enter a Kubernetes label key.';
const labelValue = (value: string): string | null => value.length <= 63 && /^(?:[A-Za-z0-9](?:[-A-Za-z0-9_.]*[A-Za-z0-9])?)?$/.test(value) ? null : 'Enter a Kubernetes label value.';

export default function CustomMetricsForm(form: ResourceEditorFormProps) {
  return <CustomMetricsSession key={`${form.draft.sessionID}:${form.context.intent}:${form.context.version}`} {...form} />;
}
function CustomMetricsSession(form: ResourceEditorFormProps) {
  const { context, draft, requestResult } = form;
  const report = useFieldValidity(form);
  const [refresh, setRefresh] = useState(0);
  const discoveryIdentity = JSON.stringify([context.connectionID, context.version, draft.sessionID, refresh]);
  const [discoveryResult, setDiscoveryResult] = useState<{ identity: string; value: Discovery } | null>(null);
  const discovery: Discovery = discoveryResult?.identity === discoveryIdentity ? discoveryResult.value : { status: 'loading' };
  const [patchFailure, setPatchFailure] = useState<string | null>(null);
  const generation = useRef(0);
  const inspection = context.intent === 'inspect';
  const query = queryFromDraft(draft, context);
  const issues = queryIssues(draft, context);
  const queryKey = `${query.resource}/${query.metric}`;
  const selected = discovery.status === 'ready' ? discovery.items.find(item => item.name === queryKey) : undefined;
  const canonicalError = inspection ? null : issues[0]?.message ?? (discovery.status === 'ready' && !selected ? 'Select a discovered resource and metric.' : null);
  useEffect(() => {
    if (inspection || !supportedVersion(context.version)) return;
    const controller = new AbortController();
    const current = ++generation.current;
    void form.actions.execute({ protocol: PROTOCOL, input: { group: GROUP, version: context.version, operation: 'discover' }, sessionID: draft.sessionID, generation: draft.revision, signal: controller.signal }).then(result => {
      if (controller.signal.aborted || current !== generation.current) return;
      if (result.status !== 'ready') {
        if (result.status === 'cancelled') return;
        const status = result.status === 'invalid' ? 'unsupported' : result.status;
        setDiscoveryResult({ identity: discoveryIdentity, value: { status, message: statusLabels[status] } });
        return;
      }
      if (result.sensitive) { setDiscoveryResult({ identity: discoveryIdentity, value: { status: 'unsupported', message: 'Sensitive discovery output is not displayed.' } }); return; }
      const items = discoveredMetrics(result.output, context.version as 'v1beta1' | 'v1beta2');
      setDiscoveryResult({ identity: discoveryIdentity, value: items ? { status: 'ready', items } : { status: 'unsupported', message: statusLabels.unsupported } });
    }).catch(() => { if (!controller.signal.aborted && current === generation.current) setDiscoveryResult({ identity: discoveryIdentity, value: { status: 'unavailable', message: statusLabels.unavailable } }); });
    return () => { controller.abort(); ++generation.current; };
  }, [discoveryIdentity, inspection, context.version, context.connectionID, draft.sessionID, form.actions, refresh]);

  const commit = (operations: readonly ResourceEditorPatch[]) => {
    const error = patchError(patchFields(form, operations));
    setPatchFailure(error);
    report('patch', error);
  };
  const field = (name: string, label: string, help: string, required = false) => <ExactValueField
    label={label} value={text(draft.get(['query', name]))} identity={`${draft.sessionID}:query:${name}`}
    help={help} disabled={form.disabled} parse={value => parseQueryText(name, value, required)}
    onCommit={value => patchError(setDraftField(form, ['query', name], value))} onValidityChange={error => report(name, error)} />;

  const inspectionBody = { apiVersion: draft.get(['apiVersion']), kind: draft.get(['kind']), items: draft.get(['items']), describedObject: draft.get(['describedObject']), metric: draft.get(['metric']), metricName: draft.get(['metricName']), selector: draft.get(['selector']), timestamp: draft.get(['timestamp']), window: draft.get(['window']), windowSeconds: draft.get(['windowSeconds']), value: draft.get(['value']) };
  const output = inspection ? inspectionBody : requestResult?.status === 'ready' && !requestResult.sensitive ? requestResult.output : undefined;
  const response = output === undefined || !supportedVersion(context.version) ? undefined : inspectMetricResponse(output, context.version);
  if (inspection || form.section === 'results') return <div className="custom-metrics-form"><EditorSection title="Metric samples">
    <p className="custom-metrics-consequence">Adapter-owned observations · Read only</p>
    {!inspection && !requestResult && <p role="status">Run the query to inspect samples.</p>}
    {requestResult && requestResult.status !== 'ready' && <p role="status">{requestResult.status === 'denied' ? 'Access denied' : requestResult.status === 'absent' ? 'Adapter API not installed' : requestResult.status === 'invalid' ? 'Query rejected. Check the selected metric and selectors.' : requestResult.status === 'cancelled' ? 'Query cancelled' : 'Adapter unavailable'}</p>}
    {requestResult?.status === 'ready' && requestResult.sensitive && <p role="status">Sensitive response withheld.</p>}
    {response?.status === 'unsupported' && <p role="status">{response.message}</p>}
    {response?.status === 'ready' && response.samples.length === 0 && <p role="status">No samples matched. No zero value is inferred.</p>}
    {response?.status === 'ready' && response.samples.map((sample, index) => <article className="custom-metrics-sample" key={`${sample.object.namespace}/${sample.object.name}/${sample.metric}/${index}`}>
      <h4>{sample.object.kind} · {sample.object.namespace ? `${sample.object.namespace}/` : ''}{sample.object.name}</h4>
      <dl><dt>Metric</dt><dd>{sample.metric}</dd><dt>Value</dt><dd className="custom-metrics-quantity">{sample.value}</dd><dt>Observed</dt><dd>{sample.timestamp}</dd><dt>Calculation window</dt><dd>{sample.window}</dd><dt>Object API</dt><dd>{sample.object.apiVersion}</dd><dt>Returned metric selector</dt><dd>{sample.selector}</dd></dl>
    </article>)}
  </EditorSection></div>;

  return <div className="custom-metrics-form"><EditorSection title="Custom metric query">
    <div className="custom-metrics-toolbar"><span>{GROUP}/{context.version}</span><Button size="sm" variant="ghost" disabled={discovery.status === 'loading' || form.disabled} onClick={() => setRefresh(value => value + 1)}>Refresh metrics</Button></div>
    {discovery.status === 'loading' && <p role="status">Discovering adapter metrics…</p>}
    {discovery.status !== 'loading' && discovery.status !== 'ready' && <p role="status">{discovery.message}</p>}
    {discovery.status === 'ready' && discovery.items.length === 0 && <p role="status">No GET-capable metrics were discovered.</p>}
    <EditorChoice label="Resource / metric" value={query.resource && query.metric ? queryKey : ''} disabled={form.disabled || discovery.status !== 'ready'}
      options={[{ value: '', label: 'Select a discovered metric' }, ...(discovery.status === 'ready' ? discovery.items.map(item => ({ value: item.name, label: `${item.resource} · ${item.metric} · ${item.namespaced ? 'Namespaced' : 'Cluster'}` })) : [])]}
      help="Only metrics advertised by the installed adapter appear. Discovery does not prove authorization or adapter health."
      error={query.resource && discovery.status === 'ready' && !selected ? 'This metric is no longer advertised. Refresh or choose another metric.' : undefined}
      onChange={name => {
        if (discovery.status !== 'ready') return;
        const item = discovery.items.find(candidate => candidate.name === name);
        if (!item) return;
        commit([{ op: 'set', path: ['query', 'resource'], value: item.resource }, { op: 'set', path: ['query', 'metric'], value: item.metric }, { op: 'set', path: ['query', 'namespaced'], value: item.namespaced },
          ...(query.name === '*' && item.resource === 'namespaces' ? [{ op: 'set' as const, path: ['query', 'name'], value: '' }, { op: 'remove' as const, path: ['query', 'labelSelector'] }] : []),
          ...(item.namespaced && !draft.has(['query', 'namespace']) && context.namespace ? [{ op: 'set' as const, path: ['query', 'namespace'], value: context.namespace }] : []),
          ...(!item.namespaced && draft.has(['query', 'namespace']) ? [{ op: 'remove' as const, path: ['query', 'namespace'] }] : [])]);
      }} />
    {query.namespace !== undefined && field('namespace', 'Namespace', 'One explicit namespace scopes the metric request.', true)}
    <EditorChoice label="Objects" value={query.name === '*' ? 'matching' : 'single'} disabled={form.disabled || !query.resource || query.resource === 'namespaces'} options={[{ value: 'single', label: query.resource === 'namespaces' ? 'One namespace' : 'One object' }, { value: 'matching', label: 'Matching objects' }]}
      help="Matching objects uses the wildcard endpoint and an optional object label selector. Namespace metrics require a single namespace."
      onChange={mode => commit([{ op: 'set', path: ['query', 'name'], value: mode === 'matching' ? '*' : '' }, ...(mode === 'single' && draft.has(['query', 'labelSelector']) ? [{ op: 'remove' as const, path: ['query', 'labelSelector'] }] : [])])} />
    {query.name === '*' ? field('labelSelector', 'Object selector', 'Native Kubernetes label selector. This filters described objects, not metric series.') : field('name', query.resource === 'namespaces' ? 'Namespace object' : 'Object name', 'Exact existing object name. This query never changes the object.', true)}
    <KeyValueFields form={{ ...form, onValidityChange: error => report('metricLabels', error) }} path={['query', 'metricLabels']} label="Metric label filters" validateKey={labelKey} validateValue={labelValue} />
    <details><summary>Advanced metric selector</summary>{field('metricLabelSelector', 'Metric selector expression', 'Native metricLabelSelector syntax, including in, notin, existence and inequality. Combined with label rows using AND; this is not the returned selector.')}</details>
    <details><summary>Request review</summary><p className="custom-metrics-consequence">GET only · No resource is created or changed</p><code className="custom-metrics-path">{issues.length ? 'Complete the query to review its destination.' : queryPath(query)}</code></details>
    {canonicalError && <p role="status">{canonicalError}</p>}
    {patchFailure && <p role="alert">{patchFailure}</p>}
  </EditorSection></div>;
}
