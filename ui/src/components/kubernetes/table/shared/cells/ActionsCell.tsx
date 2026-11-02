import { IconButton, Menu } from '@omniviewdev/base-ui';
import {
  type DrawerComponentAction,
  type DrawerContext,
  type HostRecord,
  useConfirmationModal,
  parseAppError,
  useSnackbar,
} from '@omniviewdev/runtime';
import { ResourceClient } from '@omniviewdev/runtime/api';
import { ObjectMeta } from 'kubernetes-types/meta/v1';
import React from 'react';
import { LuEllipsis, LuTrash } from 'react-icons/lu';

import { PLUGIN_ID } from '@/pluginId';

import { drawerActionDepsStore } from '../../../../shared/drawer/actionDeps';
import { useTableDrawer } from '../../../../shared/table/TableDrawerContext';

const triggerButtonStyle = { flex: 'none', minHeight: 28, minWidth: 28 } as const;

/** Menu entry model (replaces the old @omniviewdev/ui ContextMenuItem). */
type ContextMenuItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  color?: 'danger';
  disabled?: boolean;
  dividerAfter?: boolean;
  onClick?: () => void | Promise<unknown>;
  children?: ContextMenuItem[];
};

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

function renderMenuItems(
  items: ContextMenuItem[],
  invoke: (callback: NonNullable<ContextMenuItem['onClick']>) => void,
): React.ReactNode {
  return items.map((item) => (
    <React.Fragment key={item.key}>
      {item.children && item.children.length > 0 ? (
        <Menu.SubmenuRoot>
          <Menu.SubmenuTrigger startDecorator={item.icon} disabled={item.disabled}>
            {item.label}
          </Menu.SubmenuTrigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4}>
              <Menu.Popup onClick={stopPropagation}>{renderMenuItems(item.children, invoke)}</Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.SubmenuRoot>
      ) : (
        <Menu.Item
          startDecorator={item.icon}
          color={item.color}
          disabled={item.disabled}
          onClick={item.onClick ? () => { invoke(item.onClick!); } : undefined}
        >
          {item.label}
        </Menu.Item>
      )}
      {item.dividerAfter && <Menu.Separator />}
    </React.Fragment>
  ));
}

type Props = {
  connectionID: string;
  resourceID: string;
  resourceKey: string;
  data: unknown;
  namespace: string;
};

/**
 * Build a DrawerContext from the table cell props so drawer actions
 * can be invoked with the correct row data.
 */
function buildDrawerContext(props: Props, record: HostRecord): DrawerContext {
  return {
    data: props.data,
    resource: {
      reference: record.record.reference,
      route: record.route,
      representation: record.record.representation.id,
      targetId: record.targetId,
      key: record.key,
      record,
      name: record.record.reference.address.id,
      pluginID: PLUGIN_ID,
    },
  };
}

/**
 * Convert the drawer's DrawerComponentAction array into ContextMenuItems
 * that the DropdownMenu can render (with nested submenus, icons, dividers).
 */
function actionsToMenuItems(
  actions: DrawerComponentAction[],
  ctx: DrawerContext,
  snapshot: unknown,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  // Separate delete from other actions
  const deleteActions: { action: DrawerComponentAction; disabled: boolean }[] = [];
  const otherActions: { action: DrawerComponentAction; disabled: boolean }[] = [];

  for (const action of actions) {
    const isEnabled =
      action.enabled === undefined
        ? true
        : typeof action.enabled === 'function'
          ? action.enabled(ctx)
          : action.enabled;

    const label = typeof action.title === 'string' ? action.title : '';
    const entry = { action, disabled: !isEnabled };
    if (label.toLowerCase() === 'delete') {
      deleteActions.push(entry);
    } else {
      otherActions.push(entry);
    }
  }

  // Add non-delete actions first
  for (let i = 0; i < otherActions.length; i++) {
    const { action, disabled } = otherActions[i];
    const label = typeof action.title === 'string' ? action.title : `action-${i}`;
    const item: ContextMenuItem = {
      key: label,
      label,
      icon: action.icon,
      disabled,
      // Add divider after the last non-delete action (before the delete group)
      dividerAfter: i === otherActions.length - 1 && deleteActions.length > 0,
    };

    if (!disabled && action.list) {
      const listItems = typeof action.list === 'function' ? action.list(ctx, snapshot) : action.list;

      item.children = listItems.map((listItem, j) => ({
        key: `${label}-${j}`,
        label: typeof listItem.title === 'string' ? listItem.title : `${label}-item-${j}`,
        icon: listItem.icon,
        disabled: listItem.disabled,
        onClick: () => listItem.action(ctx),
      }));
    } else if (!disabled && action.action) {
      item.onClick = () => action.action!(ctx);
    }

    items.push(item);
  }

  // Add delete actions at the end with danger color
  for (const { action, disabled } of deleteActions) {
    const label = typeof action.title === 'string' ? action.title : 'Delete';
    items.push({
      key: 'delete',
      label,
      icon: action.icon,
      color: 'danger',
      disabled,
      onClick: !disabled && action.action ? () => action.action!(ctx) : undefined,
    });
  }

  return items;
}

