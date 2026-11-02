import React from 'react';
import type { DrawerComponent, HostRecord } from '@omniviewdev/runtime';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { type DrawerActionDeps, registerDrawerActionDeps, registryKey } from '../../../../shared/drawer/actionDeps';
import { TableDrawerContext } from '../../../../shared/table/TableDrawerContext';
import { drawerActions } from '../../corev1/Pod/actions';
import ActionsCell from './ActionsCell';

vi.mock('@omniviewdev/runtime', () => ({
  useConfirmationModal: () => ({ show: vi.fn() }),
  useSnackbar: () => ({ showSnackbar: vi.fn() }),
  parseAppError: (error: unknown) => error,
}));
vi.mock('@omniviewdev/runtime/api', () => ({ ResourceClient: {} }));

it('updates an already-rendered Pod row when native capability and pending registry state change', async () => {
  const user = userEvent.setup();
  const data = {
    metadata: { name: 'api', namespace: 'apps', uid: 'pod-uid' },
    spec: { containers: [{ name: 'main' }], initContainers: [{ name: 'setup' }], ephemeralContainers: [{ name: 'debug' }] },
  };
  const record = {
    key: 'host-key', targetId: 'table-membership', route: { connection: 'cluster' },
    record: {
      reference: {
        address: { provider: 'kubernetes', authority: 'cluster', type: 'k8s:/pods', id: 'api', scope: [{ dimension: 'namespace', value: 'apps' }] },
        incarnation: 'pod-uid',
      },
      representation: { id: 'native-json' },
      body: { kind: 'map', value: {} },
    },
  } as HostRecord;
  const recordsByBody = new WeakMap<object, HostRecord>([[data, record]]);
  const view = render(
    <TableDrawerContext.Provider value={{ drawer: { actions: drawerActions } as DrawerComponent, recordsByBody }}>
      <ActionsCell connectionID="cluster" resourceKey="k8s:/pods" resourceID="api" namespace="apps" data={data} />
    </TableDrawerContext.Provider>,
  );
  await user.click(screen.getByRole('button', { name: 'Row actions' }));
  await user.hover(await screen.findByRole('menuitem', { name: /^Exec\b/ }));
  expect(await screen.findByRole('menuitem', { name: 'main' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: 'main — Open in Native Terminal' })).toBeNull();

  const deps = {
    nativeExecAvailable: true, nativeExecPending: false,
    openNativeSession: vi.fn().mockResolvedValue(false),
    createExecSession: vi.fn(), closeDrawer: vi.fn(),
  } as unknown as DrawerActionDeps;
  let unregister: () => void = () => {};
  let unregisterPending: () => void = () => {};
  try {
    act(() => { unregister = registerDrawerActionDeps(registryKey('cluster', 'k8s:/pods'), deps); });
    const native = await screen.findByRole('menuitem', { name: 'main — Open in Native Terminal' });
    act(() => { unregisterPending = registerDrawerActionDeps(registryKey('cluster', 'k8s:/pods'), { ...deps, nativeExecPending: true }); });
    expect(native.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'main' }).getAttribute('aria-disabled')).not.toBe('true');
    act(() => { unregisterPending(); });
    screen.getByRole('menuitem', { name: 'main — Open in Native Terminal' }).focus();
    await user.keyboard('{Enter}');
    expect(deps.openNativeSession).toHaveBeenCalledTimes(1);
    expect(deps.createExecSession).not.toHaveBeenCalled();
    expect(deps.closeDrawer).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    unregisterPending();
    unregister();
  }
});
