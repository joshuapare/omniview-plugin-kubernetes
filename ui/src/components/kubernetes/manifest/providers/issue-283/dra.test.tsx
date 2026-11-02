import { useReducer } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import type { ResourceEditorContext, ResourceEditorContribution, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import ClaimsForm from './ClaimsForm';
import DeviceClassForm from './DeviceClassForm';
import DeviceTaintRuleForm from './DeviceTaintRuleForm';
import ResourceSliceForm from './ResourceSliceForm';
import { allocationOperations, branchOperations, claimUnsupported, positiveCount, requestBodyPath, validateClaims } from './model';
import { resourceEditors } from './index';

afterEach(cleanup);
const references = { list: vi.fn(async () => ({ status: 'ready' as const, items: [] })) };
const actions = { execute: vi.fn(async () => ({ status: 'unavailable' as const, message: 'Isolated regression. No live mutation.' })) };
function contribution(kind: string): ResourceEditorContribution { return resourceEditors.find(item => item.targets.some(target => target.kind === kind))!; }
function context(kind = 'ResourceClaim', intent: ResourceEditorContext['intent'] = 'create', version = 'v1'): ResourceEditorContext {
  const target = contribution(kind).targets.find(target => target.version === version)!;
  return { ...target, intent, connectionID: 'fixture', namespace: target.scope === 'Namespaced' ? 'fixture' : undefined, ownership: { status: 'application' }, capabilities: { create: 'available', update: 'available', delete: 'available', list: 'available', get: 'available', actions: {} }, discovery: { status: 'available', features: { DRAPrioritizedList: 'available', DRAAdminAccess: 'available', DRADeviceTaints: 'available', DRADeviceTaintRules: 'available' } }, schema: { status: 'available' } };
}
function Harness({ controller, ctx, section = 'requests', validity = () => undefined }: { controller: ResourceEditorController; ctx: ResourceEditorContext; section?: string; validity?: (error: string | null) => void }) {
  const [, rerender] = useReducer(value => value + 1, 0);
  const descriptor = contribution(ctx.kind);
  const props: ResourceEditorFormProps = { context: ctx, draft: controller.draft(descriptor.sensitivePaths), disabled: false, section, references, actions, onValidityChange: validity, patch: request => { const result = controller.patch(request, descriptor, ctx); if (result.status === 'accepted') rerender(); return result; } };
  const Form = ctx.kind === 'DeviceClass' ? DeviceClassForm : ctx.kind === 'DeviceTaintRule' ? DeviceTaintRuleForm : ctx.kind === 'ResourceSlice' ? ResourceSliceForm : ClaimsForm;
  return <Form {...props} />;
}
const claim = 'apiVersion: resource.k8s.io/v1\nkind: ResourceClaim\nmetadata: {name: claim, namespace: fixture}\nspec:\n  devices:\n    requests:\n      - name: gpu\n        retained: untouched\n        exactly:\n          deviceClassName: accelerators\n          count: 2 # device count\n    constraints: [{matchAttribute: vendor.example/model}]\n';
async function choose(label: string, option: string) {
  fireEvent.click(screen.getByLabelText(label));
  const item = await screen.findByRole('option', { name: option });
  fireEvent.pointerDown(item, { pointerType: 'mouse', button: 0 });
  fireEvent.pointerUp(item, { pointerType: 'mouse', button: 0 }); fireEvent.click(item);
}

describe('DRA canonical behavior', () => {
  it('edits DeviceClass CEL leaves without exposing or replacing opaque driver configuration', () => {
    const source = 'apiVersion: resource.k8s.io/v1\nkind: DeviceClass\nmetadata: {name: accelerators}\nspec:\n  selectors:\n    - cel: {expression: "true"} # preserve selector comment\n  config:\n    - opaque:\n        driver: driver.example\n        parameters: {vendorOption: private-fixture}\n';
    const controller = new ResourceEditorController(source);
    const ctx = context('DeviceClass', 'edit');
    const view = render(<Harness controller={controller} ctx={ctx} section="selection" />);
    fireEvent.change(screen.getByLabelText('CEL expression 1'), { target: { value: 'device.driver == "driver.example"' } });
    expect(controller.draft().get(['spec', 'config', 0, 'opaque', 'parameters', 'vendorOption'])).toBe('private-fixture');
    expect(controller.getSource()).toContain('# preserve selector comment');
    expect(screen.queryByText('private-fixture')).toBeNull();
    view.rerender(<Harness controller={controller} ctx={ctx} section="advanced" />);
    expect(screen.getByLabelText('Extended resource name')).toHaveAttribute('readonly');
  });
  it('keeps partial count local across sibling edits and preserves exact numbers, comments and unknown fields', () => {
    const controller = new ResourceEditorController(claim); const validity = vi.fn();
    render(<Harness controller={controller} ctx={context()} validity={validity} />);
    fireEvent.change(screen.getByLabelText('Device count'), { target: { value: '' } });
    expect(controller.getSource()).toBe(claim);
    expect(screen.getByLabelText('Device count')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Device count'), { target: { value: '-' } });
    expect(controller.getSource()).toBe(claim);
    fireEvent.change(screen.getByLabelText('Device class'), { target: { value: 'new-accelerators' } });
    expect(screen.getByLabelText('Device count')).toHaveValue('-');
    expect(validity).toHaveBeenLastCalledWith('Enter a positive 64-bit whole number.');
    fireEvent.change(screen.getByLabelText('Device count'), { target: { value: '9007199254740993' } });
    expect(controller.draft().get(['spec', 'devices', 'requests', 0, 'exactly', 'count'])).toBe(9007199254740993n);
    expect(controller.getSource()).toContain('# device count');
    expect(controller.draft().get(['spec', 'devices', 'requests', 0, 'retained'])).toBe('untouched');
    expect(controller.draft().get(['spec', 'devices', 'constraints', 0, 'matchAttribute'])).toBe('vendor.example/model');
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('rejects fractional, zero and overflowing counts without coercion', () => {
    for (const value of ['0', '-1', '1.5', '1e3', '9223372036854775808']) expect(positiveCount(value).valid).toBe(false);
    expect(positiveCount('9223372036854775807')).toEqual({ valid: true, value: 9223372036854775807n });
  });
  it('uses flat v1beta1 paths instead of introducing the stable-version exactly wrapper', () => {
    const source = 'apiVersion: resource.k8s.io/v1beta1\nkind: ResourceClaim\nmetadata: {name: claim, namespace: fixture}\nspec: {devices: {requests: [{name: gpu, deviceClassName: accelerators, count: 2}]}}\n';
    const controller = new ResourceEditorController(source); const ctx = context('ResourceClaim', 'create', 'v1beta1');
    render(<Harness controller={controller} ctx={ctx} />);
    fireEvent.change(screen.getByLabelText('Device count'), { target: { value: '7' } });
    expect(controller.draft().get(['spec', 'devices', 'requests', 0, 'count'])).toBe(7n);
    expect(controller.draft().has(['spec', 'devices', 'requests', 0, 'exactly'])).toBe(false);
  });
  it('switches All atomically and never rewrites selectors or opaque sibling configuration', () => {
    const controller = new ResourceEditorController(claim); const ctx = context(); const path = requestBodyPath(ctx, ['spec', 'devices', 'requests', 0]);
    const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: allocationOperations(controller.draft(), path, 'All') }, contribution('ResourceClaim'), ctx);
    expect(result.status).toBe('accepted');
    expect(controller.draft().has([...path, 'count'])).toBe(false);
    expect(controller.draft().get([...path, 'deviceClassName'])).toBe('accelerators');
    expect(controller.draft().get(['spec', 'devices', 'requests', 0, 'retained'])).toBe('untouched');
  });
  it('refuses a branch switch that would erase advanced selector fields', () => {
    const source = claim.replace('count: 2 # device count', 'count: 2\n          selectors: [{cel: {expression: "true"}}]');
    const controller = new ResourceEditorController(source);
    expect(branchOperations(controller.draft(), context(), ['spec', 'devices', 'requests', 0], true)).toBe('Keep advanced request fields in YAML before changing request strategy.');
    expect(controller.getSource()).toBe(source);
  });
  it.each(['create', 'edit', 'inspect'] as const)('keeps template metadata stable across sections and form remounts for %s', intent => {
    const source = 'apiVersion: resource.k8s.io/v1\nkind: ResourceClaimTemplate\nmetadata: {name: template, namespace: fixture}\nspec:\n  metadata:\n    labels: {team: research}\n    annotations: {credential: private-template-value}\n  extension: 9007199254740993 # preserve template extension\n  spec:\n    devices:\n      requests: [{name: gpu, exactly: {deviceClassName: accelerators, count: 2}}]\n      config: [{opaque: {driver: driver.example, parameters: {credential: private-driver-value}}}]\n';
    const controller = new ResourceEditorController(source);
    const ctx = context('ResourceClaimTemplate', intent);
    const validity = vi.fn();
    const view = render(<Harness controller={controller} ctx={ctx} section="advanced" validity={validity} />);
    expect(screen.getByLabelText('Value team')).toHaveValue('research');
    expect(screen.getByLabelText('Value team')).toHaveProperty('disabled', intent !== 'create');
    expect(validity).toHaveBeenLastCalledWith(null);
    if (intent === 'create') {
      fireEvent.change(screen.getByLabelText('Value team'), { target: { value: 'compute' } });
      expect(controller.draft().get(['spec', 'metadata', 'labels', 'team'])).toBe('compute');
    }
    view.rerender(<Harness controller={controller} ctx={ctx} section="requests" validity={validity} />);
    if (intent === 'create') {
      fireEvent.change(screen.getByLabelText('Device count'), { target: { value: '7' } });
      expect(controller.draft().get(['spec', 'spec', 'devices', 'requests', 0, 'exactly', 'count'])).toBe(7n);
      expect(controller.draft().has(['spec', 'devices'])).toBe(false);
    }
    // Source mode unmounts the contributor; returning mounts the same canonical draft.
    view.rerender(<></>);
    view.rerender(<Harness controller={controller} ctx={ctx} section="advanced" validity={validity} />);
    expect(screen.getByLabelText('Value team')).toHaveValue(intent === 'create' ? 'compute' : 'research');
    expect(screen.queryByText(/private-template-value|private-driver-value/)).toBeNull();
    const retained = parse(controller.getSource(), { intAsBigInt: true });
    expect(retained.spec.metadata.annotations.credential).toBe('private-template-value');
    expect(retained.spec.spec.devices.config[0].opaque.parameters.credential).toBe('private-driver-value');
    expect(retained.spec.extension).toBe(9007199254740993n);
    expect(controller.getSource()).toContain('# preserve template extension');
    if (intent !== 'create') {
      expect(controller.getSource()).toBe(source);
      expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: controller.revision, operations: [{ op: 'set', path: ['spec', 'metadata', 'labels', 'team'], value: 'forbidden' }] }, contribution(ctx.kind), ctx).status).toBe('forbidden');
    }
  });
  it('locks template edits and generated claims, including source patch attempts', () => {
    const source = 'apiVersion: resource.k8s.io/v1\nkind: ResourceClaimTemplate\nmetadata: {name: template, namespace: fixture}\nspec: {metadata: {labels: {team: research}}, spec: {devices: {requests: [{name: gpu, exactly: {deviceClassName: accelerators, count: 2}}]}}}\n';
    const controller = new ResourceEditorController(source); const ctx = context('ResourceClaimTemplate', 'edit');
    render(<Harness controller={controller} ctx={ctx} />);
    expect(screen.getByRole('button', { name: 'Add device request' })).toBeDisabled();
    expect(screen.getByLabelText('Device class')).toHaveAttribute('readonly');
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'spec', 'devices', 'requests'], value: [] }] }, contribution(ctx.kind), ctx).status).toBe('forbidden');
    cleanup();
    const generated = new ResourceEditorController(claim.replace('metadata: {name: claim, namespace: fixture}', 'metadata: {name: claim, namespace: fixture, ownerReferences: [{apiVersion: v1, kind: Pod, name: consumer, uid: fixture}]}'));
    render(<Harness controller={generated} ctx={context()} />);
    expect(screen.getByLabelText('Device class')).toHaveAttribute('readonly');
    expect(screen.getByText(/Controller-owned claim/)).toBeInTheDocument();
    expect(generated.patch({ sessionID: generated.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'devices', 'requests', 0, 'name'], value: 'changed' }] }, contribution('ResourceClaim'), context()).status).toBe('forbidden');
  });
  it('detects generated extended-resource claims without reading their masked annotation value', () => {
    const source = claim.replace('metadata: {name: claim, namespace: fixture}', 'metadata: {name: claim, namespace: fixture, annotations: {resource.kubernetes.io/extended-resource-claim: "true"}}');
    const controller = new ResourceEditorController(source);
    const descriptor = contribution('ResourceClaim');
    const publicDraft = controller.draft(descriptor.sensitivePaths);
    expect(typeof publicDraft.get(['metadata', 'annotations', 'resource.kubernetes.io/extended-resource-claim'])).toBe('object');
    expect(descriptor.readOnly?.(publicDraft, context())).toBe(true);
    render(<Harness controller={controller} ctx={context()} />);
    expect(screen.getByRole('button', { name: 'Add device request' })).toBeDisabled();
  });
  it('distinguishes omitted and empty taint selectors and exposes NoExecute consequence', async () => {
    const controller = new ResourceEditorController('apiVersion: resource.k8s.io/v1alpha3\nkind: DeviceTaintRule\nmetadata: {name: maintenance}\nspec: {taint: {key: maintenance, effect: NoExecute}}\n');
    render(<Harness controller={controller} ctx={context('DeviceTaintRule', 'create', 'v1alpha3')} section="policy" />);
    expect(controller.draft().has(['spec', 'deviceSelector'])).toBe(false);
    await choose('Target', 'All devices (empty selector)');
    expect(controller.draft().get(['spec', 'deviceSelector'])).toEqual({});
    expect(screen.getByText('Targets every device in the cluster.')).toBeInTheDocument();
    expect(screen.getByText(/NoExecute can evict/)).toBeInTheDocument();
    await choose('Target', 'No devices (selector omitted)');
    expect(controller.draft().has(['spec', 'deviceSelector'])).toBe(false);
  });
  it('keeps taint authoring locked when the independent rule gate is unknown', () => {
    const controller = new ResourceEditorController('apiVersion: resource.k8s.io/v1alpha3\nkind: DeviceTaintRule\nmetadata: {name: rule}\nspec: {taint: {key: maintenance, effect: None}}');
    const ctx = context('DeviceTaintRule', 'create', 'v1alpha3'); delete (ctx.discovery.features as Record<string, unknown>).DRADeviceTaintRules;
    render(<Harness controller={controller} ctx={ctx} section="policy" />);
    expect(screen.getByLabelText('Taint key')).toHaveAttribute('readonly');
    expect(screen.getByText(/DRADeviceTaintRules: unknown/)).toBeInTheDocument();
  });
  it('inspects wide pool generations without claiming pool completeness or exposing mutation controls', () => {
    const controller = new ResourceEditorController('apiVersion: resource.k8s.io/v1\nkind: ResourceSlice\nmetadata: {name: inventory}\nspec: {driver: driver.example, pool: {name: pool, generation: 9007199254740993, resourceSliceCount: 2}, allNodes: true, devices: [{name: gpu, capacity: {"driver.example/memory": {value: 16Gi}}}]}');
    render(<Harness controller={controller} ctx={context('ResourceSlice')} section="inventory" />);
    expect(screen.getByText('9007199254740993')).toBeInTheDocument();
    expect(screen.getByText('16Gi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add|Save|Create/ })).toBeNull();
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'driver'], value: 'other.example' }] }, contribution('ResourceSlice'), context('ResourceSlice')).status).toBe('forbidden');
  });
  it('retains unsupported scalar types and reports duplicate request names', () => {
    const unsupported = new ResourceEditorController(claim.replace('count: 2 # device count', 'count: "2"'));
    expect(claimUnsupported(unsupported.draft(), context())).toContain('unsupported scalar type');
    const controller = new ResourceEditorController(claim);
    const descriptor = contribution('ResourceClaim');
    controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'insert', path: ['spec', 'devices', 'requests'], index: 1, value: { name: 'gpu', exactly: { deviceClassName: 'accelerators' } } }] }, descriptor, context());
    expect(validateClaims(controller.draft(), context()).some(issue => issue.message === 'Request names must be unique.')).toBe(true);
  });
});
