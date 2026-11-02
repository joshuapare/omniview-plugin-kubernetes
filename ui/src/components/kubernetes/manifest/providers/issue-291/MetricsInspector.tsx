import { useState } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorField, EditorHelp, EditorSection } from '../../editor-controls';
import { metricsAccess, metricsQueryAccess, readDraftMetrics, readMetricsResponse, type MetricsKind, type MetricsRead } from './metricsModel';
import styles from './MetricsInspector.module.css';

const responseMessages = {
  denied: 'Metrics query is not authorized.',
  absent: 'Metrics API or query transport is not available.',
  unavailable: 'Metrics service is unavailable. No usage was inferred.',
  invalid: 'Metrics query could not be processed.',
  cancelled: 'Metrics query was cancelled.',
} as const;

export default function MetricsInspector(props: ResourceEditorFormProps & { metricsKind: MetricsKind }) {
  return <MetricsSession key={`${props.draft.sessionID}:${props.context.group}:${props.context.version}:${props.context.resource}:${props.context.namespace ?? ''}:${props.context.name ?? ''}`} {...props} />;
}
function MetricsSession({ context, draft, section, requestResult, metricsKind }: ResourceEditorFormProps & { metricsKind: MetricsKind }) {
  const [filter, setFilter] = useState('');
  const availability = metricsAccess(context);
  const queryAccess = metricsQueryAccess(context);
  const snapshot = readDraftMetrics(draft, metricsKind);
  let result: MetricsRead = snapshot;
  let responseError: string | null = null;
  if (requestResult?.status === 'ready') {
    if (requestResult.sensitive) responseError = 'Sensitive response withheld. No metrics were displayed.';
    else result = readMetricsResponse(requestResult.output, metricsKind, context);
  } else if (requestResult) responseError = responseMessages[requestResult.status];
  const hasSnapshot = draft.has(['timestamp']) || draft.has(['usage']) || draft.has(['containers']);
  if (section === 'access') {
    return <EditorSection title="Access & ownership">
      <dl className={styles.facts}>
        <div><dt>API</dt><dd>{context.group}/{context.version}</dd></div>
        <div><dt>Resource</dt><dd>{context.resource}</dd></div>
        <div><dt>Scope</dt><dd>{context.scope}</dd></div>
        {context.scope === 'Namespaced' && <div><dt>Namespace</dt><dd>{context.namespace || 'All namespaces'}</dd></div>}
        <div><dt>Discovery</dt><dd>{context.discovery.status}</dd></div>
        <div><dt>Schema</dt><dd>{context.schema.status}</dd></div>
        <div><dt>Get permission</dt><dd>{context.capabilities.get}</dd></div>
        <div><dt>List permission</dt><dd>{context.capabilities.list}</dd></div>
        <div><dt>Query permission</dt><dd>{context.capabilities.actions['kubernetes.metrics.v1'] ?? 'unknown'}</dd></div>
        <div><dt>Producer</dt><dd>Aggregated metrics service</dd></div>
        <div><dt>Observed ownership</dt><dd>{context.ownership?.status ?? 'unknown'}</dd></div>
        <div><dt>Storage</dt><dd>Generated measurement · read-only</dd></div>
      </dl>
      <EditorHelp label="Metrics availability">An optional aggregated service serves these measurements. Discovery does not establish authorization, service health, or metrics-server installation. Source remains a read-only snapshot. No create, edit, delete, installation, or workload change is performed.</EditorHelp>
      {availability && <p role="status">{availability}</p>}
      {!availability && queryAccess && <p role="status">{queryAccess}</p>}
    </EditorSection>;
  }
  return <div className={styles.inspector}>
    <EditorSection title={metricsKind === 'NodeMetrics' ? 'Node usage' : 'Container usage'}>
      <div className={styles.heading}>
        <span className={styles.muted}>Read-only measurement</span>
        <EditorHelp label="Usage quantities">CPU and memory retain exact API quantities. Memory is the working set. No limits, capacity, percentages, or zero values are inferred. All containers in one pod share the same collection interval. Unknown fields stay in the canonical source; the host&apos;s read-only source preview masks sensitive metadata.</EditorHelp>
      </div>
      {availability && <p role="status">{availability}</p>}
      {!availability && queryAccess && <p role="status">{queryAccess}</p>}
      {responseError && <p role="alert">{responseError}</p>}
      {!responseError && !requestResult && !hasSnapshot && <p role="status">Run a read-only query to load measurements.</p>}
      {!responseError && (requestResult || hasSnapshot) && result.status === 'unsupported' && <p role="status">{result.message}</p>}
      {!responseError && result.status === 'ready' && <>
        <EditorField label={metricsKind === 'PodMetrics' ? 'Filter pods or containers' : 'Filter nodes'} value={filter} onChange={setFilter} help="Filters the displayed rows only. Source and query remain unchanged." />
        {requestResult?.status === 'ready' && <span className={styles.muted}>Query result · source snapshot unchanged</span>}
        {result.samples.length === 0 && <p role="status">No measurements returned. This does not mean zero usage.</p>}
        {result.samples.length > 0 && !result.samples.some(sample => `${sample.namespace ?? ''}/${sample.name}`.toLowerCase().includes(filter.toLowerCase()) || sample.rows.some(row => row.name.toLowerCase().includes(filter.toLowerCase()))) && <p role="status">No matching measurements.</p>}
        {result.samples.map((sample, index) => {
          const allRows = `${sample.namespace ?? ''}/${sample.name}`.toLowerCase().includes(filter.toLowerCase());
          const rows = allRows ? sample.rows : sample.rows.filter(row => row.name.toLowerCase().includes(filter.toLowerCase()));
          if (!allRows && rows.length === 0) return null;
          return <section key={`${sample.namespace ?? ''}/${sample.name}/${index}`} className={styles.sample} aria-label={`${metricsKind} ${sample.name}`}>
            <h4>{sample.namespace ? `${sample.namespace} / ` : ''}{sample.name}</h4>
            <dl className={styles.facts}>
              <div><dt>Collected at</dt><dd><time dateTime={sample.timestamp}>{sample.timestamp}</time></dd></div>
              <div><dt>Window</dt><dd>{sample.window}<EditorHelp label="Collection window">The sample covers [timestamp − window, timestamp]. It is not live utilization. Compare collection timestamps before comparing samples; no freshness or polling policy is inferred.</EditorHelp></dd></div>
            </dl>
            <div className={styles.tableScroll}>
              <table className={styles.table} aria-label={`${sample.name} usage`}>
                <thead><tr><th scope="col">{metricsKind === 'PodMetrics' ? 'Container' : 'Node'}</th><th scope="col">CPU · exact quantity</th><th scope="col">Memory · working set</th></tr></thead>
                <tbody>{rows.map((row, rowIndex) => <tr key={`${row.name}/${rowIndex}`}><th scope="row">{row.name}</th><td>{row.cpu}</td><td>{row.memory}</td></tr>)}</tbody>
              </table>
            </div>
            {sample.rows.length === 0 && <p role="status">No container measurements reported.</p>}
          </section>;
        })}
      </>}
    </EditorSection>
  </div>;
}
