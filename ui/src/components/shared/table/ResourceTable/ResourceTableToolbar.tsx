import type { DataTableFeatures } from '@omniviewdev/base-ui';
import { IconButton, Stack, Tooltip } from '@omniviewdev/base-ui';
import { type Column, type RowData } from '@tanstack/react-table';
import React from 'react';
import { LuColumns3 } from 'react-icons/lu';

import { CreateResourceButton } from '../../../kubernetes/actions/create';
import ColumnFilter from '../../../tables/ColumnFilter';
import ColumnPicker from '../../../tables/ColumnFilter/ColumnPicker';
import { DebouncedInput } from '../../../tables/DebouncedInput';
import NamespaceSelect from '../../../tables/NamespaceSelect';
import ResourceFilterSelect from '../../../tables/ResourceFilterSelect';

import styles from './ResourceTable.module.css';

import type { ToolbarFilterDef } from './index';

type ResourceTableToolbarProps<T extends RowData> = {
  connectionID: string;
  resourceKey: string;
  search: string;
  setSearch: (value: string) => void;
  placeholderText: string;
  createEnabled: boolean;
  toolbarActions?: React.ReactNode;
  toolbarFilters?: ToolbarFilterDef[];
  hasNamespaceColumn: boolean;
  hideNamespaceSelector?: boolean;
  sharedNamespaces: string[];
  setSharedNamespaces: (namespaces: string[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  extraFilterValues: Record<string, string[]>;
  setExtraFilterValues: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  hasResizedColumns: boolean;
  setColumnSizing: (value: Record<string, number>) => void;
  labels: Record<string, boolean>;
  handleLabels: (vals: Record<string, boolean>) => void;
  annotations: Record<string, boolean>;
  handleAnnotations: (vals: Record<string, boolean>) => void;
  filterOpen: boolean;
  setFilterOpen: (open: boolean) => void;
  allFlatColumns: Column<DataTableFeatures, T, unknown>[];
  resetColumnVisibility: () => void;
};

const ResourceTableToolbar = <T extends RowData,>({
  connectionID,
  resourceKey,
  search,
  setSearch,
  placeholderText,
  createEnabled,
  toolbarActions,
  toolbarFilters,
  hasNamespaceColumn,
  hideNamespaceSelector,
  sharedNamespaces,
  setSharedNamespaces,
  data,
  extraFilterValues,
  setExtraFilterValues,
  hasResizedColumns,
  setColumnSizing,
  labels,
  handleLabels,
  annotations,
  handleAnnotations,
  filterOpen,
  setFilterOpen,
  allFlatColumns,
  resetColumnVisibility,
}: ResourceTableToolbarProps<T>) => (
  <div className={styles.toolbar}>
    <DebouncedInput
      value={search ?? ''}
      onChange={(value: string) => {
        setSearch(String(value));
      }}
      placeholder={placeholderText}
    />
    <div className={styles.toolbarSpacer} />
    <Stack direction="row" spacing={2} align="center">
      {createEnabled && (
        <CreateResourceButton connectionID={connectionID} resourceKey={resourceKey} selectedNamespaces={sharedNamespaces} />
      )}
      {toolbarActions}
      {toolbarFilters && toolbarFilters.length > 0
        ? toolbarFilters.map((filter) =>
            filter.columnId === 'namespace' ? (
              <NamespaceSelect
                key={filter.columnId}
                connectionID={connectionID}
                selected={sharedNamespaces}
                setNamespaces={setSharedNamespaces}
              />
            ) : (
              <ResourceFilterSelect
                key={filter.columnId}
                data={data}
                accessor={filter.accessor}
                value={extraFilterValues[filter.columnId] ?? []}
                onChange={(values: string[]) =>
                  setExtraFilterValues((prev: Record<string, string[]>) => ({ ...prev, [filter.columnId]: values }))
                }
                placeholder={filter.placeholder}
              />
            ),
          )
        : hasNamespaceColumn &&
          !hideNamespaceSelector && (
            <NamespaceSelect
              connectionID={connectionID}
              selected={sharedNamespaces}
              setNamespaces={setSharedNamespaces}
            />
          )}
      {hasResizedColumns && (
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <IconButton
                variant="outline"
                color="neutral"
                size="sm"
                aria-label="Reset column widths"
                onClick={() => setColumnSizing({})}
              >
                <LuColumns3 size={14} />
              </IconButton>
            }
          />
          <Tooltip.Portal>
            <Tooltip.Positioner side="bottom" sideOffset={6}>
              <Tooltip.Popup>Reset column widths</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      )}
      {resourceKey === 'k8s:/pods' ? (
        <ColumnPicker
          labels={labels}
          setLabels={handleLabels}
          annotations={annotations}
          setAnnotations={handleAnnotations}
          open={filterOpen}
          onOpenChange={setFilterOpen}
          columns={allFlatColumns}
          onReset={resetColumnVisibility}
        />
      ) : (
        <ColumnFilter
          labels={labels}
          setLabels={handleLabels}
          annotations={annotations}
          setAnnotations={handleAnnotations}
          open={filterOpen}
          onOpenChange={setFilterOpen}
          columns={allFlatColumns}
        />
      )}
    </Stack>
  </div>
);

export default ResourceTableToolbar;
