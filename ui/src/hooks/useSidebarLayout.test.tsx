import type { ResourceGroup, ResourceType } from '@omniviewdev/runtime';
import type * as Runtime from '@omniviewdev/runtime';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { SidebarSourceStateProvider } from '../components/kubernetes/sidebar/SidebarWatchBadge';
import { PLUGIN_ID } from '../pluginId';
import type { NavSection } from '../types/navigation';

import { useSidebarLayout } from './useSidebarLayout';

const catalog = vi.hoisted(() => ({
  groups: [] as ResourceGroup[],
  types: [] as ResourceType[],
  settings: {} as Record<string, unknown>,
}));
vi.mock('@omniviewdev/runtime', async (original) => ({
  ...(await original<typeof Runtime>()),
  usePluginContext: () => ({ settings: catalog.settings }),
  useResourceGroups: () => ({ groups: { data: catalog.groups } }),
  useResourceTypes: () => ({ resourceTypes: { data: catalog.types } }),
  ResourceIcon: () => null,
}));

function group(id: string, resources: string[]): ResourceGroup {
  return { id, name: id, resources } as ResourceGroup;
}

let latest: NavSection[];
function Layout() {
  const layout = useSidebarLayout({ connectionID: 'cluster' }).layout;
  React.useLayoutEffect(() => {
    latest = layout;
  }, [layout]);
  return (
    <>
      {layout
        .flatMap((section) => section.items)
        .map((item) => (
          <div key={item.id}>
            {item.label}
            {item.badge}
          </div>
        ))}
    </>
  );
}

beforeEach(() => {
  catalog.groups = [group('core', ['k8s:/pods']), group('empty', [])];
  catalog.types = [{ type: 'k8s:/pods', displayName: 'Pods' } as ResourceType];
  catalog.settings = {};
});

describe('useSidebarLayout', () => {
  it('keeps structure stable while badges change and shows catalog additions during syncing immediately', () => {
    const child = <Layout />;
    const view = render(
      <SidebarSourceStateProvider states={{ 'k8s:/pods': 'snapshotting' }}>
        {child}
      </SidebarSourceStateProvider>,
    );
    const first = latest;
    expect(screen.getByLabelText('Resources syncing')).toBeTruthy();
    view.rerender(
      <SidebarSourceStateProvider states={{ 'k8s:/pods': 'failed' }}>
        <Layout />
      </SidebarSourceStateProvider>,
    );
    expect(latest).toBe(first);
    expect(screen.getByLabelText('Resource watch error')).toBeTruthy();
    catalog.groups = [...catalog.groups, group('apps', ['k8s:apps/deployments'])];
    catalog.types = [
      ...catalog.types,
      { type: 'k8s:apps/deployments', displayName: 'Deployments' } as ResourceType,
    ];
    view.rerender(
      <SidebarSourceStateProvider states={{ 'k8s:/pods': 'snapshotting' }}>
        <Layout />
      </SidebarSourceStateProvider>,
    );
    expect(latest).not.toBe(first);
    expect(
      latest[0].items.find((item) => item.id === 'workload')?.children?.map((item) => item.label),
    ).toEqual(['Deployments', 'Pods']);
    expect(latest[0].items.some((item) => item.id === encodeURIComponent('k8s:/nodes'))).toBe(
      false,
    );
    expect(latest[0].items.some((item) => item.id === 'config')).toBe(false);
  });

  it('aggregates nested unknown groups and preserves Helm and available primary resources', () => {
    catalog.groups = [
      group('custom', ['example.io/widgets']),
      group('helm', ['helm:releases']),
      group('core', ['k8s:/nodes']),
    ];
    render(
      <SidebarSourceStateProvider states={{ 'example.io/widgets': 'failed' }}>
        <Layout />
      </SidebarSourceStateProvider>,
    );
    expect(screen.getByLabelText('Resource watch error')).toBeTruthy();
    const items = latest[0].items;
    expect(items.find((item) => item.id === 'crd')?.children?.[0].children?.[0].id).toBe(
      encodeURIComponent('example.io/widgets'),
    );
    expect(items.find((item) => item.id === 'helm')?.children?.[0].id).toBe(
      encodeURIComponent('helm:releases'),
    );
    expect(items.some((item) => item.id === encodeURIComponent('k8s:/nodes'))).toBe(true);
  });

  it('preserves full catalogs and omits empty API groups', () => {
    catalog.settings = { [`${PLUGIN_ID}.layout`]: 'full' };
    catalog.groups = [
      group('core', ['k8s:/pods']),
      group('custom', ['example.io/widgets']),
      group('empty', []),
    ];
    render(
      <SidebarSourceStateProvider states={{ 'example.io/widgets': 'failed' }}>
        <Layout />
      </SidebarSourceStateProvider>,
    );
    expect(latest.flatMap((section) => section.items).map((item) => item.id)).toEqual([
      '__dashboard__',
      'core',
      'custom',
    ]);
    expect(screen.getByLabelText('Resource watch error')).toBeTruthy();
  });
});
