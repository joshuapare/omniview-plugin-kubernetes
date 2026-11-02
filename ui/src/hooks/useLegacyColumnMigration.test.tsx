import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLegacyColumnMigration } from './useLegacyColumnMigration';
import { legacyBackupPrefix } from '../utils/legacyMigration';

const showSnackbar = vi.hoisted(() => vi.fn());
vi.mock('@omniviewdev/runtime', () => ({ useSnackbar: () => ({ showSnackbar }) }));

describe('legacy preference reporting', () => {
  beforeEach(() => { localStorage.clear(); showSnackbar.mockClear(); });
  it('backs up unknown keys and reports them through toast and log', async () => {
    const key = 'kubernetes-prod-example.io::v1::Widget-column-visibility';
    localStorage.setItem(key, '{}');
    const log = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    renderHook(() => useLegacyColumnMigration(['prod']));
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith(expect.objectContaining({
        status: 'warning', details: key, showOnce: true,
      }));
    });
    expect(log).toHaveBeenCalledWith('Kubernetes legacy preferences could not be migrated:', key);
    expect(localStorage.getItem(legacyBackupPrefix + key)).toBe('{}');
    log.mockRestore();
  });
  it('uses the active bootstrap profile for host table preferences', () => {
    const prefix = 'omniview:instance:v1:dev:';
    vi.stubGlobal('__OMNIVIEW_BOOTSTRAP__', { storageKey: (key: string) => prefix + key });
    localStorage.setItem(prefix + 'kubernetes-prod-core::v1::Pod-column-visibility', '{}');
    renderHook(() => useLegacyColumnMigration(['prod']));
    expect(localStorage.getItem(prefix + 'kubernetes-prod-k8s:/pods-column-visibility')).toBe('{}');
    vi.unstubAllGlobals();
  });

  it('waits for configured connection IDs before copying preferences', () => {
    const old = 'kubernetes-prod-core::v1::Pod-column-visibility';
    const next = 'kubernetes-prod-k8s:/pods-column-visibility';
    localStorage.setItem(old, 'original');
    const view = renderHook(({ ids }: { ids: string[] | undefined }) => useLegacyColumnMigration(ids), {
      initialProps: { ids: undefined },
    });
    expect(view.result.current).toBe(false);
    expect(localStorage.getItem(next)).toBeNull();
    view.rerender({ ids: ['prod'] });
    expect(view.result.current).toBe(true);
    expect(localStorage.getItem(next)).toBe('original');
    expect(showSnackbar).not.toHaveBeenCalled();
  });

  it('reports ambiguous connection prefixes once without copying a guessed preference', async () => {
    const key = 'kubernetes-prod-example-core::v1::Pod-column-visibility';
    localStorage.setItem(key, 'original');
    const log = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    try {
      const view = renderHook(({ ids }) => useLegacyColumnMigration(ids), { initialProps: { ids: ['prod', 'prod-example'] } });
      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledOnce();
      });
      view.rerender({ ids: ['prod-example', 'prod'] });
      expect(showSnackbar).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledOnce();
      expect(localStorage.getItem('kubernetes-prod-example-k8s:/pods-column-visibility')).toBeNull();
      expect(localStorage.getItem(key)).toBe('original');
      expect(localStorage.getItem(legacyBackupPrefix + key)).toBe('original');
    } finally {
      log.mockRestore();
    }
  });

  it('reports unknown sidebar resources through the existing preference gate', async () => {
    const key = 'kubernetes-sidebar-order';
    const original = '{"items":["example.io_v1_Widget"],"children":{}}';
    const details = `${key}: example.io_v1_Widget`;
    localStorage.setItem(key, original);
    const log = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    try {
      renderHook(() => useLegacyColumnMigration(['prod']));
      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith(expect.objectContaining({
          status: 'warning', details, showOnce: true,
        }));
      });
      expect(log).toHaveBeenCalledWith('Kubernetes legacy preferences could not be migrated:', details);
      expect(localStorage.getItem(key)).toBe(original);
      expect(localStorage.getItem(legacyBackupPrefix + key)).toBe(original);
    } finally {
      log.mockRestore();
    }
  });
});
