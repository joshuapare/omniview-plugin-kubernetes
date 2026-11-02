import { jsonToValue, type DrawerContext } from '@omniviewdev/runtime';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/pluginId', () => ({ PLUGIN_ID: 'alternate-kube' }));

import type { DrawerActionDeps } from '../shared/drawer/actionDeps';
import { bindDrawerActionDeps } from '../shared/drawer/actionDeps';

import { resourceDrawerActions } from './drawerActions';
import { executeKubernetesAction, resolveKubernetesActions, type KubernetesActionTarget } from './resourceActions';

const target = (resourceKey = 'k8s:/pods'): KubernetesActionTarget => {
  const result: KubernetesActionTarget = {
  pluginID: 'alternate-kube',
  resource: {
    pluginID: 'alternate-kube', route: { connection: 'prod' },
    reference: {
      address: { provider: 'kubernetes', authority: 'test-cluster', type: resourceKey, id: 'api', scope: [{ dimension: 'namespace', value: 'apps' }] },
      incarnation: 'uid-1',
    },
    representation: 'native-json-test', targetId: 'action-membership',
  },
  data: {
    metadata: { name: 'api', namespace: 'apps', uid: 'uid-1' },
    spec: {
      containers: [{ name: 'main' }], initContainers: [{ name: 'setup' }],
      ephemeralContainers: [{ name: 'debug' }],
      template: { spec: { containers: [{ name: 'main' }, { name: 'sidecar' }] } },
      jobTemplate: { spec: { template: { spec: { containers: [{ name: 'main' }, { name: 'sidecar' }] } } } },
    },
  },
  };
  result.resource.record = {
    key: 'host-key', addressKey: 'host-address', targetId: result.resource.targetId!,
    route: result.resource.route,
    record: {
      reference: result.resource.reference,
      representation: { id: result.resource.representation!, revision: '1', schema: { state: 'none', validation: 'none', unvalidated: [] } },
      coverage: { kind: 'complete', paths: [], reason: '' },
      body: jsonToValue({ ...result.data, wide: 9007199254740993n }),
    },
  };
  return result;
};
const deps = () => ({
  createLogSession: vi.fn().mockResolvedValue({ id: 'session' }),
  createExecSession: vi.fn().mockResolvedValue({ id: 'exec-session' }),
  nativeExecAvailable: false,
  nativeExecPending: false,
  openNativeSession: vi.fn().mockResolvedValue(false),
  closeDrawer: vi.fn(), show: vi.fn(),
} as unknown as DrawerActionDeps);

