import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import LeaseEditor from './LeaseEditor';
import LeaseCandidateEditor from './LeaseCandidateEditor';
import { resourceEditors } from './index';
import { coordinationShapeError, leaseFields, leaseWriteBoundary, parseLeaseField } from './coordination';

const context: ResourceEditorContext = {
  group: 'coordination.k8s.io', version: 'v1', kind: 'Lease', resource: 'leases', scope: 'Namespaced',
  connectionID: 'fixture', namespace: 'application', name: 'coordination', intent: 'edit', resourceVersion: '4',
  ownership: { status: 'application' }, schema: { status: 'available' }, discovery: { status: 'available', features: {} },
  capabilities: { create: 'available', update: 'available', delete: 'unknown', get: 'available', list: 'available', actions: {} },
};
const leaseSource = 'apiVersion: coordination.k8s.io/v1\nkind: Lease\nmetadata: {name: coordination, namespace: application, resourceVersion: "4"}\nspec:\n  holderIdentity: writer-a # retained holder note\n  leaseDurationSeconds: 30\n  leaseTransitions: 0\n  extension:\n    exact: "9007199254740993"\n';
const candidateSource = 'apiVersion: coordination.k8s.io/v1beta1\nkind: LeaseCandidate\nmetadata: {name: participant-a, namespace: application}\nspec:\n  leaseName: coordination\n  binaryVersion: 1.35.0\n  emulationVersion: 1.34.0\n  strategy: OldestEmulationVersion\n  pingTime: 2026-11-01T12:00:00.000001Z\n  renewTime: 2026-11-01T12:00:01.000001Z\n';
const actions = { execute: vi.fn<ResourceEditorFormProps['actions']['execute']>() };

function Harness({ source = leaseSource, admitted = context, candidate = false, references = { list: vi.fn().mockResolvedValue({ status: 'ready', items: [] }) }, validity = () => {} }: {
  source?: string; admitted?: ResourceEditorContext; candidate?: boolean;
  references?: ResourceEditorFormProps['references']; validity?: (error: string | null) => void;
}) {
  const [controller] = useState(() => new ResourceEditorController(source, 'coordination-test'));
  const [, update] = useState(0);
  const contribution = resourceEditors[candidate ? 1 : 0];
  const props: ResourceEditorFormProps = {
    context: admitted, draft: controller.draft(contribution.sensitivePaths), section: candidate ? 'participant' : 'coordination', disabled: false,
    patch: request => { const result = controller.patch(request, contribution, admitted); if (result.status === 'accepted') update(value => value + 1); return result; },
    onValidityChange: validity, references, actions,
  };
  return <>{candidate ? <LeaseCandidateEditor {...props} /> : <LeaseEditor {...props} />}<output data-testid="canonical-source">{controller.getSource()}</output></>;
}

function candidateContext(version: 'v1alpha2' | 'v1beta1' = 'v1beta1'): ResourceEditorContext {
  return { ...context, kind: 'LeaseCandidate', resource: 'leasecandidates', version, intent: 'inspect', ownership: { status: 'controller' } };
}

describe('coordination ownership and bounded values', () => {
  it('does not grant ownership from missing policy, acknowledgements or mutable metadata', () => {
    const controller = new ResourceEditorController(leaseSource);
    expect(leaseWriteBoundary(controller.draft(), { ...context, ownership: undefined })).toContain('not established');
    expect(leaseWriteBoundary(controller.draft(), { ...context, ownership: { status: 'controller' } })).toContain('not established');
    expect(leaseWriteBoundary(controller.draft(), context)).toBeNull();
    expect(leaseWriteBoundary(controller.draft(), { ...context, namespace: 'kube-node-lease' })).toContain('System coordination');
    expect(leaseWriteBoundary(controller.draft(), { ...context, capabilities: { ...context.capabilities, update: 'unknown' } })).toContain('unknown');
    expect(leaseWriteBoundary(controller.draft(), { ...context, resourceVersion: undefined })).toContain('current revision');
    controller.syncSource(leaseSource + '  strategy: vendor.example/custom\n');
    expect(leaseWriteBoundary(controller.draft(), context)).toContain('Coordinated election');
  });

  it('keeps exact int32 bounds, omission and zero distinct', () => {
    expect(parseLeaseField(leaseFields[1], '2147483647')).toEqual({ valid: true, value: 2147483647n });
    expect(parseLeaseField(leaseFields[1], '2147483648').valid).toBe(false);
    expect(parseLeaseField(leaseFields[1], '0').valid).toBe(false);
    expect(parseLeaseField(leaseFields[4], '0')).toEqual({ valid: true, value: 0n });
    expect(parseLeaseField(leaseFields[4], '')).toEqual({ valid: true });
    expect(parseLeaseField(leaseFields[4], '-').valid).toBe(false);
  });

  it('rejects normalized impossible dates without truncating MicroTime precision', () => {
    expect(parseLeaseField(leaseFields[2], '2026-02-30T12:00:00.000001Z').valid).toBe(false);
    expect(parseLeaseField(leaseFields[2], '2026-11-01T12:00:00.123456Z')).toEqual({ valid: true, value: '2026-11-01T12:00:00.123456Z' });
    expect(parseLeaseField(leaseFields[2], '2026-11-01T12:00:00.1234567Z').valid).toBe(false);
  });

  it('retains unsupported scalar types in source instead of coercing them', () => {
    const controller = new ResourceEditorController(leaseSource.replace('leaseDurationSeconds: 30', 'leaseDurationSeconds: "30"'));
    expect(coordinationShapeError(controller.draft())).toContain('Unsupported integer');
    expect(controller.getSource()).toContain('leaseDurationSeconds: "30"');
  });
});

