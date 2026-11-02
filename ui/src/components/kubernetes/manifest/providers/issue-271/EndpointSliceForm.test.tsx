import type { ResourceEditorContext, ResourceEditorPatchRequest, ResourceEditorReferenceResult } from '@omniviewdev/runtime';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ResourceEditorController } from '../../resourceEditorController';

import EndpointSliceForm from './EndpointSliceForm';
import { addressError, formUnavailable, isReadOnly, portError, validate } from './model';

import { resourceEditors } from './index';

const context: ResourceEditorContext = {
  group: 'discovery.k8s.io', version: 'v1', kind: 'EndpointSlice', resource: 'endpointslices', scope: 'Namespaced',
  connectionID: 'fixture', namespace: 'demo', name: 'external-api', intent: 'edit', ownership: { status: 'application' },
  capabilities: { create: 'available', update: 'available', delete: 'unknown', get: 'available', list: 'available', actions: {} },
  discovery: { status: 'available', features: {} }, schema: { status: 'available' },
};
const initial = `apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: external-api
  namespace: demo
  labels:
    endpointslice.kubernetes.io/managed-by: ops.example.com
    kubernetes.io/service-name: external-api
addressType: IPv4
endpoints:
  - addresses: [10.4.0.8, 10.4.0.9] # retained address comment
    conditions: {ready: false, serving: true}
    targetRef: {kind: Pod, name: backend, namespace: demo}
    hints: {forZones: [{name: zone-a}]}
    futureCounter: 9007199254740993
ports:
  - name: http
    protocol: TCP
    port: 8080
    appProtocol: http
`;
const actions = { execute: vi.fn(async () => ({ status: 'unavailable' as const, message: 'Fixture: no action protocol.' })) };
function Harness({ controller, section, target = context, lookup = { status: 'ready', items: [] }, validity = () => undefined }: {
  controller: ResourceEditorController; section: string; target?: ResourceEditorContext; lookup?: ResourceEditorReferenceResult; validity?: (error: string | null) => void;
}) {
  const [, refresh] = useState(0);
  const [references] = useState(() => ({ list: vi.fn(async () => lookup) }));
  const patch = useCallback((request: ResourceEditorPatchRequest) => {
    const result = controller.patch(request, resourceEditors[0], target);
    if (result.status === 'accepted') refresh(value => value + 1);
    return result;
  }, [controller, target]);
  return <EndpointSliceForm context={target} draft={controller.draft()} section={section} disabled={false} patch={patch} onValidityChange={validity} references={references} actions={actions} />;
}

describe('EndpointSlice domain safety', () => {
  it('validates complete IPv6 syntax and rejects unsafe endpoint address classes', () => {
    expect(addressError('2001:db8::8', 'IPv6')).toBeNull();
    expect(addressError('2001:db8:1:2:3:4:5:6', 'IPv6')).toBeNull();
    for (const value of ['2001:db8:::8', '2001:db8', '::', '::1', 'fe80::3', 'ff02::1', '::ffff:127.0.0.1']) expect(addressError(value, 'IPv6')).not.toBeNull();
    expect(addressError('10.4.0.8', 'IPv4')).toBeNull();
    for (const value of ['127.0.0.1', '169.254.0.1', '224.0.0.1', '0.0.0.0', '10.4.0.999']) expect(addressError(value, 'IPv4')).not.toBeNull();
  });
  it('never treats labels as trusted permission or controller takeover proof', () => {
    const draft = new ResourceEditorController(initial).draft();
    expect(isReadOnly(draft, { ...context, ownership: undefined })).toBe(true);
    expect(isReadOnly(draft, { ...context, ownership: { status: 'controller' } })).toBe(true);
    expect(isReadOnly(draft, context)).toBe(false);
    const generated = new ResourceEditorController(initial.replace('ops.example.com', 'endpointslice-controller.k8s.io')).draft();
    expect(isReadOnly(generated, context)).toBe(true);
  });
  it('retains FQDN and unsupported typed fields in source without coercion', () => {
    const controller = new ResourceEditorController(initial.replace('addressType: IPv4', 'addressType: FQDN'));
    expect(formUnavailable(controller.draft(), context)).toContain('FQDN');
    expect(controller.getSource()).toContain('addressType: FQDN');
    expect(formUnavailable(new ResourceEditorController(initial.replace('port: 8080', 'port: "8080"')).draft(), context)).toContain('scalar type');
    const unsafePort = new ResourceEditorController(initial.replace('port: 8080', 'port: {future: 8080}')).draft();
    expect(formUnavailable(unsafePort, context)).not.toBeNull();
    expect(validate(unsafePort, context).some(issue => issue.path[0] === 'ports' && issue.path[2] === 'port')).toBe(true);
  });
  it('allows explicit empty endpoint slices and detects duplicate unnamed ports', () => {
    const controller = new ResourceEditorController(initial);
    const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [
      { op: 'set', path: ['endpoints'], value: [] },
      { op: 'remove', path: ['ports', 0] },
      { op: 'insert', path: ['ports'], index: 0, value: {} },
      { op: 'insert', path: ['ports'], index: 1, value: {} },
    ] }, resourceEditors[0], context);
    expect(result.status).toBe('accepted');
    expect(controller.draft().get(['endpoints'])).toEqual([]);
    expect(controller.draft().get(['ports'])).toEqual([{}, {}]);
    expect(validate(controller.draft(), context).some(issue => issue.path[0] === 'endpoints')).toBe(false);
    expect(validate(controller.draft(), context).some(issue => issue.message.includes('unique'))).toBe(true);
    expect(portError('')).toBeNull();
    expect(portError('65535')).toBeNull();
    expect(portError('65536')).not.toBeNull();
  });
});