describe('standalone Kubernetes actions', () => {
  it('offers init and ephemeral log container choices without mounted handlers', () => {
    const handlers = deps();
    const object = target();
    const logs = resolveKubernetesActions(object, handlers).find((action) => action.title === 'Logs')!;
    expect(logs.items?.map((item) => item.title)).toEqual(['All Containers', 'main', 'setup (init)', 'debug (ephemeral)']);
  });

  it.each([
    ['Deployment', 'k8s:apps/deployments'], ['DaemonSet', 'k8s:apps/daemonsets'],
    ['ReplicaSet', 'k8s:apps/replicasets'], ['StatefulSet', 'k8s:apps/statefulsets'],
    ['Job', 'k8s:batch/jobs'], ['CronJob', 'k8s:batch/cronjobs'],
  ])(
    'keeps all-container and named-container choices for %s', (_kind, resourceType) => {
      const object = target(resourceType);
      const handlers = deps();
      const logs = resolveKubernetesActions(object, handlers).find((action) => action.title === 'Logs')!;
      expect(logs.items?.map((item) => item.title)).toEqual(['All Containers', 'main', 'sidecar']);
    },
  );

  it('requires explicit container selection and rejects stale choices', () => {
    const handlers = deps();
    const object = target();
    const logs = resolveKubernetesActions(object, handlers).find((action) => action.title === 'Logs')!;
    expect(() => executeKubernetesAction(object, handlers, logs.id)).toThrow(/Choose/);
    expect(() => executeKubernetesAction(object, handlers, logs.id, 'missing')).toThrow(/Choose/);
    expect(handlers.createLogSession).not.toHaveBeenCalled();
  });

  it('rejects stale UID, namespace mismatch, and unavailable actions', () => {
    const object = target();
    expect(() => resolveKubernetesActions({
      ...object, resource: { ...object.resource, reference: { ...object.resource.reference, incarnation: 'deleted' } },
    }, deps())).toThrow(/identity/);
    expect(() => resolveKubernetesActions({
      ...object, data: { ...object.data, metadata: { ...object.data.metadata, namespace: 'other' } },
    }, deps())).toThrow(/identity/);
    expect(() => executeKubernetesAction(object, deps(), 'missing')).toThrow(/no longer available/);
    expect(resolveKubernetesActions(object, deps()).some((action) => action.title === 'Resize')).toBe(false);
  });

  it('dispatches the node drawer drain with canonical pod-default grace', async () => {
    const handlers = { ...deps(), executeAction: vi.fn().mockResolvedValue({}) };
    const object = target('k8s:/nodes');
    object.resource.reference.address.scope = [];
    object.data.metadata!.namespace = undefined;
    const drain = resolveKubernetesActions(object, handlers).find((entry) => entry.title === 'Drain')!;
    executeKubernetesAction(object, handlers, drain.id);
    expect(handlers.executeAction).not.toHaveBeenCalled();
    const confirmation = vi.mocked(handlers.show).mock.calls[0][0] as { onConfirm: () => Promise<void> };
    await confirmation.onConfirm();
    expect(handlers.executeAction).toHaveBeenCalledTimes(1);
    expect(handlers.executeAction).toHaveBeenCalledWith({
      route: object.resource.route,
      reference: object.resource.reference,
      action: 'drain',
      input: {
        kind: 'map',
        value: {
          gracePeriodSeconds: { kind: 'int64', value: '-1' },
          ignoreDaemonSets: { kind: 'bool', value: true },
          deleteEmptyDirData: { kind: 'bool', value: true },
          force: { kind: 'bool', value: false },
        },
      },
    });
  });

  it('preserves confirmation and propagates rejected delete without closing drawer', async () => {
    const handlers = { ...deps(), mutate: vi.fn().mockRejectedValue(new Error('Forbidden')) };
    const object = target();
    const action = resolveKubernetesActions(object, handlers).find((entry) => entry.title === 'Delete')!;
    executeKubernetesAction(object, handlers, action.id);
    expect(handlers.mutate).not.toHaveBeenCalled();
    const confirmation = vi.mocked(handlers.show).mock.calls[0][0] as { onConfirm: () => Promise<void> };
    await expect(confirmation.onConfirm()).rejects.toThrow('Forbidden');
    expect(handlers.closeDrawer).not.toHaveBeenCalled();
  });
});

type DebugPodTarget = KubernetesActionTarget & {
  data: {
    metadata: { name: string; namespace: string; uid: string; annotations?: Record<string, string>; deletionTimestamp?: string };
    spec: { containers: { name: string }[]; initContainers: { name: string }[]; ephemeralContainers: { name: string }[] };
    status: {
      phase: string;
      containerStatuses: { name: string; state: Record<string, unknown> }[];
      initContainerStatuses: { name: string; state: Record<string, unknown> }[];
      ephemeralContainerStatuses: { name: string; state: Record<string, unknown> }[];
    };
  };
};

const livePod = (): DebugPodTarget => ({
  ...target(),
  data: {
    metadata: { name: 'api', namespace: 'apps', uid: 'uid-1' },
    spec: {
      containers: [{ name: 'worker' }, { name: 'main' }, { name: 'stopped' }],
      initContainers: [{ name: 'setup' }],
      ephemeralContainers: [{ name: 'old-debugger' }],
    },
    status: {
      phase: 'Running',
      containerStatuses: [
        { name: 'main', state: { running: {} } },
        { name: 'worker', state: { running: {} } },
        { name: 'stopped', state: { terminated: { exitCode: 1 } } },
      ],
      initContainerStatuses: [{ name: 'setup', state: { running: {} } }],
      ephemeralContainerStatuses: [{ name: 'old-debugger', state: { running: {} } }],
    },
  },
});

