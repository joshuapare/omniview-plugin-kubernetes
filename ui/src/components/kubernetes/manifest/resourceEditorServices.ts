import { useMemo } from 'react';
import { jsonToValue, parseAppError } from '@omniviewdev/runtime';
import type { ResourceEditorContext, ResourceEditorActionService, ResourceEditorReferenceService, ResourceEditorActionResult, ResourceEditorReference, Value } from '@omniviewdev/runtime';
import { ResourceClient } from '@omniviewdev/runtime/api';
import { PLUGIN_ID } from '@/pluginId';
import { stringify } from 'yaml';

const protocols: Record<string, 'read' | 'write'> = {
  'kubernetes.review.v1': 'write',
  'kubernetes.service-account-token.v1': 'write',
  'kubernetes.csr-approval.v1': 'write',
  'kubernetes.pod-eviction.v1': 'write',
  'kubernetes.scale.v1': 'write',
  'kubernetes.metrics.v1': 'read',
  'kubernetes.discovery.v1': 'read',
  'kubernetes.cert-manager.v1': 'write',
  'kubernetes.server-info.v1': 'read',
  'kubernetes.crossplane-revision-activation.v1': 'write',
  'kubernetes.tigera-evidence.v1': 'read',
};

/** Mixed read/write protocols are never admitted to automatic preflight. */
export function isReadOnlyResourceEditorProtocol(protocol: string): boolean {
  return Object.hasOwn(protocols, protocol) && protocols[protocol] === 'read';
}

/** Preserve exact integers without passing through JSON.parse or unsafe Number. */
export function decodeEditorValue(value: Value): unknown {
  switch (value.kind) {
    case 'null': return null;
    case 'int64': case 'uint64': {
      const integer = BigInt(value.value);
      return integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : integer;
    }
    case 'list': return value.value.map(decodeEditorValue);
    case 'map': return Object.fromEntries(Object.entries(value.value).map(([key, child]) => [key, decodeEditorValue(child)]));
    default: return value.value;
  }
}

type CancelPromise<T> = Promise<T> & { cancel?: () => unknown };
async function cancellable<T>(promise: CancelPromise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void promise.cancel?.(); throw new DOMException('Cancelled', 'AbortError'); }
  const cancel = () => { void promise.cancel?.(); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await promise;
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return result;
  } finally { signal.removeEventListener('abort', cancel); }
}

function failure(error: unknown): Exclude<ResourceEditorActionResult, { status: 'ready' }> {
  const parsed = parseAppError(error);
  const code = `${parsed.code ?? ''} ${parsed.type}`;
  if (error instanceof DOMException && error.name === 'AbortError' || /CANCELLED|cancelled/.test(code)) return { status: 'cancelled', message: 'Request cancelled.' };
  if (parsed.status === 401 || parsed.status === 403 || /FORBIDDEN|UNAUTHORIZED|PERMISSION_DENIED/.test(code)) return { status: 'denied', message: 'Kubernetes denied this request.' };
  if (parsed.status === 404 || /NOT_FOUND/.test(code)) return { status: 'absent', message: 'Kubernetes API or object is absent.' };
  if (parsed.status === 400 || /INVALID/.test(code)) return { status: 'invalid', message: 'Kubernetes rejected this request.' };
  return { status: 'unavailable', message: 'Kubernetes request unavailable.' };
}

export interface ResourceEditorServices {
  references: ResourceEditorReferenceService;
  actions: ResourceEditorActionService;
}