const ActionsCell: React.FC<Props> = ({ connectionID, resourceKey, resourceID, data, namespace }) => {
  const tableContext = useTableDrawer();
  const drawer = tableContext?.drawer;
  const record = tableContext?.recordsByBody.get(data as object);
  const { show } = useConfirmationModal();
  const snackbar = useSnackbar();
  const invoke = (callback: NonNullable<ContextMenuItem['onClick']>) => {
    void (async () => {
      try {
        await callback();
      } catch (cause) {
        const error = parseAppError(cause);
        snackbar.showSnackbar({ message: error.title || 'Action failed', status: 'error', details: error.detail });
      }
    })();
  };

  const propsObj = React.useMemo<Props>(
    () => ({ connectionID, resourceKey, resourceID, data, namespace }),
    [connectionID, resourceKey, resourceID, data, namespace],
  );

  const ctx = React.useMemo(
    () => record ? buildDrawerContext(propsObj, record) : undefined,
    [propsObj, record],
  );
  const subscribeDeps = React.useCallback(
    (onChange: () => void) => ctx ? drawerActionDepsStore.subscribe(ctx, onChange) : () => {},
    [ctx],
  );
  const getDepsSnapshot = React.useCallback(() => ctx ? drawerActionDepsStore.getSnapshot(ctx) : undefined, [ctx]);
  const depsSnapshot = React.useSyncExternalStore(subscribeDeps, getDepsSnapshot, getDepsSnapshot);

  const items = React.useMemo<ContextMenuItem[]>(() => {
    if (!ctx) return [];
    const drawerActions = drawer?.actions;
    if (drawerActions && drawerActions.length > 0) {
      return actionsToMenuItems(drawerActions, ctx, depsSnapshot);
    }

    // Fallback: no drawer actions — provide a built-in Delete
    return [buildFallbackDelete(propsObj, ctx, show)];
  }, [drawer?.actions, ctx, show, propsObj, depsSnapshot]);

  if (items.length === 0) return null;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="Row actions"
            style={triggerButtonStyle}
            onClick={stopPropagation}
          >
            <LuEllipsis />
          </IconButton>
        }
      />
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4}>
          <Menu.Popup onClick={stopPropagation}>{renderMenuItems(items, invoke)}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

/**
 * Build a fallback Delete menu item for tables that don't define their own
 * delete action in the drawer.
 */
function buildFallbackDelete(
  props: Props,
  ctx: DrawerContext,
  show: ReturnType<typeof useConfirmationModal>['show'],
): ContextMenuItem {
  const meta = (props.data as { metadata?: ObjectMeta })?.metadata;
  const resourceName = meta?.name ?? props.resourceID;

  return {
    key: 'delete',
    label: 'Delete',
    icon: <LuTrash size={14} />,
    color: 'danger',
    onClick: () => {
      show({
        title: `Delete ${resourceName}?`,
        body: `Are you sure you want to delete ${resourceName}${props.namespace ? ` from ${props.namespace}` : ''}?`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        onConfirm: async () => {
          await ResourceClient.Mutate(PLUGIN_ID, {
            reference: ctx.resource!.reference,
            route: ctx.resource!.route,
            operation: 'delete',
            input: { kind: 'map', value: {} },
          });
        },
      });
    },
  };
}

ActionsCell.displayName = 'ActionsCell';
export default ActionsCell;
