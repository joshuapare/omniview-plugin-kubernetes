import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DrawerContext } from '@omniviewdev/runtime';
import { PLUGIN_ID } from '@/pluginId';
import { ReleaseSidebar } from './ReleaseSidebar';
import UpgradeDialog from './UpgradeDialog';

const mocks = vi.hoisted(() => ({ editorPath: vi.fn(), execute: vi.fn() }));
vi.mock('@omniviewdev/runtime', () => ({
  jsonToValue: (value: unknown) => value,
  useExecuteAction: () => ({ executeAction: mocks.execute, isExecuting: false }),
  useResourceEditorModelPath: mocks.editorPath,
  useRightDrawer: () => ({ showResourceSidebar: vi.fn() }),
}));
vi.mock('@omniviewdev/runtime/api', () => ({ ResourceClient: { ResolveReference: vi.fn() } }));
vi.mock('../../shared/CodeEditor', () => ({ default: ({ path }: { path?: string }) => <div data-testid="editor" data-path={path} /> }));

const ctx = {
  data: { version: 1n },
  resource: { key: 'release', route: { connection: 'cluster' }, reference: { address: {
    id: 'release', scope: [{ dimension: 'namespace', value: 'team' }],
  } } },
} as DrawerContext<{ version?: bigint }>;

describe('Helm values editor paths', () => {
  it('separates read-only preview from upgrade draft within the same association', () => {
    mocks.editorPath.mockImplementation(({ name }: { name: string }) => `file:///catalog/helm/${name}.yaml`);
    mocks.execute.mockResolvedValue({});
    render(<ReleaseSidebar ctx={ctx} />);
    expect(mocks.editorPath).toHaveBeenCalledWith({
      pluginID: PLUGIN_ID, route: { connection: 'cluster' }, type: 'helm:releases', key: 'team/release', name: 'values-preview',
    });
    expect(screen.getByTestId('editor').getAttribute('data-path')).toBe('file:///catalog/helm/values-preview.yaml');
    render(<UpgradeDialog open={false} onClose={() => {}} releaseName="release" namespace="team" chartRef="chart" connectionID="cluster" />);
    expect(mocks.editorPath).toHaveBeenCalledWith({
      pluginID: PLUGIN_ID, route: { connection: 'cluster' }, type: 'helm:releases', key: 'team/release', name: 'values',
    });
  });
});