export function createResourceEditorServices(context: ResourceEditorContext): ResourceEditorServices {
  const route = { connection: context.connectionID };
  const actions: ResourceEditorActionService = {
    async execute(request) {
      if (!Object.hasOwn(protocols, request.protocol)) return { status: 'invalid', message: 'Unsupported request protocol.' };
      if (request.signal.aborted) return { status: 'cancelled', message: 'Request cancelled.' };
      try {
        const query = request.protocol === 'kubernetes.tigera-evidence.v1' || request.protocol === 'kubernetes.server-info.v1' || request.protocol === 'kubernetes.discovery.v1' || request.protocol === 'kubernetes.metrics.v1' && context.resource === '';
        const tokenRequest = request.protocol === 'kubernetes.service-account-token.v1';
        if (tokenRequest && context.kind !== 'TokenRequest' && context.kind !== 'ServiceAccount') return { status: 'invalid', message: 'Select a service account token target.' };
        const type = query ? 'kubernetes:editor-queries' : tokenRequest ? 'k8s:/serviceaccounts' : `k8s:${context.group}/${context.resource}`;
        const instance = !query && ['kubernetes.service-account-token.v1', 'kubernetes.csr-approval.v1', 'kubernetes.pod-eviction.v1', 'kubernetes.scale.v1', 'kubernetes.cert-manager.v1', 'kubernetes.crossplane-revision-activation.v1'].includes(request.protocol);
        let output: Value;
        if (instance) {
          if (!context.name || context.scope === 'Namespaced' && !context.namespace) return { status: 'invalid', message: 'Select an exact object target.' };
          const resolved = await cancellable(ResourceClient.ResolveReference(PLUGIN_ID, { route, type, id: context.name, incarnation: context.uid,
            representation: tokenRequest ? 'kubernetes.object.v1/v1' : `kubernetes.object.v1/${context.group ? `${context.group}/` : ''}${context.version}`,
            scope: context.scope === 'Namespaced' ? [{ dimension: 'namespace', value: context.namespace! }] : [] }), request.signal);
          output = await cancellable(ResourceClient.Action(PLUGIN_ID, { route: resolved.route, reference: resolved.reference, action: request.protocol, input: jsonToValue(request.input) }), request.signal);
        } else {
          const resolved = await cancellable(ResourceClient.ResolveTarget(PLUGIN_ID, { route, type,
            ...(query ? {} : { representation: `kubernetes.object.v1/${context.group ? `${context.group}/` : ''}${context.version}` }),
            scope: !query && context.scope === 'Namespaced' && context.namespace ? [{ dimension: 'namespace', match: 'oneOf', values: [context.namespace] }] : [] }), request.signal);
          const { provider, authority, scope } = resolved.target;
          output = await cancellable(ResourceClient.Action(PLUGIN_ID, { route: resolved.target.route, typeTarget: { provider, authority, type, scope }, action: request.protocol, input: jsonToValue(request.input) }), request.signal);
        }
        return { status: 'ready', output: decodeEditorValue(output), sensitive: request.protocol === 'kubernetes.review.v1' || request.protocol === 'kubernetes.service-account-token.v1' };
      } catch (error) {
        return request.signal.aborted ? { status: 'cancelled', message: 'Request cancelled.' } : failure(error);
      }
    },
  };
  const references: ResourceEditorReferenceService = {
    async list(request) {
      if (request.signal.aborted) return { status: 'unavailable', message: 'Reference lookup cancelled.' };
      try {
        const type = `k8s:${request.group}/${request.resource}`;
        const resolved = await cancellable(ResourceClient.ResolveTarget(PLUGIN_ID, { route, type,
          representation: `kubernetes.object.v1/${request.group ? `${request.group}/` : ''}${request.version}`,
          scope: request.namespace ? [{ dimension: 'namespace', match: 'oneOf', values: [request.namespace] }] : [] }), request.signal);
        const { provider, authority, scope } = resolved.target;
        const output = await cancellable(ResourceClient.Action(PLUGIN_ID, { route: resolved.target.route, typeTarget: { provider, authority, type, scope }, action: 'kubernetes.references.v1', input: jsonToValue({ projection: request.projection ?? 'metadata' }) }), request.signal);
        const data = decodeEditorValue(output) as { items: ResourceEditorReference[] };
        if (!Array.isArray(data.items)) return { status: 'unavailable', message: 'Invalid reference response.' };
        return { status: 'ready', items: data.items };
      } catch (error) {
        const result = failure(error);
        return { status: result.status === 'denied' || result.status === 'absent' ? result.status : 'unavailable', message: result.message };
      }
    },
  };
  return { references, actions };
}

export function useResourceEditorServices(context: ResourceEditorContext): ResourceEditorServices {
  return useMemo(() => createResourceEditorServices(context), [context]);
}

