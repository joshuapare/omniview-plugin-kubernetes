import React from 'react';
import { valueToJSON, type SearchActionReferenceV1, type SearchExecutionContextV1, type SearchProviderItemV1, type SearchScopeV1 } from '@omniviewdev/runtime';
import { ResourceClient } from '@omniviewdev/runtime/api';

import type { DrawerActionDeps } from '../shared/drawer/actionDeps';
import { useDrawerActionExecution } from '../shared/drawer/DrawerActionsBridge';

import { executeKubernetesAction, resolveKubernetesActions, type KubernetesActionTarget } from './resourceActions';

import { PLUGIN_ID } from '@/pluginId';

type ResourceScope = Extract<SearchScopeV1, { kind: 'resource' }>;
type ContextTarget = { connectionID: string; resourceKey: string };
type Resolver = (target: ContextTarget, signal: AbortSignal) => Promise<DrawerActionDeps>;
let resolveContext: Resolver | undefined;
let executionPending = false;
const keyOf = (target: ContextTarget) => JSON.stringify([target.connectionID, target.resourceKey]);
const abortError = () => new DOMException('Kubernetes action request cancelled', 'AbortError');
let discovered: { scope: string; ids: Set<string> } | undefined;

export async function freshTarget(scope: ResourceScope, signal: AbortSignal): Promise<KubernetesActionTarget> {
  if (scope.pluginId !== PLUGIN_ID) throw new Error('Kubernetes action target belongs to another plugin');
  if (signal.aborted) throw abortError();
  const request = ResourceClient.Get(PLUGIN_ID, { targetId: scope.targetId, request: {
    reference: scope.reference, route: scope.route, representation: scope.representation,
  } });
  const cancel = () => { void request.cancel?.(); };
  signal.addEventListener('abort', cancel, { once: true });
  let result;
  try {
    result = await request;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
  if (signal.aborted) throw abortError();
  const expected = scope.reference.address;
  const actual = result.record.reference.address;
  if (result.targetId !== scope.targetId || result.route.connection !== scope.route.connection
    || result.record.representation.id !== scope.representation
    || actual.provider !== expected.provider || actual.authority !== expected.authority
    || actual.type !== expected.type || actual.id !== expected.id
    || actual.scope.length !== expected.scope.length
    || !expected.scope.every(entry => actual.scope.some(candidate => candidate.dimension === entry.dimension && candidate.value === entry.value))
    || (scope.reference.incarnation !== undefined && result.record.reference.incarnation !== scope.reference.incarnation)) {
    throw new Error('Kubernetes action target identity no longer matches the resource');
  }
  const target = targetFromData(scope, valueToJSON(result.record.body));
  target.resource = { ...target.resource, key: result.key, record: result };
  return target;
}

function targetFromData(scope: ResourceScope, data: unknown): KubernetesActionTarget {
  if (!data || typeof data !== 'object') throw new Error('Kubernetes resource is no longer available');
  const metadata = (data as KubernetesActionTarget['data']).metadata;
  const namespace = scope.reference.address.scope.find(entry => entry.dimension === 'namespace')?.value ?? '';
  if (!scope.route.connection || !scope.reference.address.id || !metadata || metadata.name !== scope.reference.address.id
    || (metadata.namespace ?? '') !== namespace
    || (scope.reference.incarnation !== undefined && metadata.uid !== scope.reference.incarnation)) {
    throw new Error('Kubernetes action target identity no longer matches the resource');
  }
  return {
    pluginID: PLUGIN_ID,
    resource: { pluginID: PLUGIN_ID, reference: scope.reference, route: scope.route,
      representation: scope.representation, targetId: scope.targetId, name: scope.label },
    data: data as KubernetesActionTarget['data'],
  };
}

async function prepare(scope: ResourceScope, signal: AbortSignal) {
  const resolver = resolveContext;
  if (!resolver) throw new Error('Kubernetes search action context is unavailable');
  const target = await freshTarget(scope, signal);
  const deps = await resolver({ connectionID: scope.route.connection, resourceKey: scope.reference.address.type }, signal);
  if (signal.aborted || resolver !== resolveContext) throw abortError();
  return { target, deps };
}

export async function searchActions(scope: ResourceScope, signal: AbortSignal, data?: unknown): Promise<SearchProviderItemV1[]> {
  const resolver = resolveContext;
  if (!resolver) throw new Error('Kubernetes search action context is unavailable');
  const target = data === undefined ? await freshTarget(scope, signal) : targetFromData(scope, data);
  if (resolver !== resolveContext || signal.aborted) throw abortError();
  const items = resolveKubernetesActions(target).flatMap((descriptor) => {
    const choices = descriptor.items ?? (descriptor.execute ? [descriptor] : []);
    return choices.map((choice) => ({
      id: choice.id,
      label: descriptor.items && !(descriptor.execute && descriptor.items.length === 1)
        ? `${descriptor.title}: ${choice.title}` : descriptor.title,
      value: { schemaVersion: 1 as const, kind: 'action' as const, scope, action: { id: choice.id, target: scope } },
    }));
  });
  discovered = { scope: JSON.stringify(scope), ids: new Set(items.map(item => item.id)) };
  return items;
}

export function validateSearchAction(action: SearchActionReferenceV1, context: SearchExecutionContextV1): boolean {
  if (action.target.kind !== 'resource' || action.target.pluginId !== PLUGIN_ID) return false;
  context.signal.throwIfAborted();
  return Boolean(resolveContext && discovered?.scope === JSON.stringify(action.target) && discovered.ids.has(action.id));
}

export async function executeSearchAction(action: SearchActionReferenceV1, context: SearchExecutionContextV1): Promise<void> {
  if (action.target.kind !== 'resource') throw new Error('Kubernetes action requires a resource target');
  if (executionPending) throw new Error('Finish the current Kubernetes action before starting another');
  executionPending = true;
  try {
    const { target, deps } = await prepare(action.target, context.signal);
    const descriptors = resolveKubernetesActions(target, deps);
    const descriptor = descriptors.find((candidate) => candidate.id === action.id || candidate.items?.some((item) => item.id === action.id));
    if (!descriptor) throw new Error('Kubernetes action is no longer available');
    await executeKubernetesAction(target, deps, descriptor.id, descriptor.items ? action.id : undefined);
  } finally {
    executionPending = false;
  }
}

type Registration = { key: string; deps: DrawerActionDeps; ready: boolean; busy: boolean };

function ActionContext({ target, register }: {
  target: ContextTarget;
  register: (value?: Registration) => void;
}) {
  const { deps, dialogs, isReady, isBusy } = useDrawerActionExecution(target);
  const latest = React.useRef(deps);
  const latestReady = React.useRef(isReady);
  React.useLayoutEffect(() => {
    latest.current = deps;
    latestReady.current = isReady;
  }, [deps, isReady]);
  const stable = React.useMemo<DrawerActionDeps>(() => ({
    show: (...args) => latest.current.show(...args),
    mutate: (...args) => latest.current.mutate(...args),
    createLogSession: (...args) => latest.current.createLogSession(...args),
    createExecSession: (...args) => latest.current.createExecSession(...args),
    openNativeSession: (...args) => latest.current.openNativeSession(...args),
    get nativeExecAvailable() { return latest.current.nativeExecAvailable; },
    get nativeExecPending() { return latest.current.nativeExecPending; },
    executeAction: (...args) => latest.current.executeAction(...args),
    startStreamAction: (...args) => latest.current.startStreamAction(...args),
    startDebug: (...args) => latest.current.startDebug(...args),
    openDebugOptions: (...args) => {
      register({ key: keyOf(target), deps: stable, ready: latestReady.current, busy: true });
      latest.current.openDebugOptions(...args);
    },
    closeDrawer: () => latest.current.closeDrawer(),
    openScale: (value) => {
      register({ key: keyOf(target), deps: stable, ready: latestReady.current, busy: true });
      latest.current.openScale(value);
    },
    get nodeShellConfig() { return latest.current.nodeShellConfig; },
  }), [target, register]);
  React.useEffect(() => {
    register({ key: keyOf(target), deps: stable, ready: isReady, busy: Boolean(isBusy) });
    return () => register();
  }, [target, stable, isReady, isBusy, register]);
  return dialogs;
}

/** At most one hook context exists; discovery never mounts action hooks. */
export default function KubernetesSearchActionContext() {
  const [target, setTarget] = React.useState<ContextTarget | null>(null);
  const current = React.useRef<Registration | undefined>(undefined);
  const pending = React.useRef<{ key: string; finish: (deps?: DrawerActionDeps) => void } | undefined>(undefined);
  const register = React.useCallback((value?: Registration) => {
    current.current = value;
    if (value?.ready && pending.current?.key === value.key) {
      const finish = pending.current.finish;
      pending.current = undefined;
      finish(value.deps);
    }
  }, []);
  React.useEffect(() => {
    const resolver: Resolver = (next, signal) => {
      if (signal.aborted) return Promise.reject(abortError());
      if (pending.current || current.current?.busy) {
        return Promise.reject(new Error('Finish the current Kubernetes action before starting another'));
      }
      const key = keyOf(next);
      if (current.current?.key === key && current.current.ready) return Promise.resolve(current.current.deps);
      return new Promise<DrawerActionDeps>((resolve, reject) => {
        const finish = (deps?: DrawerActionDeps) => {
          signal.removeEventListener('abort', abort);
          if (deps) resolve(deps);
          else reject(new Error('Kubernetes search action context was removed'));
        };
        const abort = () => {
          pending.current = undefined;
          signal.removeEventListener('abort', abort);
          reject(abortError());
        };
        pending.current = { key, finish };
        signal.addEventListener('abort', abort, { once: true });
        setTarget(next);
      });
    };
    resolveContext = resolver;
    return () => {
      if (resolveContext === resolver) resolveContext = undefined;
      discovered = undefined;
      pending.current?.finish();
      pending.current = undefined;
      current.current = undefined;
    };
  }, []);
  return target ? <ActionContext key={keyOf(target)} target={target} register={register} /> : null;
}
