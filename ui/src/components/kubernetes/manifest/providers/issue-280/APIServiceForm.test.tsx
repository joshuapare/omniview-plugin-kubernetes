import { useCallback, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorFormProps, ResourceEditorReferenceService } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import APIServiceForm from './APIServiceForm';
import { resourceEditors } from './index';
import { target } from './apiService';

const context: ResourceEditorContext = { ...target, connectionID: 'fixture-only', intent: 'edit', capabilities: { create: 'available', update: 'available', delete: 'denied', get: 'available', list: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } };
const source = `apiVersion: apiregistration.k8s.io/v1
kind: APIService
metadata: {name: v1.widgets.example.test}
spec:
  group: widgets.example.test
  version: v1
  groupPriorityMinimum: 2000
  versionPriority: 10
  service: {namespace: extensions, name: widgets}
  caBundle: Zml4dHVyZS1vbmx5
  retained: 9007199254740993
`;
const references: ResourceEditorReferenceService = { list: async () => ({ status: 'ready', items: [] }) };
const actions: ResourceEditorFormProps['actions'] = { execute: async () => ({ status: 'unavailable', message: 'Fixture only.' }) };
function Harness({ controller, section = 'registration', onValidityChange = () => {}, lookup = references }: { controller: ResourceEditorController; section?: string; onValidityChange?: ResourceEditorFormProps['onValidityChange']; lookup?: ResourceEditorReferenceService }) {
  const [, rerender] = useState(0);
  const patch = useCallback<ResourceEditorFormProps['patch']>(request => {
    const result = controller.patch(request, resourceEditors[0], context);
    if (result.status === 'accepted') rerender(value => value + 1);
    return result;
  }, [controller]);
  return <APIServiceForm context={context} draft={controller.draft(resourceEditors[0].sensitivePaths)} section={section} disabled={false} patch={patch} onValidityChange={onValidityChange} references={lookup} actions={actions} />;
}

describe('APIService production fields', () => {
  it('keeps invalid priority local across sibling changes and section navigation', () => {
    const controller = new ResourceEditorController(source, 'partial');
    const validity = vi.fn();
    const rendered = render(<Harness controller={controller} onValidityChange={validity} />);
    fireEvent.change(screen.getByLabelText('Group priority (1–20000)'), { target: { value: '' } });
    expect(controller.draft().get(['spec', 'groupPriorityMinimum'])).toBe(2000n);
    fireEvent.change(screen.getByLabelText('Version priority (1–1000)'), { target: { value: '25' } });
    expect(screen.getByLabelText('Group priority (1–20000)')).toHaveValue('');
    expect(validity).toHaveBeenLastCalledWith('Enter a whole number from 1 to 20000.');
    rendered.rerender(<Harness controller={controller} section="availability" onValidityChange={validity} />);
    rendered.rerender(<Harness controller={controller} section="registration" onValidityChange={validity} />);
    expect(screen.getByLabelText('Group priority (1–20000)')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Group priority (1–20000)'), { target: { value: '20000' } });
    expect(controller.draft().get(['spec', 'groupPriorityMinimum'])).toBe(20000n);
    expect(controller.getSource()).toContain('9007199254740993');
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('locks edit identity while allowing mutable priorities', () => {
    render(<Harness controller={new ResourceEditorController(source, 'identity')} />);
    expect(screen.getByLabelText('API group')).toBeDisabled();
    expect(screen.getByLabelText('API version')).toBeDisabled();
    expect(screen.getByLabelText('Version priority (1–1000)')).not.toBeDisabled();
  });
  it('retains manual Service references when lookup is denied and omits optional default port', async () => {
    const controller = new ResourceEditorController(source, 'lookup');
    const lookup: ResourceEditorReferenceService = { list: vi.fn(async () => ({ status: 'denied', message: 'Denied.' })) };
    render(<Harness controller={controller} section="service" lookup={lookup} />);
    expect(await screen.findAllByText('Reference access denied. Enter a name manually.')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Service name'), { target: { value: 'manual-service' } });
    expect(controller.draft().get(['spec', 'service', 'name'])).toBe('manual-service');
    fireEvent.change(screen.getByLabelText('Service HTTPS port'), { target: { value: '8443' } });
    fireEvent.change(screen.getByLabelText('Service HTTPS port'), { target: { value: '' } });
    expect(controller.draft().has(['spec', 'service', 'port'])).toBe(false);
    expect(controller.getSource()).toContain('caBundle: Zml4dHVyZS1vbmx5');
  });
  it('imports exact bytes without exposing CA content or filename', async () => {
    const controller = new ResourceEditorController(source, 'import');
    render(<Harness controller={controller} section="service" />);
    const file = new File(['fixture'], 'private-name.pem');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([0, 255, 13, 10]).buffer });
    fireEvent.change(screen.getByLabelText('Replace CA bundle'), { target: { files: [file] } });
    await waitFor(() => expect(controller.draft().get(['spec', 'caBundle'])).toBe('AP8NCg=='));
    expect(screen.queryByText('AP8NCg==')).not.toBeInTheDocument();
    expect(screen.queryByText('private-name.pem')).not.toBeInTheDocument();
    expect(controller.draft().get(['spec', 'retained'])).toBe(9007199254740993n);
  });
  it('rejects a late CA file read after canonical revision changes', async () => {
    const controller = new ResourceEditorController(source, 'stale-import');
    const rendered = render(<Harness controller={controller} section="service" />);
    const { promise: pending, resolve: finish } = Promise.withResolvers<ArrayBuffer>();
    const file = new File(['fixture'], 'hidden.pem');
    Object.defineProperty(file, 'arrayBuffer', { value: () => pending });
    fireEvent.change(screen.getByLabelText('Replace CA bundle'), { target: { files: [file] } });
    controller.syncSource(source.replace('  versionPriority: 10', '  versionPriority: 20'));
    rendered.rerender(<Harness controller={controller} section="service" />);
    finish(new Uint8Array([0, 255, 13, 10]).buffer);
    expect(await screen.findByText('Draft changed during import. Select the CA file again.')).toBeInTheDocument();
    expect(controller.draft().get(['spec', 'caBundle'])).toBe('Zml4dHVyZS1vbmx5');
    expect(controller.draft().get(['spec', 'versionPriority'])).toBe(20n);
  });
  it('never displays arbitrary controller messages in availability', () => {
    const controller = new ResourceEditorController(`${source}status:\n  conditions:\n    - type: Available\n      status: "False"\n      reason: MissingEndpoints\n      message: fixture-private-message\n`, 'status');
    render(<Harness controller={controller} section="availability" />);
    expect(screen.getByText('MissingEndpoints')).toBeInTheDocument();
    expect(screen.getByText('Details hidden for privacy')).toBeInTheDocument();
    expect(screen.queryByText('fixture-private-message')).not.toBeInTheDocument();
  });
});