/** Host-only handoff. No cluster write occurs until the normal Job create review submits. */
export async function prepareCronJobRun(context: ResourceEditorContext, signal: AbortSignal): Promise<{ source: string; resourceKey: 'k8s:batch/jobs' }> {
  if (context.group !== 'batch' || context.version !== 'v1' || context.resource !== 'cronjobs' || !context.name || !context.namespace) {
    throw new Error('Select a saved CronJob.');
  }
  const authorization = await createResourceEditorServices({
    ...context, group: 'authorization.k8s.io', version: 'v1', kind: 'SelfSubjectAccessReview',
    resource: 'selfsubjectaccessreviews', scope: 'Cluster', namespace: undefined, name: undefined, uid: undefined,
  }).actions.execute({
    protocol: 'kubernetes.review.v1', sessionID: 'cronjob-run-review', generation: 0, signal,
    input: { apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectAccessReview',
      spec: { resourceAttributes: { group: 'batch', resource: 'jobs', namespace: context.namespace, verb: 'create' } } },
  });
  if (authorization.status !== 'ready') throw new Error(authorization.message);
  const decision = authorization.output as { status?: { allowed?: boolean; denied?: boolean } };
  if (decision.status?.allowed !== true || decision.status.denied === true) throw new Error('Job creation is not permitted in this namespace.');
  const resolved = await cancellable(ResourceClient.ResolveReference(PLUGIN_ID, {
    route: { connection: context.connectionID }, type: 'k8s:batch/cronjobs', id: context.name, incarnation: context.uid,
    representation: 'kubernetes.object.v1/batch/v1', scope: [{ dimension: 'namespace', value: context.namespace }],
  }), signal);
  const response = await cancellable(ResourceClient.Get(PLUGIN_ID, {
    targetId: resolved.targetId, request: { route: resolved.route, reference: resolved.reference, representation: resolved.representation },
  }), signal);
  const object = decodeEditorValue(response.record.body) as { apiVersion?: string; kind?: string; metadata?: { uid?: string }; spec?: { jobTemplate?: { metadata?: { labels?: Record<string, string>; annotations?: Record<string, string> }; spec?: unknown } } };
  if (object.apiVersion !== 'batch/v1' || object.kind !== 'CronJob' || !object.spec?.jobTemplate?.spec || context.uid && object.metadata?.uid !== context.uid) throw new Error('CronJob changed or template unavailable.');
  const template = object.spec.jobTemplate;
  const metadata = {
    name: `${context.name.slice(0, 40)}-manual-${Date.now().toString(36)}`,
    namespace: context.namespace,
    ...(template.metadata?.labels ? { labels: template.metadata.labels } : {}),
    ...(template.metadata?.annotations ? { annotations: template.metadata.annotations } : {}),
  };
  return { source: stringify({ apiVersion: 'batch/v1', kind: 'Job', metadata, spec: template.spec }), resourceKey: 'k8s:batch/jobs' };
}

/** Host-only canonical load. Request envelopes and subresources never use collection GET. */
export async function loadResourceEditorSource(context: ResourceEditorContext, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw new Error('Request cancelled.');
  if (!context.resource || context.resource.includes('/') || !context.name || context.scope === 'Namespaced' && !context.namespace ||
      ['TokenReview', 'SelfSubjectReview', 'SubjectAccessReview', 'LocalSubjectAccessReview', 'SelfSubjectAccessReview', 'SelfSubjectRulesReview'].includes(context.kind)) {
    throw new Error('Select a saved Kubernetes object.');
  }
  try {
    const resolved = await cancellable(ResourceClient.ResolveReference(PLUGIN_ID, {
      route: { connection: context.connectionID }, type: `k8s:${context.group}/${context.resource}`, id: context.name, incarnation: context.uid,
      representation: `kubernetes.object.v1/${context.group ? `${context.group}/` : ''}${context.version}`,
      scope: context.scope === 'Namespaced' ? [{ dimension: 'namespace', value: context.namespace! }] : [],
    }), signal);
    const response = await cancellable(ResourceClient.Get(PLUGIN_ID, {
      targetId: resolved.targetId, request: { route: resolved.route, reference: resolved.reference, representation: resolved.representation },
    }), signal);
    const object = decodeEditorValue(response.record.body) as { apiVersion?: string; kind?: string; metadata?: { name?: string; namespace?: string; uid?: string } };
    const apiVersion = context.group ? `${context.group}/${context.version}` : context.version;
    if (object.apiVersion !== apiVersion || object.kind !== context.kind || object.metadata?.name !== context.name ||
        context.scope === 'Namespaced' && object.metadata?.namespace !== context.namespace || context.uid && object.metadata?.uid !== context.uid) {
      throw new Error('Object identity changed.');
    }
    return stringify(object);
  } catch (error) { throw new Error(signal.aborted ? 'Request cancelled.' : failure(error).message, { cause: error }); }
}
