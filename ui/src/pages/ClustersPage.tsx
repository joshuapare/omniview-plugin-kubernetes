import { Skeleton, Stack, Tabs } from '@omniviewdev/base-ui';
import { usePluginContext, useConnections, useConnection, useSnackbar } from '@omniviewdev/runtime';
import React from 'react';

import ClusterHub from '../components/connections/ClusterHub';
import ClustersToolbar from '../components/connections/ClustersToolbar';
import ConnectionTable from '../components/connections/ConnectionTable';
import DeleteConfirmationModal from '../components/connections/DeleteConfirmationModal';
import EmptyState from '../components/connections/EmptyState';
import FilterChips from '../components/connections/FilterChips';
import FolderDialog, { type FolderDialogValues } from '../components/connections/FolderDialog';
import { useClusterPreferences } from '../hooks/useClusterPreferences';
import { useConnectionGrouping } from '../hooks/useConnectionGrouping';
import { useLegacyColumnMigration } from '../hooks/useLegacyColumnMigration';
import type {
  ConnectionGroup,
  GroupByMode,
  SortByField,
  SortDirection,
  ViewMode,
  FilterState,
} from '../types/clusters';

import { useStoredState } from '@/hooks/useStoredState';

const DEFAULT_VISIBLE_COLUMNS = ['cluster', 'kubeconfig', 'user'];

const outerContainerStyle: React.CSSProperties = {
  width: '100%',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
};

const tabsListStyle: React.CSSProperties = { paddingInline: 8, paddingTop: 4 };

const fullSizeStyle: React.CSSProperties = { width: '100%', height: '100%' };

const panelBaseStyle: React.CSSProperties = {
  paddingInline: 8,
  paddingBlock: 4,
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
};

const loadingSkeletonStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 8,
};

