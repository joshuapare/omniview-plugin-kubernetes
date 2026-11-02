import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorActionResult, ResourceEditorActionService, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import { createSource, migrationContext } from './fixtures';
import TargetDiscovery from './TargetDiscovery';

const result: ResourceEditorActionResult = { status: 'ready', output: { kind: 'APIGroupDiscoveryList', items: [{ metadata: { name: 'batch' }, versions: [{ freshness: 'Current', resources: [{ resource: 'jobs', verbs: ['list', 'update'] }] }] }] } };
function form(actions: ResourceEditorActionService): ResourceEditorFormProps {
  const controller = new ResourceEditorController(createSource, 'discovery-regression');
  return { context: migrationContext, draft: controller.draft(), section: 'target', disabled: false,
    patch: vi.fn(() => ({ status: 'forbidden', message: 'No mutation configured.' })),
    onValidityChange: vi.fn(), references: { list: vi.fn(async () => ({ status: 'ready', items: [] })) }, actions };
}
afterEach(cleanup);
describe('storage migration discovery interactions', () => {
  it('queries real negotiated endpoints without assuming migration resource advertises query permission', async () => {
    const execute = vi.fn<ResourceEditorActionService['execute']>(async () => result);
    const props = form({ execute });
    render(<TargetDiscovery form={props} disabled={false} group="apps" resource="deployments" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discover targets' }));
    await screen.findByText('Discovered target');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.map(([request]) => request.input)).toEqual([{ endpoint: '/api', version: 'v2' }, { endpoint: '/apis', version: 'v2' }]);
    expect(execute.mock.calls[0][0].sessionID).toBe(props.draft.sessionID);
    expect(props.patch).not.toHaveBeenCalled();
  });
  it.each(['denied', 'unavailable', 'absent'] as const)('preserves manual targets when discovery is %s', async status => {
    const props = form({ execute: vi.fn(async () => ({ status, message: 'Never echo transport detail.' })) });
    render(<TargetDiscovery form={props} disabled={false} group="apps" resource="deployments" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discover targets' }));
    await screen.findByRole('status');
    expect(screen.queryByText('Never echo transport detail.')).not.toBeInTheDocument();
    expect(screen.queryByText('Discovered target')).not.toBeInTheDocument();
    expect(props.patch).not.toHaveBeenCalled();
  });
  it('discards late lookup response after canonical draft revision changes', async () => {
    const { promise: pending, resolve } = Promise.withResolvers<ResourceEditorActionResult>();
    const execute = vi.fn<ResourceEditorActionService['execute']>(() => pending);
    const props = form({ execute });
    const onSelect = vi.fn();
    const view = render(<TargetDiscovery form={props} disabled={false} group="apps" resource="deployments" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discover targets' }));
    view.rerender(<TargetDiscovery form={{ ...props, draft: { ...props.draft, revision: 1 } }} disabled={false} group="batch" resource="jobs" onSelect={onSelect} />);
    expect(execute.mock.calls[0][0].signal.aborted).toBe(true);
    expect(screen.getByRole('button', { name: 'Discover targets' })).toBeEnabled();
    await act(async () => { resolve(result); await pending; });
    expect(screen.queryByText('Discovered target')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('allows a fresh lookup when admission replaces the action service', async () => {
    const { promise: pending, resolve } = Promise.withResolvers<ResourceEditorActionResult>();
    const originalExecute = vi.fn<ResourceEditorActionService['execute']>(() => pending);
    const props = form({ execute: originalExecute });
    const onSelect = vi.fn();
    const view = render(<TargetDiscovery form={props} disabled={false} group="apps" resource="deployments" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discover targets' }));
    const currentActions = { execute: vi.fn<ResourceEditorActionService['execute']>(async () => result) };
    view.rerender(<TargetDiscovery form={{ ...props, actions: currentActions }} disabled={false} group="apps" resource="deployments" onSelect={onSelect} />);
    expect(originalExecute.mock.calls[0][0].signal.aborted).toBe(true);
    expect(screen.getByRole('button', { name: 'Discover targets' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Discover targets' }));
    await screen.findByText('Discovered target');
    await act(async () => { resolve({ status: 'denied' }); await pending; });
    expect(screen.getByText('Discovered target')).toBeInTheDocument();
    expect(screen.queryByText('Target discovery denied. Exact manual targets remain available.')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('does not reuse discovered choices from another connection', async () => {
    const execute = vi.fn<ResourceEditorActionService['execute']>(async () => result);
    const props = form({ execute });
    const onSelect = vi.fn();
    const view = render(<TargetDiscovery form={props} disabled={false} group="apps" resource="deployments" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discover targets' }));
    await screen.findByText('Discovered target');
    view.rerender(<TargetDiscovery form={{ ...props, context: { ...props.context, connectionID: 'another-fixture' } }} disabled={false} group="apps" resource="deployments" onSelect={onSelect} />);
    expect(screen.queryByText('Discovered target')).not.toBeInTheDocument();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
