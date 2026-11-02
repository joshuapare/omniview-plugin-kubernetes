import { Chip, Text } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import type { ReactNode } from 'react';
import ResourceLinkChip from '../../../../shared/ResourceLinkChip';
import { EditorHelp, EditorSection, useEditorReferences } from '../../editor-controls';
import { coreEventAlias, eventReadBoundary, eventReference, eventText, type EventObjectReference } from './eventModel';
import './event-inspector.css';

function Fact({ label, value, help }: { label: string; value: unknown; help?: string }) {
  return <div className="event-inspector-fact"><div className="event-inspector-label"><Text size="xs" tone="muted">{label}</Text>{help && <EditorHelp label={label}>{help}</EditorHelp>}</div><Text size="sm" style={{ overflowWrap: 'anywhere' }}>{eventText(value)}</Text></div>;
}
function Grid({ children }: { children: ReactNode }) {
  return <div className="event-inspector-grid">{children}</div>;
}

function ObjectReference({ label, reference, connectionID }: { label: string; reference: EventObjectReference | null; connectionID: string }) {
  if (!reference) return <EditorSection title={label}><Text size="sm" tone="muted">Not reported</Text></EditorSection>;
  const { apiVersion, kind, name, uid, namespace } = reference;
  const navigable = !!(apiVersion && kind && name && uid);
  return <EditorSection title={label}>
    <Grid><Fact label="Kind" value={kind} /><Fact label="API version" value={apiVersion} /><Fact label="Name" value={name} /><Fact label="Namespace" value={namespace} help="Only the referenced namespace is used. Cluster scope comes from the discovered target, never the Event namespace." /></Grid>
    <Fact label="Object UID" value={uid} help="The inspector verifies this exact incarnation. A same-name replacement must not open as the original object." />
    {navigable ? <div className="event-inspector-link"><ResourceLinkChip connectionID={connectionID} namespace={namespace} ownerReference={{ apiVersion, kind, name, uid }} resourceName={`Inspect ${kind}`} /></div> : <Text size="xs" tone="muted">Incomplete reference — safe object handoff unavailable.</Text>}
    <details className="event-inspector-advanced"><summary>Reference details</summary><Grid><Fact label="Object revision" value={reference.resourceVersion} /><Fact label="Field / container path" value={reference.fieldPath} /></Grid></details>
  </EditorSection>;
}

function AliasLookup({ form, namespace }: { form: ResourceEditorFormProps; namespace: string }) {
  const result = useEditorReferences(form, { group: '', version: 'v1', resource: 'events', namespace, projection: 'metadata' });
  let message: string;
  if (result.status === 'loading') message = 'Checking core/v1 alias…';
  else if (result.status === 'denied') message = 'Core Event alias lookup denied.';
  else if (result.status === 'absent') message = 'Core Event API is not served.';
  else if (result.status === 'unavailable') message = 'Core Event alias lookup unavailable.';
  else if (result.status === 'ready') {
    const alias = coreEventAlias(form.draft, namespace, result.items);
    message = alias ? `core/v1 alias: ${alias.name}. One Event; counts are not added.` : 'No matching core/v1 UID found. No counts combined.';
  }
  else message = 'Core Event alias lookup unavailable.';
  return <Text as="div" size="xs" tone="muted" role="status" aria-label="Core Event alias">{message}</Text>;
}

