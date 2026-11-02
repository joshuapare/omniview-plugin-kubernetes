import type { ResourceEditorContext, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useReducer, type ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResourceEditorController } from '../../resourceEditorController';

import CSIDriverForm from './CSIDriverForm';
import { storageFixtureContext, storageFixtures, type StorageFixtureKind } from './fixtures';
import { CSINodeForm, CSIStorageCapacityForm, VolumeAttachmentForm } from './InspectionForms';
import { integerError, parameterError, unsupportedShape } from './rules';
import StorageClassForm from './StorageClassForm';
import VolumeAttributesClassForm from './VolumeAttributesClassForm';

import { resourceEditors } from './index';

const forms: Record<StorageFixtureKind, ComponentType<ResourceEditorFormProps>> = { StorageClass: StorageClassForm, VolumeAttributesClass: VolumeAttributesClassForm, CSIDriver: CSIDriverForm, CSINode: CSINodeForm, CSIStorageCapacity: CSIStorageCapacityForm, VolumeAttachment: VolumeAttachmentForm };
const references = { list: vi.fn(async () => ({ status: 'ready' as const, items: [] })) };
const actions = { execute: vi.fn(async () => ({ status: 'unavailable' as const, message: 'Fixture only.' })) };
const validity = vi.fn();
function FormHarness({ kind, controller, section = 'overview', context = storageFixtureContext(kind) }: { kind: StorageFixtureKind; controller: ResourceEditorController; section?: string; context?: ResourceEditorContext }) {
  const [, refresh] = useReducer(value => value + 1, 0);
  const contribution = resourceEditors.find(editor => editor.targets.some(target => target.kind === kind))!;
  const Form = forms[kind];
  return <Form context={context} section={section} draft={controller.draft(contribution.sensitivePaths)} disabled={false} references={references} actions={actions} onValidityChange={validity}
    patch={request => { const result = controller.patch(request, contribution, context); if (result.status === 'accepted') refresh(); return result; }} />;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('storage domain editing', () => {
  it('keeps an empty canonical required driver separate from pending local edits', () => {
    const source = 'apiVersion: storage.k8s.io/v1\nkind: StorageClass\nmetadata: {name: empty}\n';
    const controller = new ResourceEditorController(source);
    const context = storageFixtureContext('StorageClass');
    const provider = resourceEditors.find(editor => editor.targets.some(target => target.kind === 'StorageClass'))!;
    render(<FormHarness kind="StorageClass" controller={controller} context={context} />);
    expect(screen.getByLabelText('Provisioner')).toHaveValue('');
    expect(validity).toHaveBeenLastCalledWith(null);
    expect(provider.validate!(controller.draft(), context).some(issue => issue.path[0] === 'provisioner')).toBe(true);
    expect(controller.getSource()).toBe(source);
    fireEvent.change(screen.getByLabelText('Provisioner'), { target: { value: 'invalid driver' } });
    expect(screen.getByLabelText('Provisioner')).toHaveValue('invalid driver');
    expect(controller.getSource()).toBe(source);
  });

  it('retains a partial driver locally, including a section round trip, without erasing the manifest', () => {
    const controller = new ResourceEditorController(storageFixtures.StorageClass);
    const view = render(<FormHarness kind="StorageClass" controller={controller} />);
    fireEvent.change(screen.getByLabelText('Provisioner'), { target: { value: '' } });
    expect(screen.getByLabelText('Provisioner')).toHaveValue('');
    expect(controller.getSource()).toBe(storageFixtures.StorageClass);
    view.rerender(<FormHarness kind="StorageClass" controller={controller} section="advanced" />);
    view.rerender(<FormHarness kind="StorageClass" controller={controller} />);
    expect(screen.getByLabelText('Provisioner')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'No dynamic provisioning' }));
    expect(controller.draft().get(['provisioner'])).toBe('kubernetes.io/no-provisioner');
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('patches topology leaves without dropping sibling extensions, comments or a wide integer', () => {
    const controller = new ResourceEditorController(storageFixtures.StorageClass);
    render(<FormHarness kind="StorageClass" controller={controller} section="advanced" />);
    fireEvent.change(screen.getByLabelText('Term 1 values 1'), { target: { value: 'fixture-b, fixture-c' } });
    expect(controller.draft().get(['allowedTopologies', 0, 'matchLabelExpressions', 0, 'values'])).toEqual(['fixture-b', 'fixture-c']);
    expect(controller.getSource()).toContain('futureRequirement: retained');
    expect(controller.getSource()).toContain('9007199254740993 # exact unknown scalar');
    expect(controller.getSource()).toContain('# preserve parameter comment');
    expect(controller.draft().get(['mountOptions', 1])).toBe('context=alpha,beta');
  });
  it('keeps parameter projections masked and writes only the new leaf', () => {
    const controller = new ResourceEditorController(storageFixtures.StorageClass);
    render(<FormHarness kind="StorageClass" controller={controller} />);
    expect(screen.getByLabelText('Value for storageTier')).toHaveValue('');
    expect(screen.getByLabelText('Value for storageTier')).toHaveAttribute('type', 'password');
    fireEvent.change(screen.getByLabelText('Parameter key'), { target: { value: 'performance' } });
    fireEvent.change(screen.getByLabelText('Parameter value'), { target: { value: 'balanced' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add parameter' }));
    expect(controller.draft().get(['parameters', 'storageTier'])).toBe('archive');
    expect(controller.draft().get(['parameters', 'performance'])).toBe('balanced');
    expect(controller.getSource()).toContain('# preserve parameter comment');
  });
  it('locks both volume attribute fields on edit without inventing PVC mutations', () => {
    const controller = new ResourceEditorController(storageFixtures.VolumeAttributesClass);
    render(<FormHarness kind="VolumeAttributesClass" controller={controller} context={storageFixtureContext('VolumeAttributesClass', 'edit')} />);
    expect(screen.getByLabelText('CSI driver')).toBeDisabled();
    expect(screen.getByLabelText('Value for storageTier')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add parameter' })).not.toBeInTheDocument();
    expect(controller.getSource()).toBe(storageFixtures.VolumeAttributesClass);
  });
  it('preserves invalid interval text and the old canonical value, then commits exact int64', () => {
    const controller = new ResourceEditorController(storageFixtures.CSIDriver);
    const view = render(<FormHarness kind="CSIDriver" controller={controller} />);
    fireEvent.change(screen.getByLabelText('Allocatable refresh interval (seconds)'), { target: { value: '9' } });
    expect(controller.draft().get(['spec', 'nodeAllocatableUpdatePeriodSeconds'])).toBe(30n);
    expect(validity).toHaveBeenLastCalledWith('Use 10–9223372036854775807 seconds.');
    view.rerender(<FormHarness kind="CSIDriver" controller={controller} section="tokens" />);
    view.rerender(<FormHarness kind="CSIDriver" controller={controller} />);
    expect(screen.getByLabelText('Allocatable refresh interval (seconds)')).toHaveValue('9');
    fireEvent.change(screen.getByLabelText('Allocatable refresh interval (seconds)'), { target: { value: '9007199254740993' } });
    expect(controller.getSource()).toContain('nodeAllocatableUpdatePeriodSeconds: 9007199254740993');
  });
  it('keeps empty token audience as text, validates duplicates and preserves unknown token fields', () => {
    const controller = new ResourceEditorController(storageFixtures.CSIDriver);
    render(<FormHarness kind="CSIDriver" controller={controller} section="tokens" />);
    fireEvent.change(screen.getByLabelText('Token audience 1'), { target: { value: '' } });
    expect(controller.draft().get(['spec', 'tokenRequests', 0, 'audience'])).toBe('');
    expect(controller.getSource()).toContain('futureTokenField: retained');
    fireEvent.click(screen.getByRole('button', { name: 'Add token request' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Each token audience must be unique.');
    expect(controller.draft().get(['spec', 'tokenRequests'])).toHaveLength(1);
  });
  it('retains an invalid sibling token draft when an earlier row is removed', () => {
    const source = storageFixtures.CSIDriver.replace('  futureDriverField: retained', '    - audience: second-audience\n      expirationSeconds: 1800\n  futureDriverField: retained');
    const controller = new ResourceEditorController(source);
    render(<FormHarness kind="CSIDriver" controller={controller} section="tokens" />);
    fireEvent.change(screen.getByLabelText('Token expiration 2 (seconds)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove request 1' }));
    expect(screen.getByLabelText('Token audience 1')).toHaveValue('second-audience');
    expect(screen.getByLabelText('Token expiration 1 (seconds)')).toHaveValue('5');
    expect(screen.getByLabelText('Token expiration 1 (seconds)')).toHaveAttribute('aria-invalid', 'true');
    expect(controller.draft().get(['spec', 'tokenRequests', 0, 'expirationSeconds'])).toBe(1800n);
  });
  it('does not infer leaf schema permission from an admitted parameter parent', () => {
    const controller = new ResourceEditorController(storageFixtures.StorageClass);
    const context = storageFixtureContext('StorageClass');
    context.schema.paths = context.schema.paths?.filter(path => !(path.length === 2 && path[0] === 'parameters' && path[1] === '*'));
    render(<FormHarness kind="StorageClass" controller={controller} context={context} />);
    fireEvent.change(screen.getByLabelText('Parameter key'), { target: { value: 'performance' } });
    fireEvent.change(screen.getByLabelText('Parameter value'), { target: { value: 'balanced' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add parameter' }));
    expect(controller.getSource()).toBe(storageFixtures.StorageClass);
    expect(screen.getByRole('alert')).toHaveTextContent('Schema does not admit this field.');
  });
  it('resets local partial fields synchronously when the canonical session changes', () => {
    const controller = new ResourceEditorController(storageFixtures.CSIDriver);
    const view = render(<FormHarness kind="CSIDriver" controller={controller} />);
    fireEvent.change(screen.getByLabelText('Allocatable refresh interval (seconds)'), { target: { value: '9' } });
    const replacement = new ResourceEditorController(storageFixtures.CSIDriver);
    view.rerender(<FormHarness kind="CSIDriver" controller={replacement} />);
    expect(screen.getByLabelText('Allocatable refresh interval (seconds)')).toHaveValue('30');
    expect(screen.getByLabelText('Allocatable refresh interval (seconds)')).toHaveAttribute('aria-invalid', 'false');
  });
  it('locks driver changes for unknown ownership, managed installation and unconfirmed gates', () => {
    const controller = new ResourceEditorController(storageFixtures.CSIDriver);
    const context = storageFixtureContext('CSIDriver'); delete context.ownership;
    const view = render(<FormHarness kind="CSIDriver" controller={controller} context={context} />);
    expect(screen.getByRole('button', { name: 'Both', exact: true })).toBeDisabled();
    const known = storageFixtureContext('CSIDriver'); known.discovery.features = {};
    view.rerender(<FormHarness kind="CSIDriver" controller={controller} context={known} />);
    expect(screen.getByLabelText('Allocatable refresh interval (seconds)')).toBeDisabled();
    controller.syncSource(storageFixtures.CSIDriver.replace('  name: csi.fixture.invalid', '  name: csi.fixture.invalid\n  labels:\n    app.kubernetes.io/managed-by: Helm'));
    view.rerender(<FormHarness kind="CSIDriver" controller={controller} context={known} />);
    expect(screen.getByRole('button', { name: 'Both', exact: true })).toBeDisabled();
  });
});
describe('storage ownership inspection', () => {
  it('renders kubelet registration without mutation or action controls', () => {
    render(<FormHarness kind="CSINode" controller={new ResourceEditorController(storageFixtures.CSINode)} />);
    expect(screen.getByText('fixture-node-id')).toBeInTheDocument();
    expect(screen.getByText('32')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(actions.execute).not.toHaveBeenCalled();
  });
  it('distinguishes missing capacity and topology from zero and all-node topology', () => {
    const controller = new ResourceEditorController(storageFixtures.CSIStorageCapacity.replace('capacity: 128Gi\n', '').replace('nodeTopology:\n  matchLabels:\n    topology.kubernetes.io/zone: fixture-a\n', ''));
    const view = render(<FormHarness kind="CSIStorageCapacity" controller={controller} />);
    expect(screen.getByText('Unknown — not zero')).toBeInTheDocument();
    expect(screen.getByText('No nodes')).toBeInTheDocument();
    controller.syncSource(controller.getSource() + 'capacity: "0"\nnodeTopology: {}\n');
    view.rerender(<FormHarness kind="CSIStorageCapacity" controller={controller} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('All nodes')).toBeInTheDocument();
  });
  it('never renders driver error messages or attachment metadata', () => {
    const source = storageFixtures.VolumeAttachment + '  attachmentMetadata:\n    private: masked-fixture-value\n';
    render(<FormHarness kind="VolumeAttachment" controller={new ResourceEditorController(source)} />);
    expect(screen.getByText('Protected controller data')).toBeInTheDocument();
    expect(screen.getByText('Reported — message hidden')).toBeInTheDocument();
    expect(screen.queryByText('masked-fixture-value')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('validates UTF-8 parameter size and exact duration bounds without echoing values', () => {
    expect(parameterError({ key: '界'.repeat(90000) }, false)).toBe('Parameters exceed 256 KiB.');
    expect(integerError('9223372036854775808', 10n)).not.toBeNull();
    expect(integerError('4294967297', 600n, 4294967296n)).not.toBeNull();
    const controller = new ResourceEditorController(storageFixtures.StorageClass.replace('mountOptions: ["ro", "context=alpha,beta"]', 'mountOptions: [3]'));
    expect(unsupportedShape(controller.draft(), storageFixtureContext('StorageClass'))).toContain('Source remains unchanged');
  });
});
