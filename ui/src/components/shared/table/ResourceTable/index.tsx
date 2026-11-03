import type { DataTableFeatures } from '@omniviewdev/base-ui';
import { Button, DataTable, Progress, Skeleton, dataTableFeatures } from '@omniviewdev/base-ui';
import { useResources, useResourceType, useResolvedResourceTarget, useRightDrawer, usePluginRouter, DrawerComponent } from '@omniviewdev/runtime';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type SortingState,
  type ColumnVisibilityState as VisibilityState,
  useTable,
  type Row,
  type RowSelectionState,
  type RowData,
} from '@tanstack/react-table';
import React, { useMemo, useState } from 'react';

import { PLUGIN_ID } from '@/pluginId';

const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => `skel-${i}`);

/** Sorting, resizing and pinning UI come from DataTable.Header; the rest is ours. */
const TABLE_FEATURES = { sorting: true, columnResizing: true, columnPinning: true };

/** Body row height in px; ResourceTable.module.css sets the same height on the cells. */
const ROW_HEIGHT = 30;

/** Clicks in these columns act on their own control instead of opening the drawer. */
const NON_DRAWER_COLUMNS = new Set(['select', 'menu']);

import type { KubernetesResourceObject } from '../../../../types/resource';
import { useDynamicResourceColumns } from '../../../tables/ColumnFilter/useDynamicResourceColumns';
import DrawerActionsBridge from '../../drawer/DrawerActionsBridge';
import { TableDrawerContext } from '../TableDrawerContext';
import { ColumnMeta } from '../types';
import { useRowSelectionCleanup } from '../useRowSelectionCleanup';
import { getBodyCellStyles } from '../utils';

import styles from './ResourceTable.module.css';
import ResourceTableErrorState from './ResourceTableErrorState';
import ResourceTableToolbar from './ResourceTableToolbar';

import { useConnectionNamespaces } from '@/hooks/useConnectionNamespaces';
import { useStoredState } from '@/hooks/useStoredState';

import { decodeResourceTableRows } from './rows';

export type ToolbarFilterDef = {
  /** TanStack column ID this filter targets. */
  columnId: string;
  /** Placeholder shown when nothing is selected (e.g. "All Nodes"). */
  placeholder: string;
  /** Extracts the filterable string value from a raw data row for building dropdown options. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accessor: (row: any) => string | undefined;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic component that accepts multiple row data types (Pod, HelmChart, etc.)
export type Props<T extends RowData = any> = {
  connectionID: string;
  resourceKey: string;
  columns: Array<ColumnDef<DataTableFeatures, T> & ColumnMeta>;
  drawer?: DrawerComponent;
  /** Hide the namespace selector (for non-namespaced resources like Helm Charts) */
  hideNamespaceSelector?: boolean;
  /** Optional toolbar actions rendered to the right of the search bar */
  toolbarActions?: React.ReactNode;
  /** Show a "Create" button in the toolbar. Defaults to true. */
  createEnabled?: boolean;
  /**
   * Per-resource filter dropdowns rendered in the toolbar. When provided, these
   * replace the default NamespaceSelect with N dropdowns in the given order
   * (left → right). A filter with columnId "namespace" routes its state through
   * the shared useConnectionNamespaces hook so all tables stay in sync.
   */
  toolbarFilters?: ToolbarFilterDef[];
  /** Wrap table content with consumers that need persisted visibility before mounting. */
  contentWrapper?: React.ComponentType<React.PropsWithChildren<{ columnVisibility: VisibilityState }>>;
};

const visibilityFromColumnDefs = <T extends RowData,>(defs: Array<ColumnDef<DataTableFeatures, T>>): VisibilityState => {
  const visibility: VisibilityState = {};
  defs.forEach((def) => {
    let meta = (def?.meta as { defaultHidden?: boolean }) || undefined;
    if (meta === undefined) {
      meta = {};
    }
    if (def.id && meta?.defaultHidden !== undefined) {
      visibility[def.id] = !meta.defaultHidden;
    }
  });
  return visibility;
};


