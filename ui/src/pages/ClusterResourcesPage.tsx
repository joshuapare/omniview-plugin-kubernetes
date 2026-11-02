import { Avatar, Button, IconButton, Stack, Text } from '@omniviewdev/base-ui';
import { Link, useSourceStates, openGlobalSearch,
  useConnection,
  useResourceTypes,
  useResourceGroups,
  useSnackbar,
  usePluginRouter,
  parseAppError,
  useEditorSchemas } from '@omniviewdev/runtime';
import type { EditorSchemaAssociation, EditorSchemaDocument } from '@omniviewdev/runtime';
import React from 'react';
import { LuCog, LuLock, LuLockOpen, LuPuzzle, LuRotateCcw, LuSearch } from 'react-icons/lu';
import { Outlet, useParams } from 'react-router';

import { PLUGIN_ID } from '@/pluginId';
import ResourceNavTree from '../components/kubernetes/sidebar/ResourceNavTree';
import ResourceRequestLauncher from '../components/kubernetes/manifest/ResourceRequestLauncher';
import { SidebarSourceStateProvider } from '../components/kubernetes/sidebar/SidebarWatchBadge';
import SimpleTooltip from '../components/shared/SimpleTooltip';
import SyncProgressDialog from '../components/shared/SyncProgressDialog';
import { useClusterPreferences } from '../hooks/useClusterPreferences';
import { useSidebarLayout } from '../hooks/useSidebarLayout';
import { useSidebarOrder, applyOrder } from '../hooks/useSidebarOrder';
import Layout from '../layouts/resource';
import { useKubernetesSearchNavigation } from '../search/provider';
import { getInitials } from '../utils/avatarUtils';
import { stringToColor } from '../utils/color';

import {
  CLUSTER_PAGE_PREFIX,
  clusterPageChildren,
  clusterPageIcon,
  clusterPagePath,
  useClusterPages,
} from './extension';

import { useStoredState } from '@/hooks/useStoredState';


const rootStyle: React.CSSProperties = { padding: 0, gap: 0 };

const sidenavStackStyle: React.CSSProperties = {
  maxHeight: '100%',
  height: '100%',
  overflow: 'hidden',
};

const sidenavHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 8,
  borderRadius: 4,
  border: '1px solid var(--ov-color-border-default)',
};

const clusterAvatarStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  flexShrink: 0,
  backgroundColor: 'transparent',
  objectFit: 'contain',
  border: 0,
};

const initialsAvatarStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  flexShrink: 0,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontSize: 12,
  fontWeight: 500,
};

const mainStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const mainContentStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 };