describe('live Pod Debug actions', () => {
  const debugDeps = () => ({ ...deps(), startDebug: vi.fn().mockResolvedValue(undefined) });
  const debugAction = (object: KubernetesActionTarget, handlers = debugDeps()) =>
    resolveKubernetesActions(object, handlers).find(action => action.title === 'Debug');

  it('offers only exact running regular container names, never bulk, init, stopped, or ephemeral targets', () => {
    const debug = debugAction(livePod());
    expect(debug).toBeDefined();
    expect(debug!.items?.map(item => item.title).sort()).toEqual(['main', 'worker']);
  });

  it('launches one running target directly without routine confirmation', async () => {
    const handlers = debugDeps();
    const object = livePod();
    object.data.status.containerStatuses[0].state = { waiting: { reason: 'CrashLoopBackOff' } };
    const debug = debugAction(object, handlers);
    expect(debug).toBeDefined();
    await executeKubernetesAction(object, handlers, debug!.id);
    expect(handlers.startDebug).toHaveBeenCalledTimes(1);
    expect(handlers.startDebug).toHaveBeenCalledWith({
      connectionID: 'prod', resourceID: 'api', namespace: 'apps', podUID: 'uid-1',
      targetContainerName: 'worker', resourceData: object.data,
    });
    expect(handlers.show).not.toHaveBeenCalled();
  });

  it('requires a named choice for multiple targets and revalidates a stopped choice', async () => {
    const handlers = debugDeps();
    const object = livePod();
    const debug = debugAction(object, handlers)!;
    expect(debug).toBeDefined();
    expect(() => executeKubernetesAction(object, handlers, debug.id)).toThrow(/Choose/);
    const main = debug.items!.find(item => item.title === 'main')!;
    object.data.status.containerStatuses[0].state = { terminated: { exitCode: 0 } };
    expect(() => executeKubernetesAction(object, handlers, debug.id, main.id)).toThrow(/available|executable|Choose/);
    expect(handlers.startDebug).not.toHaveBeenCalled();
  });

  it('keeps named selection stable when fresh container order changes', async () => {
    const handlers = debugDeps();
    const object = livePod();
    const debug = debugAction(object, handlers)!;
    expect(debug).toBeDefined();
    const main = debug.items!.find(item => item.title === 'main')!;
    object.data.spec.containers.reverse();
    await executeKubernetesAction(object, handlers, debug.id, main.id);
    expect(handlers.startDebug).toHaveBeenCalledWith(expect.objectContaining({ targetContainerName: 'main' }));
  });

  it.each(['two-to-one', 'one-to-two'])('preserves a selected running target across %s resolution', async (change) => {
    const handlers = debugDeps();
    const object = livePod();
    if (change === 'one-to-two') {
      object.data.status.containerStatuses[1].state = { waiting: {} };
    }
    const debug = debugAction(object, handlers)!;
    const main = debug.items?.find(item => item.title === 'main');
    expect(main).toBeDefined();
    object.data.status.containerStatuses[1].state = change === 'two-to-one'
      ? { terminated: { exitCode: 0 } }
      : { running: {} };
    await executeKubernetesAction(object, handlers, debug.id, main!.id);
    expect(handlers.startDebug).toHaveBeenCalledTimes(1);
    expect(handlers.startDebug).toHaveBeenCalledWith(expect.objectContaining({
      targetContainerName: 'main', resourceData: object.data,
    }));
  });

  it.each(['no-running', 'static', 'deleting', 'Succeeded', 'Failed'])('does not offer Debug for %s Pods', (condition) => {
    const object = livePod();
    if (condition === 'no-running') object.data.status.containerStatuses = [];
    else if (condition === 'static') object.data.metadata.annotations = { 'kubernetes.io/config.mirror': 'mirror' };
    else if (condition === 'deleting') object.data.metadata.deletionTimestamp = '2026-10-28T00:00:00Z';
    else object.data.status.phase = condition;
    expect(debugAction(object)).toBeUndefined();
  });

  it('rejects replaced Pod identities before invoking the launch hook', () => {
    const handlers = debugDeps();
    const object = livePod();
    const debug = debugAction(object, handlers)!;
    expect(debug).toBeDefined();
    object.data.metadata!.uid = 'replacement';
    expect(() => executeKubernetesAction(object, handlers, debug.id, debug.items![0].id)).toThrow(/identity/);
    expect(handlers.startDebug).not.toHaveBeenCalled();
  });

  it('launches the single running target from the header without confirmation', async () => {
    const handlers = debugDeps();
    const object = livePod();
    object.data.status.containerStatuses[1].state = { terminated: { exitCode: 0 } };
    const ctx = bindDrawerActionDeps({
      data: object.data,
      resource: object.resource,
    } as DrawerContext, handlers);
    const header = resourceDrawerActions[object.resource.reference.address.type].actions!.find(action => action.title === 'Debug');
    expect(header).toBeDefined();
    await header!.action!(ctx);
    expect(handlers.startDebug).toHaveBeenCalledTimes(1);
    expect(handlers.show).not.toHaveBeenCalled();
    expect(handlers.startDebug).toHaveBeenCalledWith(expect.objectContaining({
      podUID: 'uid-1', targetContainerName: 'main', resourceData: object.data,
    }));
  });
});