describe('EndpointSlice real form and canonical patches', () => {
  it('holds partial numeric text locally while a sibling edit preserves source and validity', async () => {
    const controller = new ResourceEditorController(initial);
    const validity = vi.fn();
    render(<Harness controller={controller} section="ports" validity={validity} />);
    fireEvent.change(screen.getByLabelText('Port 1 backend number'), { target: { value: '8x' } });
    expect(controller.draft().get(['ports', 0, 'port'])).toBe(8080n);
    fireEvent.change(screen.getByLabelText('Port 1 application protocol'), { target: { value: 'kubernetes.io/h2c' } });
    expect(screen.getByLabelText('Port 1 backend number')).toHaveValue('8x');
    expect(controller.draft().get(['ports', 0, 'appProtocol'])).toBe('kubernetes.io/h2c');
    await waitFor(() => expect(validity).toHaveBeenLastCalledWith(expect.stringContaining('1 to 65535')));
    fireEvent.change(screen.getByLabelText('Port 1 backend number'), { target: { value: '9090' } });
    expect(controller.draft().get(['ports', 0, 'port'])).toBe(9090n);
    await waitFor(() => expect(validity).toHaveBeenLastCalledWith(null));
  });
  it('patches first address only, retaining extra addresses, hints, unknown exact integers and comments', () => {
    const controller = new ResourceEditorController(initial);
    render(<Harness controller={controller} section="endpoints" />);
    fireEvent.change(screen.getByLabelText('Backend 1 address'), { target: { value: '10.4.0.10' } });
    expect(controller.draft().get(['endpoints', 0, 'addresses', 1])).toBe('10.4.0.9');
    expect(controller.draft().get(['endpoints', 0, 'futureCounter'])).toBe(9007199254740993n);
    expect(controller.draft().get(['endpoints', 0, 'targetRef', 'name'])).toBe('backend');
    expect(controller.draft().get(['endpoints', 0, 'hints', 'forZones', 0, 'name'])).toBe('zone-a');
    expect(controller.getSource()).toContain('# retained address comment');
    expect(controller.draft().get(['endpoints', 0, 'conditions', 'ready'])).toBe(false);
  });
  it('adds and removes a real backend without reconstructing existing rows', () => {
    const controller = new ResourceEditorController(initial);
    render(<Harness controller={controller} section="endpoints" />);
    fireEvent.change(screen.getByLabelText('New backend address'), { target: { value: '10.4.0.12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add backend' }));
    expect(controller.draft().get(['endpoints', 1, 'addresses', 0])).toBe('10.4.0.12');
    fireEvent.click(screen.getByRole('button', { name: 'Remove backend 2' }));
    expect(controller.draft().get(['endpoints', 1])).toBeUndefined();
    expect(controller.getSource()).toContain('# retained address comment');
  });
  it('keeps the surviving backend row and its local partial address when an earlier row is removed', async () => {
    const controller = new ResourceEditorController(initial);
    const validity = vi.fn();
    render(<Harness controller={controller} section="endpoints" validity={validity} />);
    fireEvent.change(screen.getByLabelText('New backend address'), { target: { value: '10.4.0.12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add backend' }));
    const survivingRow = screen.getByLabelText('Backend 2 address').closest('.endpoint-slice-row');
    fireEvent.change(screen.getByLabelText('Backend 2 address'), { target: { value: '10.4.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove backend 1' }));
    expect(screen.getByLabelText('Backend 1 address').closest('.endpoint-slice-row')).toBe(survivingRow);
    expect(screen.getByLabelText('Backend 1 address')).toHaveValue('10.4.');
    expect(controller.draft().get(['endpoints', 0, 'addresses', 0])).toBe('10.4.0.12');
    await waitFor(() => expect(validity).toHaveBeenLastCalledWith(expect.any(String)));
  });
  it('locks generated endpoints and immutable address family on edit', () => {
    const controller = new ResourceEditorController(initial);
    const { rerender } = render(<Harness controller={controller} section="association" />);
    expect(screen.getByLabelText('Address family')).toBeDisabled();
    expect(screen.getByLabelText('Manual manager')).toBeDisabled();
    rerender(<Harness controller={controller} section="endpoints" target={{ ...context, ownership: { status: 'controller' } }} />);
    expect(screen.getByLabelText('Backend 1 address')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add backend' })).not.toBeInTheDocument();
  });
  it('keeps denied lookups distinct from empty and retains existing association', async () => {
    const controller = new ResourceEditorController(initial);
    render(<Harness controller={controller} section="association" lookup={{ status: 'denied', message: 'Access denied.' }} />);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Service lookup' })).toHaveTextContent('access denied'));
    expect(screen.getByLabelText('Existing Service (optional)')).toHaveValue('external-api');
    expect(screen.queryByText(/No Services found/)).not.toBeInTheDocument();
  });
  it('blocks association with a known selector Service, without claiming selectorless from missing facts', async () => {
    const validity = vi.fn();
    render(<Harness controller={new ResourceEditorController(initial)} section="association" validity={validity} lookup={{ status: 'ready', items: [{ name: 'external-api', namespace: 'demo', serviceSelector: 'present' }] }} />);
    await waitFor(() => expect(validity).toHaveBeenLastCalledWith(expect.stringContaining('selectorless')));
    expect(screen.getByLabelText('Existing Service (optional)')).toHaveValue('external-api');
  });
});
