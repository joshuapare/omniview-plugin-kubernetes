import type { DrawerContext, DrawerComponentAction } from '@omniviewdev/runtime';

import { PLUGIN_ID } from '@/pluginId';
import { bindDrawerActionDeps, type DrawerActionDeps } from '../shared/drawer/actionDeps';

import { resourceDrawerActions } from './drawerActions';

export type KubernetesActionTarget = {
  pluginID: string;
  resource: NonNullable<DrawerContext['resource']>;
  data: Record<string, unknown> & {
    metadata?: { name?: string; namespace?: string; uid?: string };
  };
};

const actionID = (key: string, title: string) => `${PLUGIN_ID}:${key}:${encodeURIComponent(title)}`;

/** Resolve only existing actions, against exact object identity and fresh data. */
export function resolveKubernetesActions(target: KubernetesActionTarget, deps?: DrawerActionDeps) {
  const metadata = target.data.metadata;
  const { reference, route } = target.resource;
  const namespace = reference.address.scope.find((entry) => entry.dimension === 'namespace')?.value ?? '';
  if (target.pluginID !== PLUGIN_ID || !route.connection || !reference.address.id
    || !metadata || metadata.name !== reference.address.id || (metadata.namespace ?? '') !== namespace
    || (reference.incarnation !== undefined && metadata.uid !== reference.incarnation)) {
    throw new Error('Kubernetes action target identity no longer matches the resource');
  }
  const ctx: DrawerContext = {
    data: target.data,
    resource: target.resource,
  };
  if (deps) bindDrawerActionDeps(ctx, deps);
  return (resourceDrawerActions[reference.address.type]?.actions ?? []).flatMap((descriptor: DrawerComponentAction) => {
    if (typeof descriptor.title !== 'string'
      || (typeof descriptor.enabled === 'function' ? !descriptor.enabled(ctx) : descriptor.enabled === false)) return [];
    const id = actionID(reference.address.type, descriptor.title);
    const items = typeof descriptor.list === 'function' ? descriptor.list(ctx) : descriptor.list;
    return [{
      id,
      title: descriptor.title,
      icon: descriptor.icon,
      execute: descriptor.action ? () => descriptor.action!(ctx) : undefined,
      // Container names, not row indices, keep choices stable when lists reorder.
      items: items?.flatMap((item) => typeof item.title !== 'string' || item.disabled ? [] : [{
        id: `${id}:${encodeURIComponent(item.title)}`,
        title: item.title,
        icon: item.icon,
        execute: () => item.action(ctx),
      }]),
    }];
  });
}

export function executeKubernetesAction(
  target: KubernetesActionTarget,
  deps: DrawerActionDeps,
  id: string,
  itemID?: string,
) {
  const action = resolveKubernetesActions(target, deps).find((candidate) => candidate.id === id);
  if (!action) throw new Error('Kubernetes action is no longer available');
  if (action.items) {
    if (!itemID && action.items.length === 1 && action.execute) return action.execute();
    const item = action.items.find((candidate) => candidate.id === itemID);
    if (!item) throw new Error('Choose an available Kubernetes action target');
    return item.execute();
  }
  if (itemID || !action.execute) throw new Error('Kubernetes action is not executable');
  return action.execute();
}
