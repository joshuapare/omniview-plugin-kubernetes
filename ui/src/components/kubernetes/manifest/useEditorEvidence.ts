import { useEffect, useMemo, useState } from 'react';
import type { ResourceEditorAvailability, ResourceEditorContext } from '@omniviewdev/runtime';
import { ResourceClient } from '@omniviewdev/runtime/api';
import { PLUGIN_ID } from '@/pluginId';
import { createResourceEditorServices } from './resourceEditorServices';

/** Actual advertised actions and locked GA version evidence; neither is an RBAC grant. */
export function useEditorEvidence(context: ResourceEditorContext, fixture: boolean): ResourceEditorContext {
  const type = context.resource === '' ? 'kubernetes:editor-queries' : context.resource === 'serviceaccounts/token' ? 'k8s:/serviceaccounts' : `k8s:${context.group}/${context.resource}`;
  const key = JSON.stringify([context.connectionID, type]);
  const [evidence, setEvidence] = useState<{ key: string; actions: Readonly<Record<string, ResourceEditorAvailability>>; features: Readonly<Record<string, ResourceEditorAvailability>> }>();
  useEffect(() => {
    if (fixture || !context.connectionID) return;
    const abort = new AbortController();
    let cancelActions: (() => unknown) | undefined;
    const actions = Promise.resolve().then(() => { const pending = ResourceClient.GetActions(PLUGIN_ID, { connection: context.connectionID }, type); cancelActions = () => pending.cancel?.(); return pending; });
    const server = createResourceEditorServices(context).actions.execute({ protocol: 'kubernetes.server-info.v1', input: {}, sessionID: `evidence/${key}`, generation: 0, signal: abort.signal });
    void Promise.allSettled([actions, server]).then(([actionResult, serverResult]) => {
      if (abort.signal.aborted) return;
      const features: Record<string, ResourceEditorAvailability> = {};
      const info = serverResult.status === 'fulfilled' ? serverResult.value : undefined;
      if (info?.status === 'ready' && info.output && typeof info.output === 'object') {
        const version = info.output as { major?: unknown; minor?: unknown };
        const major = typeof version.major === 'string' && /^\d+$/.test(version.major) ? Number(version.major) : undefined;
        const minor = typeof version.minor === 'string' && /^\d+\+?$/.test(version.minor) ? Number(version.minor.replace('+', '')) : undefined;
        if (major !== undefined && minor !== undefined) {
          features.CustomResourceFieldSelectors = major > 1 || major === 1 && minor >= 32 ? 'available' : 'unknown';
          features['networking.k8s.io/ServiceCIDR/append-dual-stack'] = major > 1 || major === 1 && minor >= 35 ? 'available' : 'unknown';
        }
      }
      const descriptors = actionResult.status === 'fulfilled' ? actionResult.value : [];
      setEvidence({ key, actions: Object.fromEntries(descriptors.map((descriptor) => [descriptor.id, 'available' as const])), features });
    }).catch(() => { /* Missing evidence stays unknown, not denied or available. */ });
    return () => { abort.abort(); void cancelActions?.(); };
  }, [key, fixture]);
  return useMemo(() => evidence?.key === key ? { ...context, capabilities: { ...context.capabilities, actions: { ...evidence.actions, ...context.capabilities.actions } }, discovery: { ...context.discovery, ...(context.resource === 'serviceaccounts/token' && evidence.actions['kubernetes.service-account-token.v1'] === 'available' ? { status: 'available' as const } : {}), features: { ...evidence.features, ...context.discovery.features } } } : context, [context, evidence, key]);
}