const ResourceTableContainer = <T extends RowData,>({
  connectionID,
  resourceKey,
  columns,
  drawer,
  hideNamespaceSelector,
  toolbarActions,
  createEnabled = true,
  toolbarFilters,
  contentWrapper: ContentWrapper,
}: Props<T>) => {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [columnVisibility, setColumnVisibility] = useStoredState<VisibilityState>(
    `kubernetes-${connectionID}-${resourceKey}-column-visibility`,
    visibilityFromColumnDefs(columns),
  );
  const [columnFilters, setColumnFilters] = useStoredState<ColumnFiltersState>(
    `kubernetes-${connectionID}-${resourceKey}-column-filters`,
    [],
  );
  const [columnSizing, setColumnSizing] = useStoredState<ColumnSizingState>(
    `kubernetes-${connectionID}-${resourceKey}-column-sizing`,
    {},
  );
  const [collectionSelection, setCollectionSelection] = useState<{
    context: string;
    selection: RowSelectionState;
  }>({ context: '', selection: {} });
  const { location } = usePluginRouter();
  const navigationSearch = new URLSearchParams(location.search).get('search') ?? '';
  const [search, setSearch] = useState<string>(navigationSearch);
  const [searchScope, setSearchScope] = useState(() => ({
    connectionID, resourceKey, key: location.key, pathname: location.pathname, navigationSearch,
  }));
  if (searchScope.connectionID !== connectionID || searchScope.resourceKey !== resourceKey
    || searchScope.key !== location.key || searchScope.pathname !== location.pathname
    || searchScope.navigationSearch !== navigationSearch) {
    setSearchScope({ connectionID, resourceKey, key: location.key, pathname: location.pathname, navigationSearch });
    setSearch(navigationSearch);
  }
  // Shared per-connection namespace selection
  const { namespaces: sharedNamespaces, setNamespaces: setSharedNamespaces } =
    useConnectionNamespaces(connectionID);

  // Per-resource filter values for non-namespace toolbar filters
  const [extraFilterValues, setExtraFilterValues] = useStoredState<Record<string, string[]>>(
    `kubernetes-${connectionID}-${resourceKey}-toolbar-filter-values`,
    {},
  );

  /** Column / label / annotation picker */
  const [filterOpen, setFilterOpen] = React.useState(false);

  const { resourceType } = useResourceType({
    pluginID: PLUGIN_ID,
    route: { connection: connectionID },
    type: resourceKey,
  });
  const target = useResolvedResourceTarget({
    pluginID: PLUGIN_ID,
    route: { connection: connectionID },
    type: resourceKey,
  });
  const collectionContext = JSON.stringify([connectionID, resourceKey, target.data]);
  const { resources, acquired, isSyncing, sourceError } = useResources({
    pluginID: PLUGIN_ID,
    collection: true,
    request: target.data ? {
      targetId: target.data.targetId,
      request: { target: target.data.target, pageSize: 256 },
    } : undefined,
    live: resourceType.data?.capabilities.some((capability) => capability.operation === 'sourceUpdates') ?? false,
  });
  const rowSelection = collectionSelection.context === collectionContext ? collectionSelection.selection : {};
  const setRowSelection = React.useCallback<React.Dispatch<React.SetStateAction<RowSelectionState>>>((update) => {
    setCollectionSelection((state) => {
      const current = state.context === collectionContext ? state.selection : {};
      const selection = typeof update === 'function' ? update(current) : update;
      return selection === current && state.context === collectionContext
        ? state
        : { context: collectionContext, selection };
    });
  }, [collectionContext]);
  const { rows, recordsByBody, rowKeys } = useMemo(
    () => decodeResourceTableRows(acquired?.page.records ?? []),
    [acquired?.page],
  );
  useRowSelectionCleanup(rowKeys, setRowSelection, resources.isSuccess && !resources.isFetching);

  const showSyncingIndicator = isSyncing && rows.length > 0;
  const { labels, setLabels, annotations, setAnnotations, columnDefs } = useDynamicResourceColumns<T>({
    rows,
    resourceKey,
  });

  const handleLabels = (vals: Record<string, boolean>) => {
    setLabels((prev: Record<string, boolean>) => ({ ...prev, ...vals }));
  };

  const handleAnnotations = (vals: Record<string, boolean>) => {
    setAnnotations((prev: Record<string, boolean>) => ({ ...prev, ...vals }));
  };

  const resetColumnVisibility = () => {
    setColumnVisibility(visibilityFromColumnDefs(columns));
    setLabels((prev) => Object.fromEntries(Object.keys(prev).map((key) => [key, false])));
    setAnnotations((prev) => Object.fromEntries(Object.keys(prev).map((key) => [key, false])));
  };

  const allColumns = useMemo(() => [...columns, ...columnDefs], [columns, columnDefs]);

  // Auto-detect whether this resource has a namespace column
  const hasNamespaceColumn = allColumns.some((col) => col.id === 'namespace');

  // Merge shared namespace selection + toolbar extra filters into TanStack column filters
  const effectiveColumnFilters = useMemo<ColumnFiltersState>(() => {
    // Start with per-resource filters, excluding namespace (managed by shared hook)
    let filters = columnFilters.filter((f) => f.id !== 'namespace');

    // Inject shared namespace filter
    if (hasNamespaceColumn && sharedNamespaces.length > 0) {
      filters = [...filters, { id: 'namespace', value: sharedNamespaces }];
    }

    // Inject toolbar extra filter values (skip namespace — already handled above)
    for (const [colId, values] of Object.entries(extraFilterValues)) {
      if (colId === 'namespace' || !values.length) continue;

      // Restrict merging to only those extraFilterValues whose colId is currently defined in the active toolbar filters
      if (toolbarFilters && !toolbarFilters.some((f) => f.columnId === colId)) continue;

      filters = filters.filter((f) => f.id !== colId);
      filters.push({ id: colId, value: values });
    }

    return filters;
  }, [columnFilters, sharedNamespaces, hasNamespaceColumn, extraFilterValues, toolbarFilters]);

  // Intercept onColumnFiltersChange to redirect namespace changes to the shared hook
  const handleColumnFiltersChange = React.useCallback(
    (updaterOrValue: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState)) => {
      setColumnFilters((prev) => {
        const next = typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue;
        // Extract namespace filter changes and route to shared state
        const nsFilter = next.find((f) => f.id === 'namespace');
        if (nsFilter) {
          setSharedNamespaces(nsFilter.value as string[]);
        }
        // Store only non-namespace filters per-resource
        return next.filter((f) => f.id !== 'namespace');
      });
    },
    [setColumnFilters, setSharedNamespaces],
  );

  const table = useTable<DataTableFeatures, T>({
    features: dataTableFeatures,
    enableRowRangeSelection: false,
    manualPagination: true,
    manualExpanding: true,
    data: rows as unknown as T[],
    columns: allColumns,
    columnResizeMode: 'onChange',
    onSortingChange: setSorting,
    onColumnFiltersChange: handleColumnFiltersChange,
    onColumnSizingChange: setColumnSizing,
    onGlobalFilterChange: setSearch,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (row) => recordsByBody.get(row as object)!.key,
    defaultColumn: {
      minSize: 40,
      maxSize: 800,
    },
    state: {
      sorting,
      columnFilters: effectiveColumnFilters,
      columnVisibility,
      columnSizing,
      rowSelection,
      globalFilter: search,
      columnPinning: { start: ['select'], end: ['menu'] },
    },
  });

  const hasResizedColumns = Object.keys(columnSizing).length > 0;

  const { openDrawer } = useRightDrawer();
  const onRowClick = React.useCallback(
    (row: Row<DataTableFeatures, T>, event: React.MouseEvent<HTMLTableRowElement>) => {
      if (drawer === undefined) {
        return;
      }
      // The row's <td>s follow its visible cells, so the clicked cell's index gives its column
      const td = (event.target as Element).closest('td');
      const index = td ? Array.prototype.indexOf.call(event.currentTarget.children, td) : -1;
      const columnId = row.getVisibleCells()[index]?.column.id;
      if (columnId && NON_DRAWER_COLUMNS.has(columnId)) {
        return;
      }
      const record = recordsByBody.get(row.original as object)!;
      openDrawer(drawer, {
        data: row.original,
        resource: {
          reference: record.record.reference,
          route: record.route,
          representation: record.record.representation.id,
          targetId: record.targetId,
          key: record.key,
          record,
          name: (row.original as KubernetesResourceObject)?.metadata?.name ?? record.record.reference.address.id,
          pluginID: PLUGIN_ID,
        },
      });
    },
    [drawer, openDrawer, recordsByBody],
  );

  const placeHolderText = () => {
    const resource = resourceType.data?.displayName ?? resourceKey;

    const count = rows.length;

    return `Search ${count ? `${count} ` : ''}${resource}...`;
  };

  if (target.isError || (resources.isError && !acquired)) {
    return (
      <>
        <ResourceTableErrorState
          error={target.error ?? resources.error}
          resourceKey={resourceKey}
        />
        <Button size="sm" variant="outline" onClick={() => { void (target.isError ? target.refetch() : resources.refetch()); }}>Retry</Button>
      </>
    );
  }

  const content = (
    <TableDrawerContext.Provider value={{ drawer, recordsByBody }}>
      {/* Row menu actions run outside the drawer, so the table mounts their handlers too */}
      {drawer && <DrawerActionsBridge connectionID={connectionID} resourceKey={resourceKey} />}
      <div className={styles.outer}>
        {sourceError && <div role="status">Live updates unavailable. Showing the last acquired resources.</div>}
        {resources.isError && <div role="alert">Could not update resources. <Button size="sm" variant="outline" onClick={() => { void resources.refetch(); }}>Retry</Button></div>}
        <DataTable.Root
          table={table}
          features={TABLE_FEATURES}
          stickyHeader
          hoverable
          className={styles.root}
        >
          {showSyncingIndicator && (
            <Progress size="xs" className={styles.syncIndicator} aria-label="Syncing" />
          )}
          {/* Compact toolbar — outside scroll container so it never scrolls horizontally */}
          <ResourceTableToolbar
            connectionID={connectionID}
            resourceKey={resourceKey}
            search={search}
            setSearch={setSearch}
            placeholderText={placeHolderText()}
            createEnabled={createEnabled}
            toolbarActions={toolbarActions}
            toolbarFilters={toolbarFilters}
            hasNamespaceColumn={hasNamespaceColumn}
            hideNamespaceSelector={hideNamespaceSelector}
            sharedNamespaces={sharedNamespaces}
            setSharedNamespaces={setSharedNamespaces}
            data={rows}
            extraFilterValues={extraFilterValues}
            setExtraFilterValues={setExtraFilterValues}
            hasResizedColumns={hasResizedColumns}
            setColumnSizing={setColumnSizing}
            labels={labels}
            handleLabels={handleLabels}
            annotations={annotations}
            handleAnnotations={handleAnnotations}
            filterOpen={filterOpen}
            setFilterOpen={setFilterOpen}
            allFlatColumns={table.getAllFlatColumns()}
            resetColumnVisibility={resetColumnVisibility}
          />
          <DataTable.Container
            className={styles.container}
            data-syncing={showSyncingIndicator ? 'true' : undefined}
            aria-labelledby={'table-title'}
          >
            <DataTable.Header />
            {target.isLoading || resourceType.isLoading || (resources.isLoading && !acquired) ? (
              <tbody style={{ display: 'grid' }}>
                {SKELETON_ROWS.map((rowKey) => (
                  <tr key={rowKey} className={styles.skeletonRow}>
                    {table.getVisibleLeafColumns().map((col) => (
                      <td key={col.id} className={styles.skeletonCell} style={getBodyCellStyles(col)}>
                        <Skeleton variant="text" width="70%" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : (
              <DataTable.VirtualBody
                className={styles.body}
                estimateRowSize={ROW_HEIGHT}
                fixedRowHeight
                overscan={15}
                onRowClick={onRowClick}
              />
            )}
          </DataTable.Container>
        </DataTable.Root>
      </div>
    </TableDrawerContext.Provider>
  );
  return ContentWrapper ? <ContentWrapper columnVisibility={columnVisibility}>{content}</ContentWrapper> : content;
};

ResourceTableContainer.displayName = 'ResourceTableContainer';
ResourceTableContainer.whyDidYouRender = true;

export default ResourceTableContainer;
