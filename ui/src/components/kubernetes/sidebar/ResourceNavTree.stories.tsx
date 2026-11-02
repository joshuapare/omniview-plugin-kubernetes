import { Button } from '@omniviewdev/base-ui';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LuBox, LuFolder, LuLayoutDashboard } from 'react-icons/lu';

import { applyOrder, type SidebarOrder } from '../../../hooks/useSidebarOrder';
import type { NavSection } from '../../../types/navigation';

import ResourceNavTree from './ResourceNavTree';
import { SidebarWatchBadge, SidebarSourceStateProvider } from './SidebarWatchBadge';

const modern: NavSection[] = [
  {
    title: '',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LuLayoutDashboard /> },
      {
        id: 'workloads',
        label: 'Workloads',
        icon: <LuFolder />,
        defaultExpanded: true,
        children: [
          { id: 'pods', label: 'Pods', icon: <LuBox />, badge: <span>Syncing</span> },
          { id: 'deployments', label: 'Deployments', icon: <LuBox /> },
        ],
      },
      {
        id: 'page',
        label: 'Contributed page',
        selectable: true,
        children: [{ id: 'page/details', label: 'Details' }],
      },
    ],
  },
  {
    title: 'Custom resources',
    items: [
      {
        id: 'example',
        label: 'example.io',
        children: [{ id: 'widgets', label: 'Widgets', icon: <LuBox /> }],
      },
    ],
  },
];
const full: NavSection[] = [
  {
    title: 'API groups',
    items: [
      {
        id: 'apps',
        label: 'apps/v1',
        defaultExpanded: true,
        children: [
          { id: 'deployments', label: 'Deployments', icon: <LuBox /> },
          { id: 'statefulsets', label: 'StatefulSets', icon: <LuBox /> },
        ],
      },
      { id: 'core', label: 'core/v1', children: [{ id: 'pods', label: 'Pods', icon: <LuBox /> }] },
    ],
  },
];

const meta = {
  title: 'Kubernetes/ResourceNavTree',
  component: ResourceNavTree,
  args: { sections: modern, isEditing: false, onReorder: () => {} },
  render: function Interactive(args) {
    const [order, setOrder] = useState<SidebarOrder | null>(null);
    const [selected, setSelected] = useState<string>();
    const [editing, setEditing] = useState(args.isEditing);
    return (
      <div style={{ width: 300, height: 600, display: 'flex', flexDirection: 'column' }}>
        <div>
          <Button size="sm" variant="soft" onClick={() => setEditing((value) => !value)}>
            {editing ? 'Lock order' : 'Edit order'}
          </Button>
          <Button size="sm" variant="soft" onClick={() => setOrder(null)}>
            Reset order
          </Button>
        </div>
        <ResourceNavTree
          {...args}
          sections={applyOrder(args.sections, order)}
          selected={selected}
          onSelect={setSelected}
          isEditing={editing}
          onReorder={setOrder}
          scrollable
        />
      </div>
    );
  },
} satisfies Meta<typeof ResourceNavTree>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Modern: Story = {};
export const FullAPI: Story = { args: { sections: full } };
export const Editing: Story = { args: { isEditing: true } };

const catalogGroups = Array.from({ length: 100 }, (_, group) => {
  const children = Array.from({ length: 100 }, (_, kind) => ({
    id: `kind-${group}-${kind}`,
    label: `Kind ${group}-${kind}`,
    badge: <SidebarWatchBadge resourceKeys={[`kind-${group}-${kind}`]} />,
  }));
  return {
    id: `group-${group}`,
    label: `group-${group}.example.io`,
    defaultExpanded: true,
    children,
    badge: <SidebarWatchBadge resourceKeys={children.map((child) => child.id)} />,
  };
});
const largeCatalog: NavSection[] = [
  { title: '', items: [{ id: 'dashboard', label: 'Dashboard' }] },
  { title: 'API groups', items: catalogGroups },
];

function LiveCatalogStory() {
  const [sections, setSections] = useState(largeCatalog);
  const [order, setOrder] = useState<SidebarOrder | null>(null);
  const [selected, setSelected] = useState<string>();
  const [connection, setConnection] = useState('alpha');
  const [expanded, setExpanded] = useState<Record<string, Record<string, boolean>>>({});
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const states = {
    'kind-0-0': failed ? 'failed' as const : 'snapshotting' as const,
  };
  return (
    <div
      style={{
        width: 420,
        height: 760,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 20,
        border: '1px solid var(--ov-color-border-muted)',
        borderRadius: 8,
        background: 'var(--ov-color-bg-inset)',
        boxSizing: 'border-box',
      }}
    >
      <p style={{ margin: 0 }}>10,100 resource/group rows, with live catalog and status changes.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button size="sm" variant="soft" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Lock order' : 'Edit order'}
        </Button>
        <Button size="sm" variant="soft" onClick={() => setOrder(null)}>
          Reset order
        </Button>
        <Button
          size="sm"
          variant="soft"
          onClick={() => setConnection((value) => (value === 'alpha' ? 'beta' : 'alpha'))}
        >
          Switch connection
        </Button>
        <Button size="sm" variant="soft" onClick={() => setFailed((value) => !value)}>
          Toggle watch error
        </Button>
        <Button
          size="sm"
          variant="soft"
          onClick={() =>
            setSections((previous) =>
              previous[1].items.some((item) => item.id === 'new-group')
                ? previous
                : [
                    previous[0],
                    {
                      ...previous[1],
                      items: [
                        ...previous[1].items,
                        {
                          id: 'new-group',
                          label: 'new.example.io',
                          defaultExpanded: true,
                          children: [{ id: 'new-kind', label: 'New custom resource' }],
                        },
                      ],
                    },
                  ],
            )
          }
        >
          Add custom resource
        </Button>
      </div>
      <output aria-label="Selected destination">Destination: {selected ?? 'none'}</output>
      <output aria-label="Connection">Connection: {connection}</output>
      <SidebarSourceStateProvider states={states}>
        <ResourceNavTree
          key={connection}
          sections={applyOrder(sections, order)}
          selected={selected}
          onSelect={setSelected}
          isEditing={editing}
          onReorder={setOrder}
          initialExpandedState={expanded[connection]}
          onExpandedChange={(state) =>
            setExpanded((previous) => ({ ...previous, [connection]: state }))
          }
          scrollable
        />
      </SidebarSourceStateProvider>
    </div>
  );
}

export const LiveCatalog: Story = { render: () => <LiveCatalogStory /> };
