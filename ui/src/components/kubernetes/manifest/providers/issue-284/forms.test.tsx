import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorFormProps, ResourceEditorReferenceService } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import FlowSchemaForm from './FlowSchemaForm';
import PriorityLevelForm from './PriorityLevelForm';
import { fixtureContext, flowSource, prioritySource } from './fixtures';
import { resourceEditors } from './index';

const deniedReferences: ResourceEditorReferenceService = { list: async () => ({ status: 'denied', message: 'Fixture denied.' }) };
function Harness({ controller, priority = false, context, validity, section: initialSection }: { controller: ResourceEditorController; priority?: boolean; context?: ResourceEditorContext; validity: (error: string | null) => void; section?: string }) {
  const [, rerender] = useState(0);
  const [section, setSection] = useState(initialSection || (priority ? 'capacity' : 'routing'));
  const contribution = resourceEditors[priority ? 1 : 0];
  const currentContext = context || fixtureContext(priority ? 'PriorityLevelConfiguration' : 'FlowSchema');
  const props: ResourceEditorFormProps = {
    context: currentContext, draft: controller.draft(), section, disabled: false,
    patch: request => { const result = controller.patch(request, contribution, currentContext); if (result.status === 'accepted') rerender(value => value + 1); return result; },
    onValidityChange: validity, references: deniedReferences,
    actions: { execute: async () => ({ status: 'unavailable', message: 'No action in this fixture.' }) },
  };
  return <><button onClick={() => setSection('status')}>Test status tab</button><button onClick={() => setSection(priority ? 'capacity' : 'routing')}>Test main tab</button>{priority ? <PriorityLevelForm {...props} /> : <FlowSchemaForm {...props} />}</>;
}
afterEach(cleanup);
describe('APF field interactions', () => {
  it('retains partial numeric input across sibling revisions and navigation without changing source', () => {
    const controller = new ResourceEditorController(prioritySource);
    const validity = vi.fn();
    render(<Harness controller={controller} priority validity={validity} />);
    fireEvent.change(screen.getByLabelText('Nominal concurrency shares'), { target: { value: '-' } });
    expect(controller.draft().get(['spec', 'limited', 'nominalConcurrencyShares'])).toBe(30n);
    fireEvent.change(screen.getByLabelText('Lendable concurrency (%)'), { target: { value: '25' } });
    expect(screen.getByLabelText('Nominal concurrency shares')).toHaveValue('-');
    expect(validity).toHaveBeenLastCalledWith('Enter a whole number.');
    fireEvent.click(screen.getByText('Test status tab'));
    fireEvent.click(screen.getByText('Test main tab'));
    expect(screen.getByLabelText('Nominal concurrency shares')).toHaveValue('-');
    fireEvent.change(screen.getByLabelText('Nominal concurrency shares'), { target: { value: '0' } });
    expect(controller.draft().get(['spec', 'limited', 'nominalConcurrencyShares'])).toBe(0n);
    expect(validity).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('Nominal concurrency shares'), { target: { value: '' } });
    expect(controller.draft().has(['spec', 'limited', 'nominalConcurrencyShares'])).toBe(false);
  });
  it('keeps denied lookup distinct and retains a partially cleared reference outside canonical source', async () => {
    const controller = new ResourceEditorController(flowSource);
    const validity = vi.fn();
    render(<Harness controller={controller} validity={validity} />);
    await waitFor(() => expect(screen.getByText('Reference access denied. Enter a name manually.')).toBeVisible());
    fireEvent.change(screen.getByLabelText('Priority level'), { target: { value: '' } });
    expect(screen.getByLabelText('Priority level')).toHaveValue('');
    expect(controller.draft().get(['spec', 'priorityLevelConfiguration', 'name'])).toBe('tenant-capacity');
    expect(validity).toHaveBeenLastCalledWith('Enter a priority name.');
    fireEvent.change(screen.getByLabelText('Priority level'), { target: { value: 'manual-capacity' } });
    expect(controller.draft().get(['spec', 'priorityLevelConfiguration', 'name'])).toBe('manual-capacity');
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('requires explicit bootstrap opt-out before editing policy fields', () => {
    const controller = new ResourceEditorController(flowSource.replace('name: tenant-routing', 'name: system-nodes'));
    render(<Harness controller={controller} validity={vi.fn()} />);
    expect(screen.getByLabelText('Matching precedence')).toBeDisabled();
    fireEvent.click(screen.getByText('Opt out of spec reconciliation'));
    expect(controller.draft().get(['metadata', 'annotations', 'apf.kubernetes.io/autoupdate-spec'])).toBe('false');
    expect(screen.getByLabelText('Matching precedence')).not.toBeDisabled();
    expect(controller.getSource()).toContain('# keep annotation');
  });
  it('removes exactly one matching group and leaves another group and unknown siblings intact', () => {
    const controller = new ResourceEditorController(flowSource);
    render(<Harness controller={controller} validity={vi.fn()} section="matching" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove matching groups 1' }));
    expect(controller.draft().get(['spec', 'rules', 0, 'subjects', 0, 'serviceAccount', 'name'])).toBe('reader');
    expect(controller.draft().get(['spec', 'rules', 1])).toBeUndefined();
    expect(controller.draft().get(['spec', 'vendor', 'exact'])).toBe(9007199254740993n);
    fireEvent.click(screen.getByRole('button', { name: 'Add matching group' }));
    expect(controller.draft().get(['spec', 'rules', 1, 'subjects'])).toEqual([]);
  });
  it('keeps invalid queue bounds local instead of replacing the last valid policy', () => {
    const controller = new ResourceEditorController(prioritySource);
    const validity = vi.fn();
    render(<Harness controller={controller} priority validity={validity} />);
    fireEvent.change(screen.getByLabelText('Queue count'), { target: { value: '4' } });
    expect(screen.getByLabelText('Queue count')).toHaveValue('4');
    expect(controller.draft().get(['spec', 'limited', 'limitResponse', 'queuing', 'queues'])).toBe(64n);
    expect(validity).toHaveBeenLastCalledWith('Hand size must not exceed queues.');
    fireEvent.change(screen.getByLabelText('Queue count'), { target: { value: '16' } });
    expect(controller.draft().get(['spec', 'limited', 'limitResponse', 'queuing', 'queues'])).toBe(16n);
    expect(validity).toHaveBeenLastCalledWith(null);
  });
});
