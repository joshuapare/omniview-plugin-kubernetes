import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NavSection } from '../types/navigation';
import { legacyBackupPrefix } from '../utils/legacyMigration';

import { useLegacyColumnMigration } from './useLegacyColumnMigration';
import { applyOrder, extractOrder, useSidebarOrder } from './useSidebarOrder';

const showSnackbar = vi.hoisted(() => vi.fn());
vi.mock('@omniviewdev/runtime', () => ({ useSnackbar: () => ({ showSnackbar }) }));

const key = 'kubernetes-sidebar-order';
const node = encodeURIComponent('k8s:/nodes');
const events = encodeURIComponent('k8s:events.k8s.io/events');
const pod = encodeURIComponent('k8s:/pods');
const deployment = encodeURIComponent('k8s:apps/deployments');
const layout: NavSection[] = [{
  title: '',
  items: [
    { id: node, label: 'Nodes' },
    { id: events, label: 'Events' },
    { id: 'workload', label: 'Workload', children: [
      { id: deployment, label: 'Deployments' },
      { id: pod, label: 'Pods' },
    ] },
  ],
}];

function MigrationGate({ children }: PropsWithChildren) {
  const ready = useLegacyColumnMigration(['prod']);
  return ready ? children : null;
}

describe('saved sidebar order through the migration gate', () => {
  beforeEach(() => {
    localStorage.clear();
    showSnackbar.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('migrates before the real state initializer and preserves the original after reorder and reload', () => {
    const original = JSON.stringify({
      items: ['events_v1_Event', 'core_v1_Node', 'workload'],
      children: { workload: ['core_v1_Pod', 'apps_v1_Deployment'] },
    });
    localStorage.setItem(key, original);
    const view = renderHook(() => useSidebarOrder(), { wrapper: MigrationGate });
    const ordered = applyOrder(layout, view.result.current.order);
    expect(ordered[0].items.map(item => item.id)).toEqual([events, node, 'workload']);
    expect(ordered[0].items[2].children?.map(item => item.id)).toEqual([pod, deployment]);
    expect(localStorage.getItem(legacyBackupPrefix + key)).toBe(original);

    const next = extractOrder(layout);
    act(() => view.result.current.setOrder(next));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(next);
    view.unmount();
    const reloaded = renderHook(() => useSidebarOrder(), { wrapper: MigrationGate });
    expect(reloaded.result.current.order).toEqual(next);
    expect(localStorage.getItem(legacyBackupPrefix + key)).toBe(original);
    expect(showSnackbar).not.toHaveBeenCalled();
  });

  it('reports unknown resource IDs and keeps their original order after the next saved drag', () => {
    const original = '{"items":["example.io_v1_Widget","core_v1_Node"],"children":{}}';
    localStorage.setItem(key, original);
    const log = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    const view = renderHook(() => useSidebarOrder(), { wrapper: MigrationGate });
    const details = `${key}: example.io_v1_Widget`;
    expect(showSnackbar).toHaveBeenCalledWith(expect.objectContaining({ status: 'warning', details }));
    expect(log).toHaveBeenCalledWith('Kubernetes legacy preferences could not be migrated:', details);
    expect(view.result.current.order?.items).toEqual(['example.io_v1_Widget', node]);

    const next = extractOrder(applyOrder(layout, view.result.current.order));
    act(() => view.result.current.setOrder(next));
    view.unmount();
    const reloaded = renderHook(() => useSidebarOrder(), { wrapper: MigrationGate });
    expect(reloaded.result.current.order).toEqual(next);
    expect(localStorage.getItem(legacyBackupPrefix + key)).toBe(original);
    expect(showSnackbar).toHaveBeenCalledOnce();
  });
});
