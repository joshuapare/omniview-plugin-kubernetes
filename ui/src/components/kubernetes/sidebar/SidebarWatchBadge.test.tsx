import { render, screen } from '@testing-library/react';
import React from 'react';

import { SidebarWatchBadge, SidebarSourceStateProvider } from './SidebarWatchBadge';

describe('SidebarWatchBadge', () => {
  it('tracks syncing, failures, terminal and removed states with error precedence', () => {
    const keys = ['k8s:/pods', 'k8s:apps/deployments'];
    const badge = <SidebarWatchBadge resourceKeys={keys} />;
    const view = render(<SidebarSourceStateProvider>{badge}</SidebarSourceStateProvider>);
    expect(screen.queryByRole('status')).toBeNull();
    for (const state of ['opening', 'snapshotting', 'resetRequired'] as const) {
      view.rerender(
        <SidebarSourceStateProvider states={{ [keys[0]]: state }}>
          {badge}
        </SidebarSourceStateProvider>,
      );
      expect(screen.getByLabelText('Resources syncing')).toBeTruthy();
    }
    view.rerender(
      <SidebarSourceStateProvider states={{ [keys[0]]: 'snapshotting', [keys[1]]: 'failed' }}>
        {badge}
      </SidebarSourceStateProvider>,
    );
    expect(screen.getByLabelText('Resource watch error')).toBeTruthy();
    expect(screen.queryByLabelText('Resources syncing')).toBeNull();
    for (const state of ['following', 'finished', 'closed'] as const) {
      view.rerender(
        <SidebarSourceStateProvider states={{ [keys[0]]: state }}>{badge}</SidebarSourceStateProvider>,
      );
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByLabelText('Resource watch error')).toBeNull();
    }
    view.rerender(<SidebarSourceStateProvider>{badge}</SidebarSourceStateProvider>);
    expect(screen.queryByLabelText('Resource watch error')).toBeNull();
  });

  it('does not render a badge for unrelated resource changes', () => {
    const renders = vi.fn();
    const child = (
      <React.Profiler id="badge" onRender={renders}>
        <SidebarWatchBadge resourceKeys={['pods']} />
      </React.Profiler>
    );
    const view = render(
      <SidebarSourceStateProvider states={{ pods: 'opening' }}>
        {child}
      </SidebarSourceStateProvider>,
    );
    renders.mockClear();
    view.rerender(
      <SidebarSourceStateProvider
        states={{ pods: 'snapshotting', nodes: 'failed' }}
      >
        {child}
      </SidebarSourceStateProvider>,
    );
    expect(renders).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Resources syncing')).toBeTruthy();
  });

  it('updates a shared group once when multiple member statuses change', () => {
    const renders = vi.fn();
    const child = (
      <React.Profiler id="group" onRender={renders}>
        <SidebarWatchBadge resourceKeys={['pods', 'nodes', 'pods']} />
      </React.Profiler>
    );
    const view = render(<SidebarSourceStateProvider>{child}</SidebarSourceStateProvider>);
    renders.mockClear();
    view.rerender(
      <SidebarSourceStateProvider
        states={{ pods: 'opening', nodes: 'failed' }}
      >
        {child}
      </SidebarSourceStateProvider>,
    );
    expect(renders).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Resource watch error')).toBeTruthy();
  });
});
