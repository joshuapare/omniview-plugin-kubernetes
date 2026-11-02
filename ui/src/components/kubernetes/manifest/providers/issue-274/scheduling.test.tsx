import type { ResourceEditorContext, ResourceEditorContribution, ResourceEditorReferenceService } from '@omniviewdev/runtime';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResourceEditorController } from '../../resourceEditorController';

import { fixtureContext, prioritySource, workloadSource } from './fixtures';
import { BufferedField } from './formState';
import { controllerLookup, integer, policyChanges, priorityUnavailable, schedulingReadOnly, validateWorkload, workloadUnavailable } from './model';
import PriorityClassForm from './PriorityClassForm';
import WorkloadForm from './WorkloadForm';

import { resourceEditors } from './index';

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
  it.each(['bootstrap', 'controller-policy', 'controller-reference'])('blocks canonical mutations for %s classes', ownership => {
    const context = fixtureContext('PriorityClass');
    let source = prioritySource;
    if (ownership === 'bootstrap') source = source.replace('batch-priority', 'system-cluster-critical');
    if (ownership === 'controller-policy') context.ownership = { status: 'controller' };
    if (ownership === 'controller-reference') source = source.replace('  name: batch-priority', '  name: batch-priority\n  ownerReferences:\n    - apiVersion: apps/v1\n      kind: Deployment\n      name: scheduler-owner\n      uid: fixture-owner\n      controller: true');
    render(<Harness source={source} context={context} />);
    expect(screen.getByLabelText('Description')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Forbidden change' } });
    expect(screen.getByLabelText('Canonical fixture source').textContent).toBe(source);
    const controller = new ResourceEditorController(source, 'ownership-test');
    const draft = controller.draft();
    expect(controller.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations: [{ op: 'set', path: ['globalDefault'], value: true }] }, resourceEditors[0], context).status).toBe('forbidden');
    expect(controller.getSource()).toBe(source);
  });
  it('rejects unsupported identity shapes and preserves trusted system identity restrictions', () => {
    const context = fixtureContext('PriorityClass');
    const malformed = new ResourceEditorController(prioritySource.replace('name: batch-priority', 'name: {unsupported: true}')).draft();
    expect(schedulingReadOnly(malformed, context)).toBe(true);
    context.name = 'system-cluster-critical';
    expect(schedulingReadOnly(new ResourceEditorController(prioritySource).draft(), context)).toBe(true);
  });
  it('does not resurrect an old invalid buffer after canonical field changes', () => {
    const report = vi.fn();
    const field = { label: 'Buffered priority', fieldKey: 'priority', report, validate: (text: string) => integer(text, -2147483648, 1000000000) === null ? 'Invalid priority' : null, onCommit: () => null };
    const view = render(<BufferedField {...field} value="100" />);
    fireEvent.change(screen.getByLabelText('Buffered priority'), { target: { value: '-' } });
    expect(screen.getByLabelText('Buffered priority')).toHaveValue('-');
    view.rerender(<BufferedField {...field} value="200" />);
    expect(screen.getByLabelText('Buffered priority')).toHaveValue('200');
    view.rerender(<BufferedField {...field} value="100" />);
    expect(screen.getByLabelText('Buffered priority')).toHaveValue('100');
    expect(report).toHaveBeenLastCalledWith('priority', null);
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
  it('retains an invalid remaining group buffer when an earlier row is removed', () => {
    const validity = vi.fn();
    const source = workloadSource.replace('basic: {}', 'gang:\n          minCount: 3');
    render(<Harness source={source} context={fixtureContext('Workload')} contribution={resourceEditors[1]} validity={validity} />);
    fireEvent.change(screen.getByLabelText('Group 2 minimum Pods'), { target: { value: '-' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove pod group 1' }));
    expect(screen.getByLabelText('Group 1 minimum Pods')).toHaveValue('-');
    expect(validity).toHaveBeenLastCalledWith('Enter an integer from 1 to 2147483647 Pods.');
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