export default function EventInspector(form: ResourceEditorFormProps) {
  const { context, draft, section } = form;
  const boundary = eventReadBoundary(context);
  if (boundary) return <Text as="div" size="sm" role="status">{boundary}</Text>;
  const value = (field: string) => draft.get([field]);
  const namespace = typeof draft.get(['metadata', 'namespace']) === 'string' ? draft.get(['metadata', 'namespace']) as string : context.namespace;
  const uid = draft.get(['metadata', 'uid']);
  const series = draft.has(['series']) && value('series') !== null;
  if (section === 'objects') return <div className="event-inspector"><ObjectReference label="Regarding object" reference={eventReference(draft, 'regarding')} connectionID={context.connectionID} /><ObjectReference label="Related object" reference={eventReference(draft, 'related')} connectionID={context.connectionID} /></div>;
  if (section === 'series') return <div className="event-inspector">
    <EditorSection title={series ? 'Recurring event' : 'Single observation'}><Grid><Fact label="First observed" value={value('eventTime')} help="The Event eventTime is the first observation, not metadata.creationTimestamp." />{series && <><Fact label="Occurrences at heartbeat" value={draft.get(['series', 'count'])} help="Reporter count as of the last heartbeat. It is not a current-health or request-count measure." /><Fact label="Last observed at heartbeat" value={draft.get(['series', 'lastObservedTime'])} /></>}</Grid>{!series && <Text size="xs" tone="muted">No series reported; no count inferred.</Text>}</EditorSection>
    <EditorSection title="Core Event alias"><div className="event-inspector-label"><Text size="sm">One underlying record</Text><EditorHelp label="Core Event alias">Only identical UID, namespace and connection identify the same Event across core/v1 and events.k8s.io/v1. Native representation stays preferred. Never sum alias or compatibility counts.</EditorHelp></div>{typeof uid === 'string' && uid && namespace ? <AliasLookup key={`${draft.sessionID}:${context.connectionID}:${namespace}`} form={form} namespace={namespace} /> : <Text size="xs" tone="muted">UID or namespace missing — no alias inferred.</Text>}</EditorSection>
    <details className="event-inspector-advanced"><summary>Compatibility fields</summary><Grid><Fact label="Legacy count" value={value('deprecatedCount')} /><Fact label="Legacy first timestamp" value={value('deprecatedFirstTimestamp')} /><Fact label="Legacy last timestamp" value={value('deprecatedLastTimestamp')} /><Fact label="Legacy source component" value={draft.get(['deprecatedSource', 'component'])} /><Fact label="Legacy source host" value={draft.get(['deprecatedSource', 'host'])} /></Grid></details>
  </div>;
  if (section === 'ownership') return <div className="event-inspector"><EditorSection title="Reporter-owned diagnostic"><Text size="sm">Read-only. No create, edit, delete or repair action.</Text><EditorHelp label="Diagnostic ownership">API mutation verbs do not make Events desired state. Reporting controller and instance identify the producer, not metadata ownership. Events are best-effort and expire; presence or absence does not prove workload health.</EditorHelp><Grid><Fact label="Reporting controller" value={value('reportingController')} /><Fact label="Reporting instance" value={value('reportingInstance')} /><Fact label="Policy ownership" value={context.ownership?.status ?? 'unknown'} /><Fact label="Discovery" value={context.discovery.status} /><Fact label="Read authorization" value={context.capabilities.get} /><Fact label="Installed schema" value={context.schema.status} /></Grid></EditorSection><EditorSection title="Record identity"><Grid><Fact label="Name" value={draft.get(['metadata', 'name'])} /><Fact label="Namespace" value={namespace} /><Fact label="Event UID" value={uid} /><Fact label="Resource revision" value={draft.get(['metadata', 'resourceVersion'])} help="Opaque resourceVersion string, never converted to a number." /></Grid></EditorSection></div>;
  return <div className="event-inspector"><EditorSection title="Diagnostic"><div className="event-inspector-label"><Chip size="sm" variant="soft" color={value('type') === 'Warning' ? 'warning' : 'neutral'}>{eventText(value('type'))}</Chip><Text size="xs" tone="muted">Read-only observation</Text><EditorHelp label="Event severity">Type is reporter-supplied diagnostic severity, not current workload health. Unknown future types remain unchanged.</EditorHelp></div><Grid><Fact label="Reason" value={value('reason')} /><Fact label="Action" value={value('action')} /><Fact label="First observed" value={value('eventTime')} /></Grid><div className="event-inspector-private"><Text size="xs" tone="muted">Diagnostic note hidden</Text><EditorHelp label="Diagnostic note privacy">Free-text notes may contain credentials. Notes and annotations are masked in every source view, diff and capture. This inspector never reveals or writes them.</EditorHelp></div></EditorSection><EditorSection title="Producer"><Grid><Fact label="Reporting controller" value={value('reportingController')} /><Fact label="Reporting instance" value={value('reportingInstance')} /></Grid></EditorSection></div>;
}