describe('ephemeral exec routing', () => {
  it('retains native attach mode and UID with canonical body and target identity', async () => {
    const object = target();
    const handlers = deps();
    const exec = resolveKubernetesActions(object, handlers).find(action => action.title === 'Exec')!;
    const ephemeral = exec.items!.find(item => item.title === 'debug')!;
    await executeKubernetesAction(object, handlers, exec.id, ephemeral.id);
    expect(handlers.createExecSession).toHaveBeenCalledWith(expect.objectContaining({
      connectionID: object.resource.route.connection,
      opts: expect.objectContaining({
        resource_plugin: 'kubernetes',
        resource_data: object.resource.record!.record.body,
        reference: object.resource.reference,
        route: object.resource.route,
        resource_key: 'k8s:/pods',
        params: { mode: 'attach', container: 'debug', pod_uid: 'uid-1' },
      }),
    }));
  });
  it.each([
    ['k8s:/pods', 'Exec', 'main'],
    ['k8s:/pods', 'Exec', 'debug'],
    ['k8s:/nodes', 'Shell', undefined],
  ])('keeps the canonical native selector for %s %s %s under an alternate installation', async (type, title, item) => {
    const object = target(type);
    if (type === 'k8s:/nodes') {
      object.resource.reference.address.scope = [];
      object.data.metadata!.namespace = undefined;
    }
    const handlers = deps();
    const action = resolveKubernetesActions(object, handlers).find(entry => entry.title === title)!;
    const choice = item ? action.items!.find(entry => entry.title === item)!.id : undefined;
    await executeKubernetesAction(object, handlers, action.id, choice);
    const request = vi.mocked(handlers.createExecSession).mock.calls[0][0];
    expect(object.resource.pluginID).toBe('alternate-kube');
    expect(request.opts.resource_plugin).toBe(object.resource.reference.address.provider);
    expect(request.opts.resource_plugin).toBe('kubernetes');
    expect(request.opts.resource_data).toBe(object.resource.record!.record.body);
    expect(request.opts.reference).toBe(object.resource.reference);
    expect(request.opts.route).toBe(object.resource.route);
  });
});

