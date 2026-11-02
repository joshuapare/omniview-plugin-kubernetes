import type {
  DrawerContext,
  useConfirmationModal,
  useExec,
  useExecuteAction,
  useLogs,
  NativeExecInput,
  MutationRequest,
  useStreamAction,
} from '@omniviewdev/runtime';
import type { Pod } from 'kubernetes-types/core/v1';

/**
 * Shared hook-backed execution dependencies. Drawer bridges register fallback
 * handlers; standalone consumers bind handlers directly to their context.
 * Context binding survives confirmation callbacks without a mounted table.
 */

export type ScaleTarget = { resource: NonNullable<DrawerContext['resource']>; name: string; namespace: string; replicas: number };

type NodeShellConfig = { image?: string; command?: string };

export type StartDebugInput = {
  connectionID: string;
  resourceID: string;
  namespace: string;
  podUID: string;
  targetContainerName: string;
  resourceData: Pod;
};

export type DrawerActionDeps = {
  show: ReturnType<typeof useConfirmationModal>['show'];
  mutate: (request: MutationRequest) => Promise<unknown>;
  createLogSession: ReturnType<typeof useLogs>['createLogSession'];
  createExecSession: ReturnType<typeof useExec>['createSession'];
  nativeExecAvailable: boolean;
  nativeExecPending: boolean;
  openNativeSession: (input: NativeExecInput) => Promise<boolean>;
  executeAction: ReturnType<typeof useExecuteAction>['executeAction'];
  startStreamAction: ReturnType<typeof useStreamAction>['startStreamAction'];
  closeDrawer: () => void;
  /** Opens the replica count dialog; confirming runs the `scale` action. */
  openScale: (target: ScaleTarget) => void;
  startDebug: (input: StartDebugInput) => Promise<void>;
  openDebugOptions: (input: StartDebugInput) => void;
  nodeShellConfig?: NodeShellConfig;
};

const registry = new Map<string, DrawerActionDeps[]>();
const listeners = new Map<string, Set<() => void>>();

const notify = (key: string) => listeners.get(key)?.forEach((listener) => listener());

const contextDeps = new WeakMap<DrawerContext, DrawerActionDeps>();

export function bindDrawerActionDeps(ctx: DrawerContext, deps: DrawerActionDeps): DrawerContext {
  contextDeps.set(ctx, deps);
  return ctx;
}

export const registryKey = (connectionID: string, resourceKey: string) => `${connectionID}\u0000${resourceKey}`;

export function registerDrawerActionDeps(key: string, deps: DrawerActionDeps): () => void {
  const list = registry.get(key) ?? [];
  list.push(deps);
  registry.set(key, list);
  notify(key);
  return () => {
    const current = registry.get(key);
    if (!current) return;
    const idx = current.lastIndexOf(deps);
    if (idx !== -1) current.splice(idx, 1);
    if (current.length === 0) registry.delete(key);
    notify(key);
  };
}

/** Snapshot and subscription keep action lists current as hook-backed handlers change. */
export const drawerActionDepsStore = {
  getSnapshot(ctx: DrawerContext): DrawerActionDeps | undefined {
    const bound = contextDeps.get(ctx);
    if (bound) return bound;
    const key = registryKey(ctx.resource?.route.connection ?? '', ctx.resource?.reference.address.type ?? '');
    const list = registry.get(key);
    return list?.[list.length - 1];
  },
  subscribe(ctx: DrawerContext, listener: () => void): () => void {
    const key = registryKey(ctx.resource?.route.connection ?? '', ctx.resource?.reference.address.type ?? '');
    const current = listeners.get(key) ?? new Set<() => void>();
    current.add(listener);
    listeners.set(key, current);
    return () => {
      current.delete(listener);
      if (current.size === 0) listeners.delete(key);
    };
  },
};

/** The hook-backed handlers for the resource in `ctx`. */
export function drawerActionDeps(ctx: DrawerContext): DrawerActionDeps {
  const deps = drawerActionDepsStore.getSnapshot(ctx);
  const connectionID = ctx.resource?.route.connection ?? '';
  const resourceKey = ctx.resource?.reference.address.type ?? '';
  if (!deps) {
    throw new Error(`No drawer action handlers are mounted for ${resourceKey} on connection ${connectionID}`);
  }
  return deps;
}
