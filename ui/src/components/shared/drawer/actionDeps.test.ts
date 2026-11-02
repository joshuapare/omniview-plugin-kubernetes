import type { DrawerContext } from '@omniviewdev/runtime';
import { describe, expect, it, vi } from 'vitest';

import { resourceDrawerActions } from '../../kubernetes/drawerActions';

import { bindDrawerActionDeps, type DrawerActionDeps, drawerActionDeps, drawerActionDepsStore, registerDrawerActionDeps, registryKey } from './actionDeps';

function fakeDeps(): DrawerActionDeps {
  return {
    show: vi.fn(),
    mutate: vi.fn().mockResolvedValue(undefined),
    createLogSession: vi.fn().mockResolvedValue(undefined),
    createExecSession: vi.fn().mockResolvedValue(undefined),
    nativeExecAvailable: false,
    nativeExecPending: false,
    openNativeSession: vi.fn().mockResolvedValue(false),
    executeAction: vi.fn().mockResolvedValue(undefined),
    startStreamAction: vi.fn().mockResolvedValue(undefined),
    closeDrawer: vi.fn(),
    openScale: vi.fn(),
  } as unknown as DrawerActionDeps;
}

const rsCtx: DrawerContext = {
  data: { metadata: { name: 'web-7d4b9c', namespace: 'prod' } },
  resource: {
    pluginID: 'kubernetes',
    route: { connection: 'conn-1' },
    reference: {
      address: {
        provider: 'kubernetes', authority: 'test-cluster', type: 'k8s:apps/replicasets',
        scope: [{ dimension: 'namespace', value: 'prod' }], id: 'web-7d4b9c',
      },
      incarnation: 'native-uid',
    },
    representation: 'native-json-test',
    targetId: 'table-membership',
  },
};

describe('drawerActionDeps', () => {
  it('keeps explicitly bound context handlers independent of mounted surfaces', () => {
    const bound = fakeDeps();
    const mounted = fakeDeps();
    const ctx = bindDrawerActionDeps({ ...rsCtx }, bound);
    const unregister = registerDrawerActionDeps(registryKey('conn-1', 'k8s:apps/replicasets'), mounted);
    expect(drawerActionDeps(ctx)).toBe(bound);
    unregister();
    expect(drawerActionDeps(ctx)).toBe(bound);
  });

  it('throws when nothing is mounted for the resource', () => {
    expect(() => drawerActionDeps(rsCtx)).toThrow('k8s:apps/replicasets');
  });

  it('returns the most recently mounted handlers and falls back on unmount', () => {
    const key = registryKey('conn-1', 'k8s:apps/replicasets');
    const table = fakeDeps();
    const drawer = fakeDeps();
    const unregisterTable = registerDrawerActionDeps(key, table);
    const unregisterDrawer = registerDrawerActionDeps(key, drawer);

    expect(drawerActionDeps(rsCtx)).toBe(drawer);
    unregisterDrawer();
    expect(drawerActionDeps(rsCtx)).toBe(table);
    unregisterTable();
    expect(() => drawerActionDeps(rsCtx)).toThrow();
  });

  it('does not mix up connections', () => {
    const unregister = registerDrawerActionDeps(registryKey('conn-2', 'k8s:apps/replicasets'), fakeDeps());
    expect(() => drawerActionDeps(rsCtx)).toThrow();
    unregister();
  });

  it('publishes registration, replacement, fallback, and removal without retaining cleaned-up listeners', () => {
    const key = registryKey('conn-1', 'k8s:apps/replicasets');
    expect(drawerActionDepsStore.getSnapshot(rsCtx)).toBeUndefined();
    expect(drawerActionDepsStore.getSnapshot(rsCtx)).toBeUndefined();
    const snapshots: Array<DrawerActionDeps | undefined> = [];
    const unsubscribe = drawerActionDepsStore.subscribe(rsCtx, () => snapshots.push(drawerActionDepsStore.getSnapshot(rsCtx)));
    const table = fakeDeps();
    const drawer = { ...fakeDeps(), nativeExecAvailable: true };
    const unregisterTable = registerDrawerActionDeps(key, table);
    const unregisterDrawer = registerDrawerActionDeps(key, drawer);
    expect(drawerActionDepsStore.getSnapshot(rsCtx)).toBe(drawer);
    unregisterDrawer();
    unregisterTable();
    expect(snapshots).toEqual([table, drawer, table, undefined]);
    unsubscribe();
    const unregisterLater = registerDrawerActionDeps(key, fakeDeps());
    unregisterLater();
    expect(snapshots).toHaveLength(4);
  });
});

describe('resourceDrawerActions', () => {
  it('gives linked ReplicaSet and Deployment drawers their actions', () => {
    const titles = (key: string) => resourceDrawerActions[key]?.actions.map((a) => a.title);
    expect(titles('k8s:apps/replicasets')).toEqual(['Delete', 'Logs']);
    expect(titles('k8s:apps/deployments')).toEqual([
      'Restart', 'Scale', 'Pause Rollout', 'Resume Rollout', 'Delete', 'Logs',
    ]);
  });

  it('runs a linked delete through the mounted handlers', async () => {
    const deps = fakeDeps();
    const unregister = registerDrawerActionDeps(registryKey('conn-1', 'k8s:apps/replicasets'), deps);

    const del = resourceDrawerActions['k8s:apps/replicasets'].actions.find((a) => a.title === 'Delete');
    del?.action?.(rsCtx);
    expect(deps.show).toHaveBeenCalledTimes(1);

    const { onConfirm } = vi.mocked(deps.show).mock.calls[0][0] as { onConfirm: () => Promise<void> };
    await onConfirm();
    expect(deps.mutate).toHaveBeenCalledWith({
      route: rsCtx.resource!.route,
      reference: rsCtx.resource!.reference,
      operation: 'delete',
      input: { kind: 'map', value: {} },
    });
    expect(deps.closeDrawer).toHaveBeenCalled();
    unregister();
  });
});