describe('ordinary Pod native terminal actions', () => {
  it('offers explicit native choices only for supported ordinary containers', () => {
    const object = target();
    const handlers = { ...deps(), nativeExecAvailable: true };
    const exec = resolveKubernetesActions(object, handlers).find(action => action.title === 'Exec')!;
    expect(exec.items?.map(item => item.title)).toEqual(['main', 'main — Open in Native Terminal', 'debug']);
    handlers.nativeExecAvailable = false;
    expect(resolveKubernetesActions(object, handlers).find(action => action.title === 'Exec')!.items?.map(item => item.title))
      .toEqual(['main', 'debug']);
    expect(handlers.openNativeSession).not.toHaveBeenCalled();
    expect(handlers.createExecSession).not.toHaveBeenCalled();
  });

  it.each([true, false])('closes only after native launch reports %s without allocating a built-in session', async (opened) => {
    const object = target();
    const handlers = { ...deps(), nativeExecAvailable: true, openNativeSession: vi.fn().mockResolvedValue(opened) };
    const exec = resolveKubernetesActions(object, handlers).find(action => action.title === 'Exec')!;
    const native = exec.items!.find(item => item.title === 'main — Open in Native Terminal')!;
    await executeKubernetesAction(object, handlers, exec.id, native.id);
    expect(handlers.openNativeSession).toHaveBeenCalledExactlyOnceWith({
      connectionID: 'prod',
      opts: {
        resource_plugin: object.resource.reference.address.provider,
        resource_data: object.resource.record!.record.body,
        reference: object.resource.reference,
        route: object.resource.route,
        resource_key: 'k8s:/pods',
        params: { container: 'main' },
      },
    });
    expect(handlers.createExecSession).not.toHaveBeenCalled();
    expect(handlers.closeDrawer).toHaveBeenCalledTimes(opened ? 1 : 0);
  });

  it('disables pending native rows and prevents a captured row from launching again', async () => {
    const object = target();
    const handlers = { ...deps(), nativeExecAvailable: true };
    const ctx = bindDrawerActionDeps({ data: object.data, resource: object.resource }, handlers);
    const exec = resourceDrawerActions['k8s:/pods'].actions.find(action => action.title === 'Exec')!;
    const list = () => typeof exec.list === 'function' ? exec.list(ctx) : exec.list!;
    const native = list().find(item => item.title === 'main — Open in Native Terminal')!;
    handlers.nativeExecPending = true;
    expect(list().find(item => item.title === native.title)?.disabled).toBe(true);
    expect(list().find(item => item.title === 'main')?.disabled).not.toBe(true);
    await native.action(ctx);
    expect(handlers.openNativeSession).not.toHaveBeenCalled();
    expect(handlers.closeDrawer).not.toHaveBeenCalled();
    handlers.nativeExecPending = false;
    handlers.nativeExecAvailable = false;
    await native.action(ctx);
    expect(handlers.openNativeSession).not.toHaveBeenCalled();
  });

  it('keeps missing-shell recovery exclusive to built-in ordinary exec', async () => {
    const object = livePod();
    const handlers = { ...deps(), nativeExecAvailable: true, startDebug: vi.fn().mockResolvedValue(undefined) };
    const exec = resolveKubernetesActions(object, handlers).find(action => action.title === 'Exec')!;
    const main = exec.items!.find(item => item.title === 'main')!;
    await executeKubernetesAction(object, handlers, exec.id, main.id);
    const request = vi.mocked(handlers.createExecSession).mock.calls[0][0];
    expect(request.recovery?.label).toBe('Debug this container');
    await request.recovery?.run();
    expect(handlers.startDebug).toHaveBeenCalledWith(expect.objectContaining({ targetContainerName: 'main' }));
    expect(handlers.openNativeSession).not.toHaveBeenCalled();
  });

  it('does not add native launch choices to Node shell', () => {
    const object = target('k8s:/nodes');
    object.resource.reference.address.scope = [];
    object.data.metadata!.namespace = undefined;
    const handlers = { ...deps(), nativeExecAvailable: true };
    const shell = resolveKubernetesActions(object, handlers).find(action => action.title === 'Shell')!;
    expect(shell.items).toBeUndefined();
    expect(handlers.openNativeSession).not.toHaveBeenCalled();
  });
});
