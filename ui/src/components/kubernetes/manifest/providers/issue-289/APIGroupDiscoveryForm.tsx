import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useState } from 'react';

import { EditorChoice, EditorField, EditorHelp, EditorSection, patchError, patchFields } from '../../editor-controls';

import { discoveryAccept, filterDiscovery, inspectDiscovery, kindLabel, type DiscoveryResource, type DiscoveryResponse } from './discovery';
import styles from './discovery.module.css';
import { discoveryQuery, validateDiscoveryQuery } from './request';

function ResourceDetails({ resource }: { resource: DiscoveryResource }) {
  return <details className={styles.resource}>
    <summary><strong>{resource.resource}</strong><span>{resource.scope}</span><span>{resource.responseKind?.kind || 'No parent response type'}</span></summary>
    <dl className={styles.facts}>
      <dt>Returned type</dt><dd>{kindLabel(resource.responseKind)}</dd>
      <dt>Singular</dt><dd>{resource.singularResource || 'Not advertised'}</dd>
      <dt>Short names</dt><dd>{resource.shortNames.join(', ') || 'None advertised'}</dd>
      <dt>Categories</dt><dd>{resource.categories.join(', ') || 'None advertised'}</dd>
      <dt>Advertised verbs</dt><dd>{resource.verbs.join(' · ') || 'None advertised'}</dd>
    </dl>
    {resource.subresources.length > 0 && <section aria-label={`${resource.resource} subresources`} className={styles.subresources}>
      {resource.subresources.map(subresource => <div className={styles.subresource} key={subresource.subresource}>
        <strong>/{subresource.subresource}</strong>
        <dl className={styles.facts}>
          <dt>Returned type</dt><dd>{kindLabel(subresource.responseKind)}</dd>
          <dt>Accepted types</dt><dd>{subresource.acceptedTypes.map(type => <div key={`${type.group}/${type.version}/${type.kind}`}>{kindLabel(type)}</div>)}{!subresource.acceptedTypes.length && 'None advertised'}</dd>
          <dt>Advertised verbs</dt><dd>{subresource.verbs.join(' · ') || 'None advertised'}</dd>
        </dl>
      </div>)}
    </section>}
  </details>;
}

export default function APIGroupDiscoveryForm(form: ResourceEditorFormProps) {
  return <DiscoverySession key={form.draft.sessionID} {...form} />;
}

