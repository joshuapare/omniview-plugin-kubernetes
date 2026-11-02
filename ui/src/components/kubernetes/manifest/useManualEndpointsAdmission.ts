import { useEffect, useMemo, useState } from 'react';
import type { ResourceEditorContext, ResourceEditorReferenceService } from '@omniviewdev/runtime';
import { inspectManifest, readManifestValue } from './manifestDraft';

/** A canonical unmanaged baseline plus a real selectorless Service establishes manual endpoint policy. */
export function useManualEndpointsAdmission(baseline: string | undefined, context: ResourceEditorContext, references: ResourceEditorReferenceService, sessionID: string, revision: number) {
  const draft = useMemo(() => inspectManifest(baseline ?? ''), [baseline]);
  const owners = readManifestValue(draft, ['metadata', 'ownerReferences']);
  const name = readManifestValue(draft, ['metadata', 'name']);
  const namespace = readManifestValue(draft, ['metadata', 'namespace']);
  const eligible = context.intent === 'edit' && context.group === '' && context.kind === 'Endpoints' && context.discovery.status === 'available' && context.capabilities.update === 'available' && !!baseline && !draft.error && typeof name === 'string' && typeof namespace === 'string' && !!namespace && (owners === undefined || Array.isArray(owners) && owners.length === 0) && !draft.document?.hasIn(['metadata', 'labels', 'endpoints.kubernetes.io/managed-by']) && !draft.document?.hasIn(['metadata', 'annotations', 'endpoints.kubernetes.io/last-change-trigger-time']) && context.ownership?.status !== 'controller' && context.ownership?.status !== 'system';
  const [evidence, setEvidence] = useState<{ sessionID: string; revision: number; manual: boolean }>();
  useEffect(() => {
    if (!eligible || typeof name !== 'string' || typeof namespace !== 'string') return;
    const abort = new AbortController();
    void references.list({ group: '', version: 'v1', resource: 'services', namespace, projection: 'servicePorts', sessionID, generation: revision, signal: abort.signal }).then((result) => {
      if (abort.signal.aborted) return;
      const service = result.status === 'ready' ? result.items.find((entry) => entry.name === name && (!entry.namespace || entry.namespace === namespace)) : undefined;
      setEvidence({ sessionID, revision, manual: service?.serviceSelector === 'none' });
    }).catch(() => { if (!abort.signal.aborted) setEvidence({ sessionID, revision, manual: false }); });
    return () => abort.abort();
  }, [eligible, baseline, name, namespace, references, sessionID, revision]);
  return { manual: eligible && evidence?.sessionID === sessionID && evidence.manual, pending: eligible && (evidence?.sessionID !== sessionID || evidence.revision !== revision) };
}