describe('production coordination controls', () => {
  it('holds invalid text through sibling edits while preserving comments and exact unknown values', () => {
    const validity = vi.fn();
    render(<Harness validity={validity} />);
    fireEvent.change(screen.getByLabelText('Takeover wait (seconds)'), { target: { value: '-' } });
    fireEvent.change(screen.getByLabelText('Holder identity'), { target: { value: 'writer-b' } });
    expect(screen.getByLabelText('Takeover wait (seconds)')).toHaveValue('-');
    expect(validity).toHaveBeenLastCalledWith('Enter a whole number.');
    const source = screen.getByTestId('canonical-source').textContent!;
    expect(source).toContain('leaseDurationSeconds: 30');
    expect(source).toContain('holderIdentity: writer-b # retained holder note');
    expect(source).toContain('exact: "9007199254740993"');
    fireEvent.change(screen.getByLabelText('Takeover wait (seconds)'), { target: { value: '' } });
    expect(screen.getByTestId('canonical-source').textContent).not.toContain('leaseDurationSeconds:');
    expect(screen.getByTestId('canonical-source').textContent).toContain('leaseTransitions: 0');
  });

  it('locks election writers without losing their inspection fields', () => {
    render(<Harness admitted={{ ...context, ownership: { status: 'system' } }} />);
    expect(screen.getByLabelText('Holder identity')).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('Holder identity'), { target: { value: 'takeover' } });
    expect(screen.getByTestId('canonical-source').textContent).toBe(leaseSource);
    expect(screen.queryByLabelText('Coordination change')).not.toBeInTheDocument();
  });

  it('never reveals object fields when get access is denied', () => {
    render(<Harness admitted={{ ...context, capabilities: { ...context.capabilities, get: 'denied' } }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Read access: denied.');
    expect(screen.queryByLabelText('Holder identity')).not.toBeInTheDocument();
  });

  it.each(['v1beta1', 'v1alpha2'] as const)('shows %s candidate fields without allowing mutation', async version => {
    const references = { list: vi.fn().mockResolvedValue({ status: 'ready', items: [] }) };
    render(<Harness source={candidateSource.replace('v1beta1', version)} admitted={candidateContext(version)} candidate references={references} />);
    expect(screen.getByLabelText('Contended Lease')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Binary version')).toHaveValue('1.35.0');
    await waitFor(() => expect(screen.getByRole('status', { name: 'Lease reference' })).toHaveTextContent('No Leases returned'));
    expect(references.list).toHaveBeenCalledWith(expect.objectContaining({ group: 'coordination.k8s.io', version: 'v1', resource: 'leases', namespace: 'application', projection: 'metadata', sessionID: 'coordination-test' }));
    expect(actions.execute).not.toHaveBeenCalled();
  });

  it('distinguishes denied reference lookup and retries without writing the candidate', async () => {
    const references = { list: vi.fn().mockResolvedValueOnce({ status: 'denied', message: 'Denied' }).mockResolvedValue({ status: 'ready', items: [{ name: 'coordination', namespace: 'application' }] }) };
    render(<Harness source={candidateSource} admitted={candidateContext()} candidate references={references} />);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Lease reference' })).toHaveTextContent('access denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Lease reference' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Lease reference' })).toHaveTextContent('Election operation is not verified'));
    expect(screen.getByTestId('canonical-source').textContent).toBe(candidateSource);
  });
});
