import React, { useState } from 'react';
import { dataTableFeatures, type DataTableFeatures } from '@omniviewdev/base-ui';
import { type ColumnDef, useTable } from '@tanstack/react-table';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Pod } from 'kubernetes-types/core/v1';

import { useStoredState } from '@/hooks/useStoredState';
import ColumnPicker from './ColumnPicker';
import { useDynamicResourceColumns } from './useDynamicResourceColumns';

const metadataKey = 'app.kubernetes.io/name';
const rows: Pod[] = [
  {
    metadata: {
      name: 'api-gateway',
      namespace: 'production',
      labels: { [metadataKey]: 'gateway', environment: 'production' },
      annotations: { [metadataKey]: 'gateway', 'prometheus.io/scrape': 'true' },
    },
  },
];
const columns: Array<ColumnDef<DataTableFeatures, Pod>> = [
  { id: 'select', enableHiding: false },
  { id: 'name', header: 'Name', accessorKey: 'metadata.name', enableHiding: false },
  { id: 'namespace', header: 'Namespace', accessorKey: 'metadata.namespace' },
  { id: 'cpuUsage', header: 'CPU', accessorFn: () => '12m' },
  { id: 'hostIP', header: 'Host IP', accessorFn: () => '10.0.0.1', meta: { defaultHidden: true } },
  { id: 'menu', enableHiding: false },
];

function Harness() {
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useStoredState<Record<string, boolean>>(
    'picker-field-visibility',
    { hostIP: false },
  );
  const dynamic = useDynamicResourceColumns<Pod>({ rows, resourceKey: 'k8s:/pods' });
  const table = useTable<DataTableFeatures, Pod>({
    features: dataTableFeatures,
    data: rows,
    columns: [...columns, ...dynamic.columnDefs],
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: setVisibility,
  });
  return (
    <>
      <ColumnPicker
        columns={table.getAllFlatColumns()}
        labels={dynamic.labels}
        annotations={dynamic.annotations}
        setLabels={(values) => dynamic.setLabels((previous) => ({ ...previous, ...values }))}
        setAnnotations={(values) =>
          dynamic.setAnnotations((previous) => ({ ...previous, ...values }))
        }
        open={open}
        onOpenChange={setOpen}
        onReset={() => {}}
      />
      <table>
        <thead>
          <tr>
            {table
              .getVisibleLeafColumns()
              .filter((column) => column.id !== 'select' && column.id !== 'menu')
              .map((column) => (
                <th key={column.id}>
                  {typeof column.columnDef.header === 'string'
                    ? column.columnDef.header
                    : column.id}
                </th>
              ))}
          </tr>
        </thead>
      </table>
    </>
  );
}

afterEach(() => localStorage.clear());

describe('column workspace', () => {
  it('keeps identically named labels and annotations distinct, without duplicate dynamic fields, across remounts', async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    await user.click(screen.getByRole('button', { name: /Columns/ }));
    await user.type(screen.getByRole('textbox', { name: 'Search all columns' }), metadataKey);
    const label = await screen.findByRole('checkbox', { name: `${metadataKey} (Labels)` });
    const annotation = screen.getByRole('checkbox', { name: `${metadataKey} (Annotations)` });
    await user.click(label);
    expect(annotation).not.toBeChecked();
    await user.click(annotation);
    expect(screen.getByRole('columnheader', { name: `label-${metadataKey}` })).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: `annotation-${metadataKey}` }),
    ).toBeInTheDocument();
    const selected = screen.getByRole('complementary', { name: 'Selected columns' });
    await user.click(
      within(selected).getByRole('button', { name: `Remove ${metadataKey} (Labels)` }),
    );
    expect(
      screen.queryByRole('columnheader', { name: `label-${metadataKey}` }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: `annotation-${metadataKey}` }),
    ).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Search all columns' }));
    await user.click(screen.getByRole('tab', { name: /^Fields/ }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('kubernetes-k8s:/pods-annotation-cols')!)[metadataKey],
      ).toBe(true),
    );
    view.unmount();
    render(<Harness />);
    expect(
      screen.getByRole('columnheader', { name: `annotation-${metadataKey}` }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: `label-${metadataKey}` }),
    ).not.toBeInTheDocument();
  });

  it('limits bulk changes to matching results and preserves required fields and unrelated selections', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /Columns/ }));
    await user.type(
      screen.getByRole('textbox', { name: 'Search all columns' }),
      'app.kubernetes.io',
    );
    await user.click(screen.getByRole('button', { name: 'Select results' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('columnheader', { name: 'Namespace' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'CPU' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Host IP' })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Search all columns' }));
    await user.click(screen.getByRole('tab', { name: /^Selected/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Name',
    ]);
    expect(screen.getByRole('checkbox', { name: 'Name (Fields), required' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.type(screen.getByRole('textbox', { name: 'Search all columns' }), 'missing-key');
    expect(screen.getByRole('button', { name: 'Select results' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });
});