const clusterNameStyle: React.CSSProperties = { textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' };

function errorMessage(error: unknown): string {
  const parsed = parseAppError(error);
  return parsed.detail || parsed.title;
}

function RouteState({ title, detail, action, onAction }: {
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}): React.ReactElement {
  return (
    <Stack direction="column" spacing={3} style={{ padding: 32 }} role="status">
      <Text weight="semibold">{title}</Text>
      <Text>{detail}</Text>
      {action && onAction && <Button onClick={onAction}>{action}</Button>}
    </Stack>
  );
}

export default function ClusterResourcesPage(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>();
  return <ClusterResourcesSession key={id} id={id} />;
}

// ClusterResourcesRoute owns the connection boundary and readiness recovery.
function ClusterResourcesSession({ id }: { id: string }): React.ReactElement {
  const { resourceTypes: types } = useResourceTypes({ pluginID: PLUGIN_ID, route: { connection: id } });
  const { groups } = useResourceGroups({ pluginID: PLUGIN_ID, route: { connection: id } });
  const { connection } = useConnection({ pluginID: PLUGIN_ID, connectionID: id });
  const { connectionOverrides } = useClusterPreferences(PLUGIN_ID);
  const { layout: rawLayout } = useSidebarLayout({ connectionID: id });
  const { order, setOrder, isEditing, setIsEditing, resetOrder } = useSidebarOrder();
  const clusterPages = useClusterPages();
  const layout = React.useMemo(() => {
    if (clusterPages.length === 0 || rawLayout.length === 0) return applyOrder(rawLayout, order);

    // Pages contributed by other plugins sit directly under Dashboard.
    const pageItems = clusterPages.map((page) => {
      const id = `${CLUSTER_PAGE_PREFIX}${clusterPagePath(page)}`;
      const children = clusterPageChildren(page).map((child) => ({
        id: `${id}/${child.path}`,
        label: child.label,
        icon: child.icon,
      }));
      return {
        id,
        label: page.label,
        icon: clusterPageIcon(page) ?? <LuPuzzle />,
        // The page itself is a destination, not just a group header.
        selectable: true,
        ...(children.length > 0 ? { children } : {}),
      };
    });
    const [first, ...rest] = rawLayout;
    const at = first.items.findIndex((item) => item.id === '__dashboard__') + 1;
    return applyOrder([{ ...first, items: [...first.items.slice(0, at), ...pageItems, ...first.items.slice(at)] }, ...rest], order);
  }, [rawLayout, order, clusterPages]);
  useKubernetesSearchNavigation(id, layout);
  const { location, navigate } = usePluginRouter();
  const [savedExpandedState, setSavedExpandedState] = useStoredState<Record<string, boolean>>(
    `kubernetes-${id}-sidebar-expanded`,
    {},
  );

  const handleExpandedChange = React.useCallback(
    (state: Record<string, boolean>) => {
      setSavedExpandedState(state);
    },
    [setSavedExpandedState],
  );
  const { isFullySynced, summary } = useSourceStates({ pluginID: PLUGIN_ID, route: { connection: id } });
  const sourceStates = React.useMemo(
    () => Object.fromEntries(Object.entries(summary?.types ?? {}).map(([key, status]) => [key, status.state])),
    [summary?.types],
  );

  // Fetch and register OpenAPI schemas with the host's Monaco schema registry
  const { associations, documents } = useEditorSchemas({ pluginID: PLUGIN_ID, route: { connection: id } });
  React.useEffect(() => {
    // The Monaco schema registry is attached to window by the host app at runtime.
    // It exposes register/unregister methods for managing JSON schemas.
    const win = window as Window & {
      __monacoSchemaRegistry?: {
        register: (plugin: string, connId: string, associations: readonly EditorSchemaAssociation[], documents: readonly EditorSchemaDocument[]) => void;
        unregister: (plugin: string, connId: string) => void;
      };
    };
    const registry = win.__monacoSchemaRegistry;
    if (!registry || !id) return;

    registry.register(PLUGIN_ID, id, associations, documents);

    return () => {
      registry.unregister(PLUGIN_ID, id);
    };
  }, [associations, documents, id]);

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { showSnackbar } = useSnackbar();

  // Each connection decides once after its initial summary arrives.
  const [syncModalMode, setSyncModalMode] = React.useState<
    'pending' | 'auto' | 'manual' | 'closed'
  >('pending');
  if (syncModalMode === 'pending' && summary) {
    setSyncModalMode(isFullySynced ? 'closed' : 'auto');
  }
  const syncModalOpen = syncModalMode === 'auto' || syncModalMode === 'manual';

  // Preserve the completion grace period for automatically opened dialogs.
  React.useEffect(() => {
    if (isFullySynced && syncModalMode === 'auto') {
      const timer = setTimeout(() => setSyncModalMode('closed'), 1500);
      return () => clearTimeout(timer);
    }
  }, [isFullySynced, syncModalMode]);

  const handleCloseSyncModal = React.useCallback(() => {
    setSyncModalMode('closed');
  }, []);

  // Listen for footer click to re-open sync modal
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ connectionID?: string }>).detail;
      if (detail?.connectionID === id) {
        setSyncModalMode('manual');
      }
    };
    window.addEventListener('ov:show-sync-modal', handler);
    return () => window.removeEventListener('ov:show-sync-modal', handler);
  }, [id]);

  // Derive selected sidebar item from current route.
  // Dashboard routes end with 'resources', 'metrics', or 'benchmarks'.
  const DASHBOARD_TABS = new Set(['resources', 'metrics', 'benchmarks']);
  const lastSegment = location.pathname.split('/').pop() ?? '';
  const pageMatch = /\/resources\/page\/(.+)$/.exec(location.pathname);
  const selected = pageMatch
    ? `${CLUSTER_PAGE_PREFIX}${pageMatch[1]}`
    : DASHBOARD_TABS.has(lastSegment)
      ? '__dashboard__'
      : lastSegment;

  const handleSelect = React.useCallback(
    (resourceID: string) => {
      if (resourceID === '__dashboard__') {
        navigate(`/cluster/${encodeURIComponent(id)}/resources`);
      } else {
        navigate(`/cluster/${encodeURIComponent(id)}/resources/${resourceID}`);
      }
    },
    [navigate, id],
  );

  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    showSnackbar({
      message: 'You are currently running in development mode',
      details:
        'Rendering performance will be slightly degraded until this application is built for production.',
      status: 'info',
      showOnce: true,
      autoHideDuration: 15000,
    });
  }, [showSnackbar]);

  if (connection.isError || groups.isError || types.isError) {
    const error = connection.error || groups.error || types.error;
    return <RouteState title="Unable to load cluster resources" detail={errorMessage(error)}
      action="Retry resources" onAction={() => {
        if (connection.isError) void connection.refetch();
        if (groups.isError) void groups.refetch();
        if (types.isError) void types.refetch();
      }} />;
  }

  if (groups.isLoading || types.isLoading || connection.isLoading || !groups.data || !types.data || !connection.data) {
    return <RouteState title="Loading cluster resources" detail="Waiting for the resource catalog." />;
  }

  const clusterName = connectionOverrides[id]?.displayName || connection.data?.name || id;

  return (
    <Layout.Root style={rootStyle}>
      <Layout.SideNav type="bordered" padding={0.5}>
        <Stack direction="column" spacing={1} style={sidenavStackStyle}>
          <div style={sidenavHeaderStyle}>
            <Stack direction="row" align="center" spacing={2} style={{ minWidth: 0 }}>
              {(() => {
                const override = connectionOverrides[id];
                const avatarSrc = override?.avatar || connection.data?.avatar;
                if (avatarSrc) {
                  return <Avatar size="sm" shape="rounded" src={avatarSrc} style={clusterAvatarStyle} />;
                }
                const name = override?.displayName || connection.data?.name || '';
                const background = override?.avatarColor || (name ? stringToColor(name) : '#f44336');
                return (
                  <div style={{ ...initialsAvatarStyle, background }} aria-hidden>
                    {getInitials(name)}
                  </div>
                );
              })()}
              <Text weight="semibold" size="sm" style={clusterNameStyle}>
                {connectionOverrides[id]?.displayName || connection.data?.name}
              </Text>
            </Stack>
            <Stack direction="row" align="center" spacing={1}>
              <SimpleTooltip content="Find in this connection" placement="bottom">
                <IconButton
                  variant="soft"
                  size="sm"
                  color="neutral"
                  aria-label="Find in this connection"
                  onClick={() => openGlobalSearch({ scope: {
                    kind: 'connection', pluginId: PLUGIN_ID, connectionId: id, label: clusterName,
                  } })}
                >
                  <LuSearch size={16} />
                </IconButton>
              </SimpleTooltip>
              {isEditing && (
                <SimpleTooltip content="Reset to default order" placement="bottom">
                  <IconButton
                    variant="soft"
                    size="sm"
                    color="neutral"
                    aria-label="Reset to default order"
                    onClick={resetOrder}
                  >
                    <LuRotateCcw size={16} />
                  </IconButton>
                </SimpleTooltip>
              )}
              <SimpleTooltip content={isEditing ? 'Lock sidebar order' : 'Reorder sidebar'} placement="bottom">
                <IconButton
                  variant="soft"
                  size="sm"
                  color={isEditing ? 'brand' : 'neutral'}
                  aria-label={isEditing ? 'Lock sidebar order' : 'Reorder sidebar'}
                  onClick={() => setIsEditing((prev: boolean) => !prev)}
                >
                  {isEditing ? <LuLockOpen size={16} /> : <LuLock size={16} />}
                </IconButton>
              </SimpleTooltip>
              <Link to={`/cluster/${encodeURIComponent(id)}/edit`}>
                <IconButton variant="soft" size="sm" color="neutral" aria-label="Cluster settings">
                  <LuCog size={20} />
                </IconButton>
              </Link>
            </Stack>
          </div>
          <ResourceRequestLauncher connectionID={id} />
          <SidebarSourceStateProvider states={sourceStates}>
            <ResourceNavTree
              sections={layout}
              selected={selected}
              onSelect={handleSelect}
              scrollable
              isEditing={isEditing}
              onReorder={setOrder}
              initialExpandedState={savedExpandedState}
              onExpandedChange={handleExpandedChange}
            />
          </SidebarSourceStateProvider>
        </Stack>
      </Layout.SideNav>
      <Layout.Main style={mainStyle}>
        <div style={mainContentStyle}>
          <Outlet />
        </div>
      </Layout.Main>
      <SyncProgressDialog
        open={syncModalOpen === true}
        onClose={handleCloseSyncModal}
        clusterName={clusterName}
        pluginID={PLUGIN_ID}
        connectionID={id}
      />
    </Layout.Root>
  );
}
