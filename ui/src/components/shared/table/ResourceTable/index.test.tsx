import React, { type PropsWithChildren } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BaseUI from '@omniviewdev/base-ui';
import type { ColumnDef } from '@tanstack/react-table';
import ResourceTable from './index';
import { usePodMetricsBatch } from '@/hooks/usePodMetricsBatch';

const mocks = vi.hoisted(() => {
  const first = { key: 'host-first', record: { body: { name: 'First row' } } };
  const second = { key: 'host-second', record: { body: { name: 'Second row' } } };
  return {
    resources: vi.fn(),
    query: vi.fn(async () => ({})),
    loading: false,
    sourceError: false,
    firstData: { records: [first, second] },
    targetId: 'host-target',
  };
});
vi.mock('@omniviewdev/base-ui', async (importOriginal) => ({
  ...await importOriginal<typeof BaseUI>(),
  Button: ({ children, disabled, onClick }: React.PropsWithChildren<{ disabled?: boolean; onClick?: () => void }>) => <button disabled={disabled} onClick={onClick}>{children}</button>,
  Stack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  Progress: () => null,
  Skeleton: () => null,
  DataTable: {
    Root: ({ children, table }: React.PropsWithChildren<{ table: { getRowModel: () => { rows: Array<{ id: string; getIsSelected: () => boolean; toggleSelected: () => void }> } } }>) => <div>{table.getRowModel().rows.map((row) => <button key={row.id} aria-pressed={row.getIsSelected()} onClick={() => row.toggleSelected()}>{row.id}</button>)}{children}</div>,
    Container: ({ children }: React.PropsWithChildren) => <table>{children}</table>,
    Header: () => null,
    VirtualBody: () => <tbody />,
  },
}));
vi.mock('@omniviewdev/runtime/api', () => ({ MetricClient: { QueryAll: mocks.query } }));
vi.mock('@omniviewdev/runtime', () => ({
  useResourceType: () => ({ resourceType: { data: { displayName: 'Charts', capabilities: [] } } }),
  useResolvedResourceTarget: () => ({ data: { targetId: mocks.targetId, target: { type: 'helm:charts' } } }),
  useResources: mocks.resources,
  usePluginRouter: () => ({ location: { search: '', key: 'location', pathname: '/' } }),
  useRightDrawer: () => ({ openDrawer: vi.fn() }),
}));
vi.mock('../../../tables/ColumnFilter/useDynamicResourceColumns', () => ({ useDynamicResourceColumns: () => ({ labels: {}, annotations: {}, columnDefs: [], setLabels: vi.fn(), setAnnotations: vi.fn() }) }));
vi.mock('@/hooks/useConnectionNamespaces', () => ({ useConnectionNamespaces: () => ({ namespaces: [], setNamespaces: vi.fn() }) }));
vi.mock('../../drawer/DrawerActionsBridge', () => ({ default: () => null }));
vi.mock('./ResourceTableToolbar', () => ({ default: ({ allFlatColumns }: { allFlatColumns: Array<{ id: string; toggleVisibility: (visible: boolean) => void }> }) => (
  <button onClick={() => allFlatColumns.find((column) => column.id === 'cpuUsage')?.toggleVisibility(true)}>Show CPU</button>
) }));
vi.mock('./ResourceTableErrorState', () => ({ default: () => <div>Collection failed</div> }));
vi.mock('./rows', () => ({ decodeResourceTableRows: (records: Array<{ key: string; record: { body: { name: string } } }>) => ({
  rows: records.map(({ record }) => record.body),
  recordsByBody: new WeakMap(records.map((record) => [record.record.body, record])),
  rowKeys: records.map(({ key }) => key),
}) }));

const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
const columns: Array<ColumnDef<BaseUI.DataTableFeatures, { name: string }>> = [
  { id: 'name', accessorKey: 'name', header: 'Name' },
  { id: 'cpuUsage', accessorKey: 'name', header: 'CPU' },
  { id: 'memUsage', accessorKey: 'name', header: 'Memory' },
];
function MetricsConsumer({ columnVisibility, children }: PropsWithChildren<{ columnVisibility: Record<string, boolean> }>) {
  usePodMetricsBatch({ connectionID: 'test', enabled: columnVisibility.cpuUsage !== false || columnVisibility.memUsage !== false });
  return <>{children}</>;
}

beforeEach(() => {
  mocks.loading = false;
  mocks.sourceError = false;
  mocks.targetId = 'host-target';
  mocks.resources.mockReset();
  mocks.resources.mockImplementation(({ request }) => {
    const data = mocks.loading ? undefined : mocks.firstData;
    return { sourceError: mocks.sourceError, acquired: data ? { request, page: data } : undefined, resources: {
      data,
      isLoading: mocks.loading, isFetching: mocks.loading, isSuccess: !mocks.loading, refetch: vi.fn(),
    } };
  });
});
afterEach(() => { client.clear(); localStorage.clear(); mocks.query.mockClear(); });

describe('resource collection selections', () => {
  it('shows retained resources when source updates fail', () => {
    mocks.sourceError = true;
    render(<ResourceTable connectionID="connection" resourceKey="helm:charts" columns={columns} />);
    expect(screen.getByText('Live updates unavailable. Showing the last acquired resources.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'host-first' })).toBeTruthy();
  });

  it('selects host keys across the collection without source-page controls', () => {
    render(<ResourceTable connectionID="connection" resourceKey="helm:charts" columns={columns} />);
    fireEvent.click(screen.getByRole('button', { name: 'host-first' }));
    fireEvent.click(screen.getByRole('button', { name: 'host-second' }));
    expect(screen.getByRole('button', { name: 'host-first' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'host-second' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull();
    expect(mocks.resources).toHaveBeenLastCalledWith(expect.objectContaining({
      pluginID: 'kubernetes',
      request: expect.objectContaining({ targetId: 'host-target' }),
      live: false, collection: true,
    }));
  });

  it('resets collection selection when resolved target context changes', () => {
    const view = render(<ResourceTable connectionID="connection" resourceKey="helm:charts" columns={columns} />);
    fireEvent.click(screen.getByRole('button', { name: 'host-first' }));
    view.rerender(<ResourceTable connectionID="connection" resourceKey="helm:charts" columns={columns} />);
    expect(screen.getByRole('button', { name: 'host-first' }).getAttribute('aria-pressed')).toBe('true');
    mocks.targetId = 'other-target';
    view.rerender(<ResourceTable connectionID="other-connection" resourceKey="helm:charts" columns={columns} />);
    expect(screen.getByRole('button', { name: 'host-first' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'host-second' }).getAttribute('aria-pressed')).toBe('false');
  });
});

it('reads persisted hidden metric columns before mounting the query consumer', async () => {
  localStorage.setItem('kubernetes-test-k8s:/pods-column-visibility', JSON.stringify({ cpuUsage: false, memUsage: false }));
  render(<QueryClientProvider client={client}>
    <ResourceTable columns={columns} connectionID="test" resourceKey="k8s:/pods" contentWrapper={MetricsConsumer} />
  </QueryClientProvider>);
  expect(mocks.query).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Show CPU' }));
  await waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(1));
  expect(JSON.parse(localStorage.getItem('kubernetes-test-k8s:/pods-column-visibility')!)).toMatchObject({ cpuUsage: true, memUsage: false });
});
