import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorContribution, ResourceEditorReferenceService } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import PriorityClassForm from './PriorityClassForm';
import WorkloadForm from './WorkloadForm';
import { fixtureContext, prioritySource, workloadSource } from './fixtures';
import { resourceEditors } from './index';
import { controllerLookup, integer, policyChanges, priorityUnavailable, schedulingReadOnly, validateWorkload, workloadUnavailable } from './model';

const references: ResourceEditorReferenceService = { list: async () => ({ status: 'ready', items: [] }) };
function Harness({ source = prioritySource, context = fixtureContext('PriorityClass'), contribution = resourceEditors[0], validity = () => {} }: {
  source?: string;
  context?: ResourceEditorContext;
  contribution?: ResourceEditorContribution;
  validity?: (error: string | null) => void;
}) {
  const [controller] = useState(() => new ResourceEditorController(source, 'scheduling-test'));
  const [, renderRevision] = useState(0);
  const Component = context.kind === 'PriorityClass' ? PriorityClassForm : WorkloadForm;
  return <><Component context={context} draft={controller.draft()} baseline={context.intent === 'create' ? undefined : new ResourceEditorController(source).draft()}
    section="scheduling" disabled={false} onValidityChange={validity} references={references} actions={{ execute: async () => ({ status: 'unavailable', message: 'Fixture only.' }) }}
    patch={request => { const result = controller.patch(request, contribution, context); if (result.status === 'accepted') renderRevision(controller.revision); return result; }} />
    <output aria-label="Canonical fixture source">{controller.getSource()}</output></>;
}
afterEach(cleanup);

describe('Scheduling editor behavior', () => {
  it('keeps partial priority local across sibling edits and preserves exact unknown integers/comments', () => {
    const validity = vi.fn();
    render(<Harness validity={validity} />);
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: '-' } });
    expect(validity).toHaveBeenLastCalledWith('Enter an integer from −2147483648 to 1000000000.');
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New scheduling guidance' } });
    expect(screen.getByLabelText('Priority')).toHaveValue('-');
    const source = screen.getByLabelText('Canonical fixture source').textContent!;
    expect(source).toContain('value: 100 # keep priority comment');
    expect(source).toContain('9007199254740993123 # preserve exact unknown integer');
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: '101' } });
    expect(validity).toHaveBeenLastCalledWith(null);
    expect(screen.getByLabelText('Canonical fixture source')).toHaveTextContent('value: 101');
  });
  it('locks immutable priority/preemption while allowing description edits', () => {
    render(<Harness context={fixtureContext('PriorityClass', 'edit')} />);
    expect(screen.getByLabelText('Priority')).toBeDisabled();
    expect(screen.getByLabelText('Preemption')).toBeDisabled();
    expect(screen.getByLabelText('Description')).not.toBeDisabled();
  });
  it('does not author bootstrap or controller-owned classes', () => {
    render(<Harness source={prioritySource.replace('batch-priority', 'system-cluster-critical')} />);
    expect(screen.getByLabelText('Description')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Inspection only');
  });
  it('adds a group only after a valid unique local name and removes only the selected row', () => {
    render(<Harness source={workloadSource} context={fixtureContext('Workload')} contribution={resourceEditors[1]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add pod group' }));
    fireEvent.change(screen.getByLabelText('New pod group name'), { target: { value: 'workers' } });
    expect(screen.getByRole('button', { name: 'Add basic group' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('New pod group name'), { target: { value: 'analysis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add basic group' }));
    expect(screen.getByLabelText('Group 3 name')).toHaveValue('analysis');
    fireEvent.click(screen.getByRole('button', { name: 'Remove pod group 2' }));
    expect(screen.getByLabelText('Group 2 name')).toHaveValue('analysis');
    expect(screen.getByLabelText('Canonical fixture source')).toHaveTextContent('9007199254740993123');
    expect(screen.getByLabelText('Canonical fixture source')).toHaveTextContent('# keep group comment');
  });
  it('keeps invalid gang minimum local without converting its scalar type', () => {
    render(<Harness source={workloadSource} context={fixtureContext('Workload')} contribution={resourceEditors[1]} />);
    fireEvent.change(screen.getByLabelText('Group 1 minimum Pods'), { target: { value: '2147483648' } });
    expect(screen.getByLabelText('Group 1 minimum Pods')).toHaveValue('2147483648');
    expect(screen.getByLabelText('Canonical fixture source')).toHaveTextContent('minCount: 3');
  });
  it('locks existing group policies and a set controller reference', () => {
    render(<Harness source={workloadSource} context={fixtureContext('Workload', 'edit')} contribution={resourceEditors[1]} />);
    expect(screen.getByLabelText('Group 1 name')).toBeDisabled();
    expect(screen.getByLabelText('Group 1 minimum Pods')).toBeDisabled();
    expect(screen.getByLabelText('Controller kind')).toBeDisabled();
  });
  it('switches policy leaves atomically without losing unrelated source', () => {
    const controller = new ResourceEditorController(workloadSource, 'policy-test');
    const draft = controller.draft();
    const result = controller.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations: policyChanges(0, 'basic', 3, draft) }, resourceEditors[1], fixtureContext('Workload'));
    expect(result.status).toBe('accepted');
    expect(controller.draft().get(['spec', 'podGroups', 0, 'policy', 'gang'])).toBeUndefined();
    expect(controller.draft().get(['spec', 'podGroups', 0, 'policy', 'basic'])).toEqual({});
    expect(controller.getSource()).toContain('# keep group comment');
    expect(controller.getSource()).toContain('9007199254740993123');
  });
  it('does not coerce quoted priority or unknown policy objects into the guided form', () => {
    const priority = new ResourceEditorController(prioritySource.replace('value: 100', 'value: "100"')).draft();
    expect(priorityUnavailable(priority)).not.toBeNull();
    const workload = new ResourceEditorController(workloadSource.replace('basic: {}', 'basic: {futureField: true}')).draft();
    expect(workloadUnavailable(workload, fixtureContext('Workload'))).toContain('unsupported shape');
  });
  it('distinguishes gate availability and ownership without inferring scheduler support', () => {
    const context = fixtureContext('Workload');
    const draft = new ResourceEditorController(workloadSource).draft();
    context.discovery.features = { GenericWorkload: 'unknown', GangScheduling: 'unknown' };
    expect(workloadUnavailable(draft, context)).toBeNull();
    expect(validateWorkload(draft, context)).toEqual([]);
    context.discovery.features.GangScheduling = 'absent';
    expect(validateWorkload(draft, context)[0].message).toContain('confirmed disabled');
    context.discovery.status = 'unknown';
    expect(workloadUnavailable(draft, context)).toContain('not confirmed available');
    const edit = fixtureContext('Workload', 'edit');
    delete edit.ownership;
    expect(schedulingReadOnly(draft, edit)).toBe(true);
  });
  it('uses exact known reference resources and preserves arbitrary manually typed kinds', () => {
    expect(controllerLookup('apps', 'Deployment')).toEqual({ group: 'apps', version: 'v1', resource: 'deployments' });
    expect(controllerLookup('custom.example', 'Mouse')).toBeNull();
    expect(integer('9007199254740993123', -2147483648, 1000000000)).toBeNull();
    expect(integer('-2147483648', -2147483648, 1000000000)).toBe(-2147483648);
  });
});