function DiscoverySession(form: ResourceEditorFormProps) {
  const { draft, context, section, requestResult } = form;
  const [query, setQuery] = useState('');
  const [previous, setPrevious] = useState<{ request: ResourceEditorFormProps['requestResult']; response: DiscoveryResponse } | null>(null);
  const queryConfig = discoveryQuery(draft, context);
  const queryIssues = validateDiscoveryQuery(draft);
  const action = context.intent === 'action';
  const received = requestResult?.status === 'ready' && !requestResult.sensitive ? requestResult : null;
  const incoming = received ? inspectDiscovery(received.output) : null;
  if (received && incoming?.valid && previous?.request !== received) setPrevious({ request: received, response: incoming });
  const hasOutput = incoming !== null || previous !== null;
  const response = incoming ?? previous?.response ?? inspectDiscovery({
    apiVersion: draft.get(['apiVersion']), kind: draft.get(['kind']),
    metadata: { name: draft.get(['metadata', 'name']) },
    versions: draft.get(['versions']), items: draft.get(['items']),
  });
  const filtered = response.valid ? filterDiscovery(response.groups, query) : [];
  const changeQuery = (field: 'endpoint' | 'version', value: string) => {
    const error = patchError(patchFields(form, [{ op: 'set', path: ['query', field], value }]));
    form.onValidityChange(error);
  };
  const failed = requestResult && requestResult.status !== 'ready';
  const requestStatus = requestResult?.status === 'absent' ? 'unsupported representation or absent endpoint' : requestResult?.status;

  if (section === 'request') return <EditorSection title="Discovery request">
    <div className={styles.choices}>
      <EditorChoice label="Endpoint" value={queryConfig.endpoint} onChange={value => changeQuery('endpoint', value)} readOnly={!action} disabled={form.disabled}
        options={[{ value: '/api', label: '/api · core group' }, { value: '/apis', label: '/apis · named groups' }]}
        error={queryIssues.find(issue => issue.path[1] === 'endpoint')?.message}
        help="Cluster-level GET. Discovery advertises APIs; it does not grant access to them." />
      <EditorChoice label="Representation" value={queryConfig.version} onChange={value => changeQuery('version', value)} readOnly={!action} disabled={form.disabled}
        options={[{ value: 'v2', label: 'v2' }, { value: 'v2beta1', label: 'v2beta1 · compatibility' }]}
        error={queryIssues.find(issue => issue.path[1] === 'version')?.message}
        help="v2 is stable from Kubernetes 1.30. v2beta1 is deprecated; only successful content negotiation establishes availability." />
    </div>
    <dl className={styles.facts}><dt>Destination</dt><dd>{context.connectionID}</dd><dt>Method</dt><dd>GET {queryConfig.endpoint}</dd><dt>Accept</dt><dd><code>{discoveryAccept(queryConfig.version)}</code></dd><dt>Mutation</dt><dd>None</dd></dl>
    {queryConfig.version === 'v2beta1' && <div role="note" className={styles.notice}>Compatibility request may be unsupported (HTTP 406).</div>}
    {!action && <div role="note" className={styles.notice}>Captured response · inspection only</div>}
    {failed && <div role="status" aria-label="Discovery request" className={styles.notice}>Discovery request: {requestStatus}.</div>}
    {requestResult?.status === 'ready' && <div role="status" aria-label="Discovery request">{requestResult.sensitive ? 'Sensitive response hidden.' : 'Discovery response received. Inspect capabilities for advertised resources.'}</div>}
  </EditorSection>;

  if (section === 'representation') return <EditorSection title="Protocol & source">
    <dl className={styles.facts}><dt>Protocol</dt><dd>apidiscovery.k8s.io/{context.version}</dd><dt>Ownership</dt><dd>API server · read-only response</dd><dt>Resource collection</dt><dd>None</dd><dt>Scope</dt><dd>Cluster</dd><dt>Source</dt><dd>Host-owned source view retains unmodeled fields.</dd></dl>
    <EditorHelp label="Source preservation">Inspection never patches response fields. Metadata resourceVersion is not a replay token. Unknown fields remain in the canonical source; client query settings are not transmitted as response fields.</EditorHelp>
    <details className={styles.resource}><summary>Version & availability details</summary><p>v2 introduced in Kubernetes 1.30. v2beta1 is deprecated from 1.32 with removal estimated for 1.35 in the pinned API source. Negotiate against the connected server; schema presence is not serving support.</p></details>
  </EditorSection>;

  return <EditorSection title="Advertised capabilities">
    <div className={styles.heading}><span className={styles.muted}>Server-owned · no resource mutations</span><EditorHelp label="Advertised capabilities">Verbs are advertised protocol capabilities, not RBAC decisions or controller health. Stale or unknown freshness must not authorize operations. Expand a resource to inspect aliases, accepted types, and subresource verbs.</EditorHelp></div>
    <EditorField label="Filter resources" value={query} onChange={setQuery} placeholder="Resource, kind, alias, group or subresource" />
    {failed && <div role="status" aria-label="Discovery request" className={styles.notice}>Discovery request: {requestStatus}. Previous response retained.</div>}
    {requestResult?.status === 'ready' && requestResult.sensitive && <div role="alert" className={styles.notice}>Sensitive response hidden. Previous discovery response retained.</div>}
    {!response.valid && <div role="alert" className={styles.notice}>{hasOutput ? 'Returned discovery response has an unsupported shape. Existing draft source remains unchanged.' : response.message}</div>}
    {response.valid && !response.groups.length && <div role="status">No API groups returned.</div>}
    {response.valid && response.groups.length > 0 && !filtered.length && <div role="status">No resources match this filter.</div>}
    {filtered.map(group => <section key={group.name} className={styles.group} aria-label={`${group.name || 'Core'} discovery group`}>
      <h4>{group.name || 'Core group'}</h4>
      {!group.versions.length && <div role="status">No versions advertised.</div>}
      {group.versions.map(version => <section key={version.version} className={styles.version}>
        <div className={styles.heading}><strong>{version.version}</strong>{response.valid && response.groups.find(original => original.name === group.name)?.versions[0]?.version === version.version && <span className={styles.badge}>Preferred</span>}<span className={styles.badge}>{version.freshness === 'Current' ? 'Current' : version.freshness === 'Stale' ? 'Stale' : 'Freshness unknown'}</span></div>
        {version.freshness !== 'Current' && <div role="note" className={styles.notice}>{version.freshness === 'Stale' ? 'Stale response. Refresh before relying on these capabilities.' : 'Freshness not established. Do not assume these capabilities are current.'}</div>}
        {!version.resources.length && <div role="status">No resources advertised.</div>}
        {version.resources.map(resource => <ResourceDetails key={resource.resource} resource={resource} />)}
      </section>)}
    </section>)}
  </EditorSection>;
}
