import { useEffect, useId, useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorActionResult, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorField, EditorHelp, EditorSection } from '../../editor-controls';
import { discoveredMetrics, exactWindow, group, metricRows, protocol, queryInput, record, text, validateQuery, version } from './model';
import './query.css';

export default function ExternalMetricQuery(props: ResourceEditorFormProps) {
  return <QuerySession key={props.draft.sessionID} {...props} />;
}
function QuerySession(props: ResourceEditorFormProps) {
  const { context, draft, actions, section, disabled, requestResult } = props;
  const catalogIdentity = JSON.stringify([draft.sessionID, context.connectionID, context.discovery.status]);
  const [catalogResult, setCatalogResult] = useState<{ identity: string; value: ResourceEditorActionResult }>();
  const catalog = catalogResult?.identity === catalogIdentity ? catalogResult.value : undefined;
  const [patchFailure, setPatchFailure] = useState<string | null>(null);
  const [filters, setFilters] = useState<readonly { id: number; key: string; value: string }[]>([]);
  const [nextFilter, setNextFilter] = useState(0);
  const catalogID = useId();
  const input = queryInput(draft, context);
  const issues = validateQuery(draft, context);
  const problem = patchFailure || (context.intent === 'action' ? issues[0]?.message : null) || null;
  useEffect(() => { props.onValidityChange(patchFailure); }, [patchFailure, props.onValidityChange]);
  useEffect(() => {
    const abort = new AbortController();
    if (context.discovery.status !== 'available') return () => abort.abort();
    actions.execute({ protocol, input: { group, version, operation: 'discover' }, sessionID: draft.sessionID, generation: draft.revision, signal: abort.signal }).then(result => {
      if (!abort.signal.aborted) setCatalogResult({ identity: catalogIdentity, value: result });
    }).catch(() => { if (!abort.signal.aborted) setCatalogResult({ identity: catalogIdentity, value: { status: 'unavailable', message: 'Metric discovery unavailable.' } }); });
    return () => abort.abort();
  }, [catalogIdentity, actions, draft.sessionID, context.connectionID, context.discovery.status]);
  const metrics = catalog?.status === 'ready' ? discoveredMetrics(catalog.output) : [];
  const commit = (field: string, value: string) => {
    const result = props.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations: [{ op: 'set', path: ['query', field], value }] });
    setPatchFailure(result.status === 'accepted' ? null : result.message);
  };
  const response = requestResult?.status === 'ready' && !requestResult.sensitive ? requestResult.output : undefined;
  const rows = response === undefined ? metricRows(draft.get([])) : metricRows(response);
  if (section === 'values' || context.intent === 'inspect') return <EditorSection title="Adapter-owned values">
    <p>Read-only response · No metric or autoscaling changes.</p>
    {requestResult && requestResult.status !== 'ready' && <p role="status">{requestResult.status === 'denied' ? 'Query denied.' : requestResult.status === 'absent' ? 'Metric API absent.' : requestResult.status === 'invalid' ? 'Query rejected.' : requestResult.status === 'cancelled' ? 'Query cancelled.' : 'Adapter unavailable.'}</p>}
    {requestResult?.status === 'ready' && requestResult.sensitive && <p>Response hidden by privacy policy.</p>}
    {rows.length === 0 ? <p>{response === undefined ? 'Run a query to inspect values.' : 'No matching series.'}</p> : <div className="external-metrics-series">{rows.map((row, index) => <article key={index}>
      <h4>{text(row.metricName) || 'Unnamed metric'}</h4>
      <dl><dt>Value</dt><dd><code>{text(row.value) || 'Unsupported quantity representation'}</code></dd><dt>Produced at</dt><dd>{text(row.timestamp) || 'Not supplied'}</dd><dt>Window</dt><dd>{exactWindow(row.window)}</dd></dl>
      <details><summary>Series labels</summary><dl>{Object.entries(record(row.metricLabels)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{text(value)}</dd></div>)}</dl></details>
    </article>)}</div>}
  </EditorSection>;
  return <EditorSection title="External metric query">
    <p>Read-only GET · Adapter required.</p>
    <EditorField label="Namespace" value={input.namespace} disabled={disabled} onChange={value => commit('namespace', value)} help="Namespace scopes this request, not the physical external system." />
    <EditorField label="Metric" value={input.resource} list={catalogID} disabled={disabled} onChange={value => commit('metric', value)} help="Use the exact metric name advertised by the installed adapter. Discovery does not grant permission." />
    <datalist id={catalogID}>{metrics.map(metric => <option key={metric} value={metric} />)}</datalist>
    <p role="status">{context.discovery.status !== 'available' ? `API discovery: ${context.discovery.status}` : !catalog ? 'Discovering metrics…' : catalog.status !== 'ready' ? `Metric discovery: ${catalog.status}` : metrics.length === 0 ? 'No advertised namespaced metrics.' : `${metrics.length} advertised metrics`}</p>
    <details><summary>Equality filter builder</summary>
      {filters.map(filter => <div key={filter.id} className="external-metrics-filter">
        <EditorField label="Label key" value={filter.key} disabled={disabled} onChange={key => setFilters(current => current.map(row => row.id === filter.id ? { ...row, key } : row))} />
        <EditorField label="Label value" value={filter.value} disabled={disabled} onChange={value => setFilters(current => current.map(row => row.id === filter.id ? { ...row, value } : row))} />
        <Button disabled={disabled} onClick={() => setFilters(current => current.filter(row => row.id !== filter.id))}>Remove filter</Button>
      </div>)}
      <Button disabled={disabled} onClick={() => { setFilters(current => [...current, { id: nextFilter, key: '', value: '' }]); setNextFilter(current => current + 1); }}>Add filter</Button>
      <Button disabled={disabled || filters.length === 0 || filters.some(row => !/^[A-Za-z0-9_./-]+$/.test(row.key) || !/^[A-Za-z0-9_.-]*$/.test(row.value))} onClick={() => commit('labelSelector', filters.map(row => `${row.key}=${row.value}`).join(','))}>Use equality filters</Button>
    </details>
    <details><summary>Advanced selector <EditorHelp label="Label selector">Kubernetes label selector grammar supports equality, inequality, existence, and set expressions. Filters select time series; they never change metricLabels.</EditorHelp></summary>
      <EditorField label="Label selector" value={input.labelSelector} disabled={disabled} onChange={value => commit('labelSelector', value)} />
    </details>
    {problem && <p role="alert">{problem}</p>}
    <details><summary>Request destination</summary><code className="external-metrics-destination">GET /apis/{group}/{version}/namespaces/{encodeURIComponent(input.namespace)}/{encodeURIComponent(input.resource)}{input.labelSelector ? `?labelSelector=${encodeURIComponent(input.labelSelector)}` : ''}</code></details>
  </EditorSection>;
}
