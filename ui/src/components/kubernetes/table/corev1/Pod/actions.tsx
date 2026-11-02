import { type DrawerContext, type DrawerComponentAction, type DrawerComponentActionListItem } from '@omniviewdev/runtime'
import type { Pod } from 'kubernetes-types/core/v1';
import { LuBugPlay, LuChevronDown, LuExternalLink, LuLogs, LuScaling, LuTerminal, LuTrash } from 'react-icons/lu';

import { isMissingShellError, runningDebugTargets } from '../../../../../features/debug/targets';
import { type DrawerActionDeps, drawerActionDeps, drawerActionDepsStore } from '../../../../shared/drawer/actionDeps';


const debugInput = (ctx: DrawerContext<Pod>, targetContainerName: string) => {
  const pod = ctx.data;
  if (!pod || !runningDebugTargets(pod).includes(targetContainerName)) throw new Error('Debug target is no longer available');
  return {
    connectionID: ctx.resource?.route.connection ?? '',
    resourceID: pod.metadata!.name!,
    namespace: pod.metadata!.namespace!,
    podUID: pod.metadata!.uid!,
    targetContainerName,
    resourceData: pod,
  };
};

const resourceKey = 'k8s:/pods';

/** Drawer header and row menu actions for Pods. Handlers come from `drawerActionDeps`. */
export const drawerActions: Array<DrawerComponentAction<Pod>> = [
  {
    title: 'Delete',
    icon: <LuTrash />,
    action: (ctx) => {
      void drawerActionDeps(ctx).show({
        title: (
          <span>
            Delete <strong>{ctx.data?.metadata?.name}</strong>?
          </span>
        ),
        body: (
          <span>
            Are you sure you want to delete the Pod <code>{ctx.data?.metadata?.name}</code>{' '}
            from <strong>{ctx.data?.metadata?.namespace}</strong>?
          </span>
        ),
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        onConfirm: async () => {
          await drawerActionDeps(ctx).mutate({ route: ctx.resource!.route, reference: ctx.resource!.reference, operation: 'delete', input: { kind: 'map', value: {} } });
          drawerActionDeps(ctx).closeDrawer();
        },
      });
    },
  },
  {
    title: 'Exec',
    icon: <LuTerminal />,
    enabled: true,
    externalStore: drawerActionDepsStore,
    list: (ctx, snapshot) => {
      const list: Array<DrawerComponentActionListItem> = [];
      const nativeDeps = (snapshot as DrawerActionDeps | undefined) ?? drawerActionDepsStore.getSnapshot(ctx);

      ctx.data?.spec?.containers?.forEach((container) => {
        list.push({
          title: container.name,
          action: () => {
            const recoveryTarget = runningDebugTargets(ctx.data).includes(container.name) ? debugInput(ctx, container.name) : null;
            return drawerActionDeps(ctx).createExecSession({
              connectionID: ctx.resource?.route.connection ?? '',
              label: `${ctx.data?.metadata?.name}/${container.name}`,
              icon: 'LuContainer',
              recovery: {
                label: 'Debug this container',
                canRecover: (error) => recoveryTarget !== null && isMissingShellError(error),
                run: () => {
                  if (!recoveryTarget) return Promise.reject(new Error('Original container is no longer available'));
                  return drawerActionDeps(ctx).startDebug(recoveryTarget);
                },
              },
              opts: {
                resource_plugin: ctx.resource!.reference.address.provider,
                resource_data: ctx.resource!.record!.record.body,
                reference: ctx.resource!.reference,
                route: ctx.resource!.route,
                resource_key: ctx.resource?.reference.address.type,
                params: { container: container.name },
              },
            }).then((session) => { if (session) drawerActionDeps(ctx).closeDrawer(); });
          },
        });
        if (nativeDeps?.nativeExecAvailable) {
          list.push({
            title: `${container.name} — Open in Native Terminal`,
            icon: <LuExternalLink />,
            disabled: nativeDeps.nativeExecPending,
            action: async () => {
              const deps = drawerActionDeps(ctx);
              if (!deps.nativeExecAvailable || deps.nativeExecPending) return;
              const opened = await deps.openNativeSession({
                connectionID: ctx.resource?.route.connection ?? '',
                opts: {
                  resource_plugin: ctx.resource!.reference.address.provider,
                  resource_data: ctx.resource!.record!.record.body,
                  reference: ctx.resource!.reference,
                  route: ctx.resource!.route,
                  resource_key: ctx.resource?.reference.address.type,
                  params: { container: container.name },
                },
              });
              if (opened) deps.closeDrawer();
            },
          });
        }
      });
      ctx.data?.spec?.ephemeralContainers?.forEach((container) => {
        list.push({
          title: container.name,
          action: () => {
            return drawerActionDeps(ctx).createExecSession({
              connectionID: ctx.resource?.route.connection ?? '',
              label: `${ctx.data?.metadata?.name}/${container.name}`,
              icon: 'LuContainer',
              opts: {
                resource_plugin: ctx.resource!.reference.address.provider,
                resource_data: ctx.resource!.record!.record.body,
                reference: ctx.resource!.reference,
                route: ctx.resource!.route,
                resource_key: ctx.resource?.reference.address.type,
                params: { mode: 'attach', container: container.name, pod_uid: ctx.data?.metadata?.uid },
              },
            }).then((session) => { if (session) drawerActionDeps(ctx).closeDrawer(); });
          },
        });
      });

      return list;
    },
  },
  {
    title: 'Logs',
    icon: <LuLogs />,
    enabled: true,
    list: (ctx) => {
      const list: Array<DrawerComponentActionListItem> = [];
      const containers = ctx.data?.spec?.containers ?? [];
      const initContainers = ctx.data?.spec?.initContainers ?? [];
      const ephemeralContainers = ctx.data?.spec?.ephemeralContainers ?? [];
      const allContainers = [...containers, ...initContainers, ...ephemeralContainers];
      const filterParams = { filter_labels: 'container' };

      if (allContainers.length > 1) {
        list.push({
          title: 'All Containers',
          action: () => {
            return drawerActionDeps(ctx).createLogSession({
              connectionID: ctx.resource?.route.connection ?? '',
              resourceKey,
              resourceID: ctx.data?.metadata?.name as string,
              resourceData: ctx.resource!.record!.record.body,
              reference: ctx.resource!.reference,
              route: ctx.resource!.route,
              target: '',
              label: `Pod ${ctx.data?.metadata?.name}`,
              icon: 'LuLogs',
              params: filterParams,
            }).then(() => drawerActionDeps(ctx).closeDrawer());
          },
        });
      }

      containers.forEach((container) => {
        list.push({
          title: container.name,
          action: () => {
            return drawerActionDeps(ctx).createLogSession({
              connectionID: ctx.resource?.route.connection ?? '',
              resourceKey,
              resourceID: ctx.data?.metadata?.name as string,
              resourceData: ctx.resource!.record!.record.body,
              reference: ctx.resource!.reference,
              route: ctx.resource!.route,
              target: container.name,
              label: `Pod ${ctx.data?.metadata?.name}`,
              icon: 'LuLogs',
              params: filterParams,
            }).then(() => drawerActionDeps(ctx).closeDrawer());
          },
        });
      });
      initContainers.forEach((container) => {
        list.push({
          title: `${container.name} (init)`,
          action: () => {
            return drawerActionDeps(ctx).createLogSession({
              connectionID: ctx.resource?.route.connection ?? '',
              resourceKey,
              resourceID: ctx.data?.metadata?.name as string,
              resourceData: ctx.resource!.record!.record.body,
              reference: ctx.resource!.reference,
              route: ctx.resource!.route,
              target: container.name,
              label: `Pod ${ctx.data?.metadata?.name}`,
              icon: 'LuLogs',
              params: filterParams,
            }).then(() => drawerActionDeps(ctx).closeDrawer());
          },
        });
      });
      ephemeralContainers.forEach((container) => {
        list.push({
          title: `${container.name} (ephemeral)`,
          action: () => {
            return drawerActionDeps(ctx).createLogSession({
              connectionID: ctx.resource?.route.connection ?? '',
              resourceKey,
              resourceID: ctx.data?.metadata?.name as string,
              resourceData: ctx.resource!.record!.record.body,
              reference: ctx.resource!.reference,
              route: ctx.resource!.route,
              target: container.name,
              label: `Pod ${ctx.data?.metadata?.name}`,
              icon: 'LuLogs',
              params: filterParams,
            }).then(() => drawerActionDeps(ctx).closeDrawer());
          },
        });
      });

      return list;
    },
  },
  {
    title: 'Debug',
    icon: <LuBugPlay />,
    enabled: (ctx) => runningDebugTargets(ctx.data).length > 0,
    action: (ctx) => {
      const targets = runningDebugTargets(ctx.data);
      if (targets.length !== 1) throw new Error('Choose an available Debug target');
      return drawerActionDeps(ctx).startDebug(debugInput(ctx, targets[0]));
    },
    list: (ctx) => {
      const targets = runningDebugTargets(ctx.data);
      return targets.map(name => ({
        title: name,
        action: () => drawerActionDeps(ctx).startDebug(debugInput(ctx, name)),
      }));
    },
  },
  {
    title: 'Debug options',
    icon: <LuChevronDown />,
    enabled: (ctx) => runningDebugTargets(ctx.data).length > 0,
    list: (ctx) => runningDebugTargets(ctx.data).map(name => ({
      title: name,
      action: () => drawerActionDeps(ctx).openDebugOptions(debugInput(ctx, name)),
    })),
  },
  {
    title: 'Resize',
    icon: <LuScaling />,
    enabled: false,
    action: () => { /* TODO: implement resize */ },
  },
];

