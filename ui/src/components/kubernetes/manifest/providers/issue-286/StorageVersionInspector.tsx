import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useState } from 'react';
import { EditorField, EditorHelp, EditorSection } from '../../editor-controls';
import { readConditions, readServerReports, reportWarnings, storageReadBoundary, storageVersionUnavailable } from './storageVersion';
import styles from './StorageVersionInspector.module.css';

function Versions({ label, versions }: { label: string; versions: readonly string[] }) {
  return <div className={styles.versionRow}><span>{label}</span><div className={styles.versions}>{versions.length
    ? versions.map((version, index) => <code key={`${version}-${index}`}>{version}</code>)
    : <span className={styles.muted}>Not reported</span>}</div></div>;
}

export default function StorageVersionInspector(props: ResourceEditorFormProps) {
  return <StorageVersionSession key={props.draft.sessionID} {...props} />;
}

function StorageVersionSession({ context, draft, section }: ResourceEditorFormProps) {
  const [filter, setFilter] = useState('');
  const boundary = storageReadBoundary(context);
  const unsupported = storageVersionUnavailable(draft, context);
  const common = draft.get(['status', 'commonEncodingVersion']);
  const name = draft.get(['metadata', 'name']);
  const reports = boundary || unsupported ? [] : readServerReports(draft);
  const conditions = boundary || unsupported ? [] : readConditions(draft);
  const matching = reports.filter(report => report.apiServerID.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const different = new Set(reports.map(report => report.encodingVersion).filter(Boolean)).size > 1;
  const contradictory = typeof common === 'string' && common !== '' && reports.some(report => report.encodingVersion !== '' && report.encodingVersion !== common);

  return <div className={styles.inspector}>
    <div className={styles.boundary}>API-server owned · Inspection only
      <EditorHelp label="StorageVersion ownership">StorageVersionAPI is alpha and default-off in Kubernetes v1.35. It depends on APIServerIdentity. Empty spec has no user intent. Manual writes can corrupt API-server bookkeeping. No create, update, delete or status action is offered.</EditorHelp>
    </div>
    {section === 'ownership' ? <>
      <EditorSection title="Ownership">
        <dl className={styles.facts}>
          <dt>Record</dt><dd>{context.name || (typeof name === 'string' ? name : 'Not selected')}</dd>
          <dt>Scope</dt><dd>Cluster</dd>
          <dt>API</dt><dd><code>internal.apiserver.k8s.io/v1alpha1</code></dd>
          <dt>Resource</dt><dd><code>storageversions</code></dd>
          <dt>Spec</dt><dd>Empty · No authoring fields</dd>
          <dt>Reports & conditions</dt><dd>API-server managed · Read-only</dd>
        </dl>
      </EditorSection>
      <EditorSection title="Availability">
        <dl className={styles.facts}>
          <dt>Discovery</dt><dd>{context.discovery.status}</dd>
          <dt>Read authorization</dt><dd>{context.capabilities.get}</dd>
          <dt>Installed schema</dt><dd>{context.schema.status}</dd>
          <dt>StorageVersionAPI</dt><dd>{context.discovery.features.StorageVersionAPI ?? 'unknown'}</dd>
          <dt>APIServerIdentity</dt><dd>{context.discovery.features.APIServerIdentity ?? 'unknown'}</dd>
        </dl>
        <EditorHelp label="Availability evidence">Discovery does not grant authorization. Missing discovery does not identify the feature gate as the cause. Unknown feature or schema state is not permission or evidence of controller health. Discovered write verbs do not make these reports user-owned.</EditorHelp>
      </EditorSection>
    </> : boundary || unsupported ? <div role="status" className={styles.notice}>{boundary || unsupported}</div>
      : section === 'conditions' ? <EditorSection title="Reported conditions">
        {!conditions.length && <p className={styles.muted}>No conditions reported.</p>}
        {conditions.map((condition, index) => <article key={`${condition.type}-${index}`} className={styles.card}>
          <header><h4>{condition.type}</h4><span className={styles.badge}>{condition.status}</span></header>
          <dl className={styles.facts}>
            <dt>Observed generation</dt><dd>{condition.observedGeneration ?? 'Not reported'}</dd>
            <dt>Last transition</dt><dd>{condition.lastTransitionTime || 'Not reported'}</dd>
            <dt>Reason</dt><dd>{condition.hasReason ? 'Reported · Content hidden' : 'Not reported'}</dd>
            <dt>Message</dt><dd>{condition.hasMessage ? 'Reported · Content hidden' : 'Not reported'}</dd>
          </dl>
          <EditorHelp label="Condition details">Reason and message are free text and may contain confidential data. Their values stay hidden. Observed generation is an exact integer. Transition time is reported by the API server, not a refresh timestamp.</EditorHelp>
        </article>)}
      </EditorSection> : <>
        <EditorSection title="Encoding agreement">
          <div className={styles.agreement}><span className={styles.badge}>{typeof common === 'string' && common !== '' ? common : 'Not reported'}</span>
            <EditorHelp label="Encoding agreement">commonEncodingVersion is reported when API-server instances agree. Omission is not a guessed version or proof of disagreement. Agreement does not prove migration completion or control-plane health.</EditorHelp>
          </div>
          {different && <p role="status" className={styles.notice}>Server encoding reports differ.</p>}
          {contradictory && <p role="status" className={styles.notice}>Common encoding conflicts with a server report.</p>}
        </EditorSection>
        <EditorSection title={`Server reports (${reports.length})`}>
          <div className={styles.filter}><EditorField label="Filter API servers" value={filter} onChange={setFilter} placeholder="API-server ID" />
            <Button size="sm" variant="ghost" disabled={!filter} onClick={() => setFilter('')}>Clear filter</Button></div>
          {!reports.length ? <p className={styles.muted}>No server reports. Encoding agreement is unknown.</p>
            : !matching.length ? <p role="status" className={styles.muted}>No matching API servers.</p>
              : matching.map((report, index) => <article key={`${report.apiServerID}-${index}`} className={styles.card}>
                <header><h4>{report.apiServerID || 'ID not reported'}</h4><span className={styles.badge}>{report.encodingVersion || 'Encoding not reported'}</span></header>
                <Versions label="Can decode" versions={report.decodableVersions} />
                <Versions label="Can serve" versions={report.servedVersions} />
                {reportWarnings(report).map(warning => <p role="status" key={warning} className={styles.notice}>{warning}</p>)}
              </article>)}
        </EditorSection>
      </>}
  </div>;
}