export default function ClustersPage(): React.ReactElement {
  const { meta } = usePluginContext();
  const { connections } = useConnections({ plugin: meta.id });
  useLegacyColumnMigration(connections.data?.map(connection => connection.id));
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { showSnackbar } = useSnackbar();

  // Tab state
  const [activeTab, setActiveTab] = useStoredState<'hub' | 'all'>('kubernetes-clusters-tab', 'hub');

  // Persistent UI state (localStorage) - for All Clusters tab
  const [viewMode, setViewMode] = useStoredState<ViewMode>('kubernetes-clusters-view', 'list');
  const [groupBy, setGroupBy] = useStoredState<GroupByMode>('kubernetes-clusters-groupby', 'none');
  const [sortBy, setSortBy] = useStoredState<SortByField>('kubernetes-clusters-sortby', 'name');
  const [sortDirection, setSortDirection] = useStoredState<SortDirection>(
    'kubernetes-clusters-sortdir',
    'asc',
  );
  const [visibleColumns, setVisibleColumns] = useStoredState<string[]>(
    'kubernetes-clusters-columns',
    DEFAULT_VISIBLE_COLUMNS,
  );

  // Ephemeral UI state
  const [search, setSearch] = React.useState('');
  const [filters, setFilters] = React.useState<FilterState>({});
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [folderDialog, setFolderDialog] = React.useState<{
    mode: 'create' | 'edit';
    groupId?: string;
    initial?: Partial<FolderDialogValues>;
    pendingConnectionId?: string;
  } | null>(null);

  // Plugin data store preferences
  const preferences = useClusterPreferences(meta.id);

  // Grouped/filtered/sorted result
  const grouped = useConnectionGrouping({
    connections: connections.data ?? [],
    favorites: preferences.favorites,
    connectionOverrides: preferences.connectionOverrides,
    customGroups: preferences.customGroups,
    recentConnections: preferences.recentConnections,
    search,
    groupBy,
    sortBy,
    sortDirection,
    filters,
  });

  // Compute enriched connections for Hub (unfiltered, unsorted)
  const hubGrouped = useConnectionGrouping({
    connections: connections.data ?? [],
    favorites: preferences.favorites,
    connectionOverrides: preferences.connectionOverrides,
    customGroups: preferences.customGroups,
    recentConnections: preferences.recentConnections,
    search: '',
    groupBy: 'none',
    sortBy: 'name',
    sortDirection: 'asc',
    filters: {},
  });

  const hubEnriched = React.useMemo(
    () => hubGrouped.groups.flatMap((g) => g.connections),
    [hubGrouped],
  );

  // All label keys across connections
  const allLabelKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const conn of connections.data ?? []) {
      if (conn.labels) {
        for (const key of Object.keys(conn.labels)) {
          keys.add(key);
        }
      }
    }
    return [...keys].sort();
  }, [connections.data]);

  const handleToggleColumn = React.useCallback(
    (column: string) => {
      setVisibleColumns((prev) => {
        if (prev.includes(column)) {
          return prev.filter((c) => c !== column);
        }
        return [...prev, column];
      });
    },
    [setVisibleColumns],
  );

  const handleToggleCollapse = React.useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const handleToggleProvider = React.useCallback((provider: string) => {
    setFilters((prev) => {
      const current = prev.providers ?? [];
      const next = current.includes(provider)
        ? current.filter((p) => p !== provider)
        : [...current, provider];
      return { ...prev, providers: next.length > 0 ? next : undefined };
    });
  }, []);

  const handleToggleStatus = React.useCallback((status: 'connected' | 'disconnected') => {
    setFilters((prev) => {
      const current = prev.status ?? [];
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      return { ...prev, status: next.length > 0 ? next : undefined };
    });
  }, []);

  const handleToggleTag = React.useCallback((tag: string) => {
    setFilters((prev) => {
      const current = prev.tags ?? [];
      const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
      return { ...prev, tags: next.length > 0 ? next : undefined };
    });
  }, []);

  const handleToggleLabelFilter = React.useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const currentLabels = prev.labels ?? {};
      const currentValues = currentLabels[key] ?? [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];
      const nextLabels = { ...currentLabels };
      if (nextValues.length > 0) {
        nextLabels[key] = nextValues;
      } else {
        delete nextLabels[key];
      }
      return { ...prev, labels: Object.keys(nextLabels).length > 0 ? nextLabels : undefined };
    });
  }, []);

  const handleClearFilters = React.useCallback(() => {
    setFilters({});
    setSearch('');
  }, []);

  const handleCreateFolder = React.useCallback((connectionId?: string) => {
    setFolderDialog({ mode: 'create', pendingConnectionId: connectionId });
  }, []);

  const handleEditFolder = React.useCallback(
    (groupId: string) => {
      const group = preferences.customGroups.find((g) => g.id === groupId);
      if (!group) return;
      setFolderDialog({
        mode: 'edit',
        groupId,
        initial: { name: group.name, color: group.color, icon: group.icon, customImage: group.customImage, ruleSet: group.ruleSet },
      });
    },
    [preferences.customGroups],
  );

  const handleFolderSubmit = React.useCallback(
    async (values: FolderDialogValues) => {
      if (folderDialog?.mode === 'edit' && folderDialog.groupId) {
        await preferences.updateGroup(folderDialog.groupId, { ...values, ruleSet: values.ruleSet });
        showSnackbar({ status: 'success', message: `Folder '${values.name}' updated` });
      } else {
        const newGroup: ConnectionGroup = {
          id: crypto.randomUUID(),
          name: values.name,
          color: values.color,
          icon: values.icon,
          customImage: values.customImage,
          connectionIds: folderDialog?.pendingConnectionId
            ? [folderDialog.pendingConnectionId]
            : [],
          ruleSet: values.ruleSet,
        };
        await preferences.addGroup(newGroup);
        showSnackbar({ status: 'success', message: `Folder '${values.name}' created` });
      }
      setFolderDialog(null);
    },
    [folderDialog, preferences, showSnackbar],
  );

  const handleFolderDelete = React.useCallback(async () => {
    if (folderDialog?.groupId) {
      await preferences.removeGroup(folderDialog.groupId);
      showSnackbar({ status: 'success', message: 'Folder deleted' });
    }
    setFolderDialog(null);
  }, [folderDialog, preferences, showSnackbar]);

  const handleDeleteRequest = React.useCallback((id: string, name: string) => {
    setDeleteTarget({ id, name });
  }, []);

  const isInitialLoading = connections.isLoading && !connections.data;
  const noConnections = !isInitialLoading && (connections.data?.length ?? 0) === 0;
  const noResults = !noConnections && grouped.filteredCount === 0;

  return (
    <Stack direction="column" spacing={0} style={fullSizeStyle}>
      <Tabs.Root
        variant="flat"
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'hub' | 'all')}
        size="sm"
        style={outerContainerStyle}
      >
        <Tabs.List aria-label="Cluster views" style={tabsListStyle}>
          <Tabs.Tab value="hub">Hub</Tabs.Tab>
          <Tabs.Tab value="all">All Clusters</Tabs.Tab>
          <Tabs.Indicator />
        </Tabs.List>

        <div
          role="tabpanel"
          hidden={activeTab !== 'hub'}
          style={{ ...panelBaseStyle, display: activeTab === 'hub' ? 'block' : 'none' }}
        >
          {isInitialLoading ? (
            <ConnectionsLoadingSkeleton />
          ) : noConnections ? (
            <EmptyState variant="no-connections" />
          ) : (
            <ClusterHub
              enrichedConnections={hubEnriched}
              availableAttributes={hubGrouped.availableAttributes}
              customGroups={preferences.customGroups}
              hubSections={preferences.hubSections}
              onReorderSections={(sections) => { void preferences.setHubSections(sections); }}
              onToggleCollapse={(sectionType, collapsed) => { void preferences.updateHubSectionCollapsed(sectionType, collapsed); }}
              onRecordAccess={(connectionId) => { void preferences.recordAccess(connectionId); }}
              onToggleFavorite={(connectionId) => { void preferences.toggleFavorite(connectionId); }}
              onAssignToGroup={(groupId, connectionId) => { void preferences.assignToGroup(groupId, connectionId); }}
              onRemoveFromGroup={(groupId, connectionId) => { void preferences.removeFromGroup(groupId, connectionId); }}
              onCreateFolder={handleCreateFolder}
              onEditFolder={handleEditFolder}
            />
          )}
        </div>

        <div
          role="tabpanel"
          hidden={activeTab !== 'all'}
          style={{
            ...panelBaseStyle,
            display: activeTab === 'all' ? 'flex' : 'none',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <ClustersToolbar
            search={search}
            onSearchChange={setSearch}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            totalCount={grouped.totalCount}
            filteredCount={grouped.filteredCount}
            hasCustomGroups={preferences.customGroups.length > 0}
            availableAttributes={grouped.availableAttributes}
            availableTags={grouped.availableTags}
          />

          <FilterChips
            filters={filters}
            availableProviders={grouped.availableProviders}
            availableAttributes={grouped.availableAttributes}
            availableTags={grouped.availableTags}
            onToggleProvider={handleToggleProvider}
            onToggleStatus={handleToggleStatus}
            onToggleTag={handleToggleTag}
            onToggleLabelFilter={handleToggleLabelFilter}
            onClearAll={handleClearFilters}
          />

          {isInitialLoading && <ConnectionsLoadingSkeleton />}
          {!isInitialLoading && noConnections && <EmptyState variant="no-connections" />}
          {!isInitialLoading && noResults && (
            <EmptyState variant="no-results" onClearFilters={handleClearFilters} />
          )}

          {!isInitialLoading && !noConnections && !noResults && (
            <ConnectionTable
              grouped={grouped}
              groupBy={groupBy}
              viewMode={viewMode}
              customGroups={preferences.customGroups}
              collapsedGroups={collapsedGroups}
              visibleColumns={visibleColumns}
              allLabelKeys={allLabelKeys}
              onToggleColumn={handleToggleColumn}
              onToggleCollapse={handleToggleCollapse}
              onToggleFavorite={(connectionId) => { void preferences.toggleFavorite(connectionId); }}
              onAssignToGroup={(groupId, connectionId) => { void preferences.assignToGroup(groupId, connectionId); }}
              onRemoveFromGroup={(groupId, connectionId) => { void preferences.removeFromGroup(groupId, connectionId); }}
              onCreateFolder={handleCreateFolder}
              onDeleteRequest={handleDeleteRequest}
              onRecordAccess={(connectionId) => { void preferences.recordAccess(connectionId); }}
            />
          )}
        </div>
      </Tabs.Root>

      {deleteTarget && (
        <DeleteConnectionHandler
          pluginID={meta.id}
          connectionId={deleteTarget.id}
          connectionName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {folderDialog && (
        <FolderDialog
          open
          mode={folderDialog.mode}
          initial={folderDialog.initial}
          existingNames={preferences.customGroups.map((g) => g.name)}
          enrichedConnections={hubEnriched}
          onSubmit={(values) => { void handleFolderSubmit(values); }}
          onDelete={folderDialog.mode === 'edit' ? () => { void handleFolderDelete(); } : undefined}
          onClose={() => setFolderDialog(null)}
        />
      )}
    </Stack>
  );
}

function ConnectionsLoadingSkeleton() {
  return (
    <div style={loadingSkeletonStyle}>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={48} />
      ))}
    </div>
  );
}

/**
 * Separate component to handle delete confirmation + mutation,
 * since useConnection requires the connectionID at hook level.
 */
function DeleteConnectionHandler({
  pluginID,
  connectionId,
  connectionName,
  onClose,
}: {
  pluginID: string;
  connectionId: string;
  connectionName: string;
  onClose: () => void;
}) {
  const { removeConnection } = useConnection({ pluginID, connectionID: connectionId });

  const handleConfirm = () => {
    removeConnection()
      .then(() => onClose())
      .catch(() => onClose());
  };

  return (
    <DeleteConfirmationModal
      open
      connectionName={connectionName}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
