import type { ResourceEditorFormProps, ResourceEditorReferenceResult } from '@omniviewdev/runtime';
import { useEffect, useState } from 'react';
import { EditorHelp, EditorSection } from '../../editor-controls';
import { ownership, text } from './model';
import './apps.css';

const ownerResources: Readonly<Record<string, string>> = { Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets' };

export default function OwnerInspection({ draft, context, references }: ResourceEditorFormProps) {
  const owned = ownership(draft);
  const owner = owned.owner;
  const ownerResource = owner?.apiVersion === 'apps/v1' ? ownerResources[owner.kind] : undefined;
  const hasOwner = !!owner;
  const identity = JSON.stringify([ownerResource, owner?.name, owner?.uid, context.namespace, draft.sessionID, draft.revision]);
  const [result, setResult] = useState<{ identity: string; value: ResourceEditorReferenceResult } | null>(null);
  const lookup = ownerResource && context.namespace && hasOwner ? result?.identity === identity ? result.value : 'loading' : null;
  useEffect(() => {
    if (!ownerResource || !context.namespace || !hasOwner) return;
    const controller = new AbortController();
    let active = true;
    references.list({ group: 'apps', version: 'v1', resource: ownerResource, namespace: context.namespace, projection: 'metadata', sessionID: draft.sessionID, generation: draft.revision, signal: controller.signal }).then(result => {
      if (active && !controller.signal.aborted) setResult({ identity, value: result });
    }, () => { if (active && !controller.signal.aborted) setResult({ identity, value: { status: 'unavailable', message: 'Owner lookup unavailable.' } }); });
    return () => { active = false; controller.abort(); };
  }, [identity, ownerResource, hasOwner, context.namespace, draft.sessionID, draft.revision, references]);
  const revision = context.kind === 'ControllerRevision';
  let availability = 'Owner lookup not supported for this owner kind.';
  if (lookup === 'loading') availability = 'Loading owner reference…';
  else if (lookup?.status === 'ready') {
    const match = lookup.items.find(item => item.name === owner?.name && item.namespace === context.namespace);
    availability = !lookup.items.length ? 'No owners returned in this namespace.' : !match ? 'Referenced owner not found.' : !match.uid ? 'Owner found; UID cannot be verified.' : match.uid !== owner?.uid ? 'Owner name now belongs to a different UID.' : 'Owner reference verified. Controller health is not checked.';
  } else if (lookup?.status === 'denied') availability = 'Owner lookup denied. Ownership remains locked.';
  else if (lookup?.status === 'absent') availability = 'Owner API is not served.';
  else if (lookup?.status === 'unavailable') availability = 'Owner lookup unavailable.';
  return <div className="apps-editor"><EditorSection title={revision ? 'Revision snapshot' : owner ? 'Controller-owned ReplicaSet' : 'ReplicaSet ownership'}>
    <div className="apps-notice">{revision ? 'Controller snapshot is read-only. Use the owner’s rollout workflow.' : owned.state === 'unknown' || !owner ? 'Controller ownership cannot be verified. Editing stays locked.' : 'Edit or scale the owning controller, not this managed child.'}</div>
    {revision && <div className="apps-grid"><div><span className="apps-muted">Revision</span><strong>{text(draft.get(['revision'])) || 'Exact revision unavailable'}</strong></div><div><span className="apps-muted">Payload</span><strong>Withheld</strong><EditorHelp label="Revision payload">Opaque serialized controller state may contain credentials. Data is immutable. This editor never exposes, copies or writes the payload.</EditorHelp></div></div>}
    <div className="apps-grid"><div><span className="apps-muted">Controller kind</span><strong>{owner?.kind ?? (owned.state === 'unknown' ? 'Unknown' : 'No controller owner')}</strong></div><div><span className="apps-muted">Controller name</span><strong>{owner?.name ?? 'Not available'}</strong></div><div><span className="apps-muted">Owner API version</span><strong>{owner?.apiVersion ?? 'Not available'}</strong></div></div>
    {owner && <div role="status" aria-label="Owner lookup">{availability}</div>}
    {!revision && <div className="apps-grid">{[['Desired replicas', ['spec', 'replicas']], ['Current replicas', ['status', 'replicas']], ['Ready replicas', ['status', 'readyReplicas']], ['Available replicas', ['status', 'availableReplicas']]].map(([label, path]) => <div key={label as string}><span className="apps-muted">{label as string}</span><strong>{text(draft.get(path as readonly string[])) || 'Not reported'}</strong></div>)}</div>}
    <details><summary>{revision ? 'Rollout boundary' : 'Scale boundary'}</summary><span className="apps-muted">{revision ? 'Use the existing owner action workflow for rollback. No revision payload edits or history deletion are offered.' : 'Scale uses autoscaling/v1 Scale on the owner’s /scale subresource. Direct child scaling and owner detachment are not offered.'}</span></details>
  </EditorSection></div>;
}
