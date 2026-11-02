import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { ResourceEditorController, createResourceEditorDraft } from '../../resourceEditorController';
import IngressClassForm from './IngressClassForm';
import NetworkPolicyForm from './NetworkPolicyForm';
import ServiceCIDRForm from './ServiceCIDRForm';
import IPAddressForm from './IPAddressForm';
import { resourceEditors } from './index';
import { DEFAULT_CLASS, DUAL_STACK_APPEND, controllerPath, parameterSegment, parseCIDR, portName, strictSubset, unsupportedShape, validateNetworking } from './model';

const references: ResourceEditorFormProps['references'] = { list: async () => ({ status: 'ready', items: [] }) };
const actions: ResourceEditorFormProps['actions'] = { execute: async () => ({ status: 'unavailable', message: 'Fixture transport; no live action.' }) };
function mount(kind: string, section: string, source: string, intent: 'create' | 'edit' | 'inspect' = 'create', features: Record<string, 'available'> = {}) {
  const contribution = resourceEditors.find(editor => editor.targets.some(target => target.kind === kind))!;
  const target = contribution.targets[0];
  const context: ResourceEditorContext = { ...target, connectionID: 'fixture-only', intent, ownership: { status: 'application' }, capabilities: { create: 'available', update: 'available', delete: 'available', get: 'available', list: 'available', actions: {} }, discovery: { status: 'available', features }, schema: { status: 'available' } };
  const controller = new ResourceEditorController(source, 'networking-test');
  const validity = vi.fn();
  const Form = kind === 'NetworkPolicy' ? NetworkPolicyForm : kind === 'IngressClass' ? IngressClassForm : kind === 'ServiceCIDR' ? ServiceCIDRForm : IPAddressForm;
  function Harness() {
    const [, update] = useState(0);
    const draft = controller.draft();
    return <Form context={context} draft={draft} baseline={createResourceEditorDraft(source, 'baseline', 0)} section={section} disabled={!!contribution.readOnly?.(draft, context)} references={references} actions={actions} onValidityChange={validity} patch={request => { const result = controller.patch(request, contribution, context); if (result.status === 'accepted') update(value => value + 1); return result; }} />;
  }
  render(<Harness />);
  return { controller, validity, context, contribution };
}
const policy = `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: edge, namespace: preview}
spec:
  podSelector: {matchLabels: {app: api}}
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector: {matchLabels: {team: platform}}
          podSelector: {matchLabels: {app: ingress}}
      ports:
        - port: 80 # keep destination comment
          endPort: 8080
          protocol: TCP
          vendorLimit: 900719925474099312345
`;

async function choose(label: string, option: string) {
  fireEvent.click(screen.getByLabelText(label));
  const item = await screen.findByRole('option', { name: option });
  fireEvent.pointerDown(item, { pointerType: 'mouse', button: 0 });
  fireEvent.pointerUp(item, { pointerType: 'mouse', button: 0 });
  fireEvent.click(item);
}

describe('networking canonical editing behavior', () => {
  it('holds partial numeric text locally across sibling revisions and retains exact unknown fields', () => {
    const { controller, validity } = mount('NetworkPolicy', 'ingress', policy);
    fireEvent.change(screen.getByLabelText('ingress rule 1 port 1 start'), { target: { value: '' } });
    expect(controller.getSource()).toBe(policy);
    expect(validity).toHaveBeenLastCalledWith('Enter a whole port number from 1–65535.');
    fireEvent.change(screen.getByLabelText('ingress rule 1 port 1 end (optional)'), { target: { value: '9090' } });
    expect(screen.getByLabelText('ingress rule 1 port 1 start')).toHaveValue('');
    expect(controller.draft().get(['spec', 'ingress', 0, 'ports', 0, 'port'])).toBe(80n);
    fireEvent.change(screen.getByLabelText('ingress rule 1 port 1 start'), { target: { value: '443' } });
    expect(controller.draft().get(['spec', 'ingress', 0, 'ports', 0, 'port'])).toBe(443n);
    expect(controller.draft().get(['spec', 'ingress', 0, 'ports', 0, 'vendorLimit'])).toBe(900719925474099312345n);
    expect(controller.getSource()).toContain('# keep destination comment');
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('keeps namespace and Pod selectors ANDed when editing one selector leaf', () => {
    const { controller } = mount('NetworkPolicy', 'ingress', policy);
    fireEvent.change(screen.getByLabelText('ingress rule 1 peer 1 Namespaces label value team'), { target: { value: 'operations' } });
    expect(controller.draft().get(['spec', 'ingress', 0, 'from', 0, 'namespaceSelector', 'matchLabels', 'team'])).toBe('operations');
    expect(controller.draft().get(['spec', 'ingress', 0, 'from', 0, 'podSelector', 'matchLabels', 'app'])).toBe('ingress');
  });
  it('converts numeric ports to names atomically without retaining endPort', async () => {
    const { controller, validity } = mount('NetworkPolicy', 'ingress', policy);
    await choose('ingress rule 1 port 1 port type', 'Named Pod port');
    expect(controller.draft().get(['spec', 'ingress', 0, 'ports', 0, 'port'])).toBe(80n);
    expect(validity).toHaveBeenLastCalledWith('Enter a valid port for the selected type.');
    fireEvent.change(screen.getByLabelText('ingress rule 1 port 1 name'), { target: { value: 'https' } });
    expect(controller.draft().get(['spec', 'ingress', 0, 'ports', 0, 'port'])).toBe('https');
    expect(controller.draft().has(['spec', 'ingress', 0, 'ports', 0, 'endPort'])).toBe(false);
    expect(controller.draft().get(['spec', 'ingress', 0, 'ports', 0, 'vendorLimit'])).toBe(900719925474099312345n);
  });
  it('cancels an invalid alternate port branch without leaving hidden validity errors', async () => {
    const { controller, validity } = mount('NetworkPolicy', 'ingress', policy);
    await choose('ingress rule 1 port 1 port type', 'Named Pod port');
    fireEvent.change(screen.getByLabelText('ingress rule 1 port 1 name'), { target: { value: '123' } });
    await choose('ingress rule 1 port 1 port type', 'Number / range');
    expect(controller.draft().get(['spec', 'ingress', 0, 'ports', 0, 'port'])).toBe(80n);
    expect(screen.getByLabelText('ingress rule 1 port 1 start')).toHaveValue('80');
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('keeps a partial port attached to its row after removing an earlier row', () => {
    const source = 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata: {name: edge, namespace: preview}\nspec: {podSelector: {}, policyTypes: [Ingress], ingress: [{ports: [{port: 80}, {port: 443}]}]}\n';
    const { controller } = mount('NetworkPolicy', 'ingress', source);
    fireEvent.change(screen.getByLabelText('ingress rule 1 port 2 start'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove ingress rule 1 port 1' }));
    expect(screen.getByLabelText('ingress rule 1 port 1 start')).toHaveValue('');
    expect(controller.draft().get(['spec', 'ingress', 0, 'ports', 0, 'port'])).toBe(443n);
    fireEvent.change(screen.getByLabelText('ingress rule 1 port 1 start'), { target: { value: '8443' } });
    expect(controller.draft().get(['spec', 'ingress', 0, 'ports', 0, 'port'])).toBe(8443n);
  });
  it('adds and removes peers without replacing existing rules or unknown siblings', () => {
    const { controller } = mount('NetworkPolicy', 'ingress', policy);
    fireEvent.click(screen.getByRole('button', { name: 'Add peer' }));
    expect(controller.draft().has(['spec', 'ingress', 0, 'from', 1, 'podSelector'])).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove ingress rule 1 peer 2' }));
    expect(controller.draft().has(['spec', 'ingress', 0, 'from', 1])).toBe(false);
    expect(controller.draft().get(['spec', 'ingress', 0, 'ports', 0, 'vendorLimit'])).toBe(900719925474099312345n);
  });
  it('locks the IngressClass controller input on edit', () => {
    mount('IngressClass', 'controller', 'apiVersion: networking.k8s.io/v1\nkind: IngressClass\nmetadata: {name: edge}\nspec: {controller: example.net/controller}\n', 'edit');
    expect(screen.getByLabelText('Controller')).toHaveAttribute('readonly');
  });
  it('changes one parameter leaf without replacing controller configuration or unknown fields', () => {
    const source = 'apiVersion: networking.k8s.io/v1\nkind: IngressClass\nmetadata: {name: edge}\nspec:\n  controller: example.net/controller\n  parameters: {apiGroup: example.net, kind: Settings, name: old, vendor: 900719925474099312345}\n';
    const { controller } = mount('IngressClass', 'parameters', source, 'edit');
    fireEvent.change(screen.getByLabelText('Parameter name'), { target: { value: 'new' } });
    expect(controller.draft().get(['spec', 'parameters', 'vendor'])).toBe(900719925474099312345n);
    expect(controller.draft().get(['spec', 'controller'])).toBe('example.net/controller');
  });
  it('writes the default class annotation as a string and leaves unrelated metadata untouched', async () => {
    const { controller } = mount('IngressClass', 'controller', 'apiVersion: networking.k8s.io/v1\nkind: IngressClass\nmetadata: {name: edge, labels: {team: networking}}\nspec: {controller: example.net/controller}\n');
    await choose('Default for classless Ingresses', 'Default class');
    expect(controller.draft().get(['metadata', 'annotations', DEFAULT_CLASS])).toBe('true');
    expect(controller.draft().get(['metadata', 'labels', 'team'])).toBe('networking');
  });
  it('gates ServiceCIDR append and keeps same-family validation out of canonical source', () => {
    const source = 'apiVersion: networking.k8s.io/v1\nkind: ServiceCIDR\nmetadata: {name: extra}\nspec: {cidrs: [10.96.0.0/16]}\n';
    const { controller, validity } = mount('ServiceCIDR', 'ranges', source, 'edit', { [DUAL_STACK_APPEND]: 'available' });
    expect(screen.getByLabelText('Primary CIDR')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Add opposite-family range' }));
    fireEvent.change(screen.getByLabelText('Opposite-family CIDR'), { target: { value: '10.97.0.0/16' } });
    expect(controller.getSource()).toBe(source);
    expect(validity).toHaveBeenLastCalledWith('Complete the second range or cancel it.');
    fireEvent.change(screen.getByLabelText('Opposite-family CIDR'), { target: { value: '2001:db8::/108' } });
    expect(controller.draft().get(['spec', 'cidrs', 0])).toBe('10.96.0.0/16');
    expect(controller.draft().get(['spec', 'cidrs', 1])).toBe('2001:db8::/108');
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('does not offer append without confirmed installed-version support', () => {
    mount('ServiceCIDR', 'ranges', 'apiVersion: networking.k8s.io/v1\nkind: ServiceCIDR\nmetadata: {name: extra}\nspec: {cidrs: [10.96.0.0/16]}\n', 'edit');
    expect(screen.queryByRole('button', { name: 'Add opposite-family range' })).not.toBeInTheDocument();
  });
  it('keeps allocator-owned IPAddress inspection non-mutating', () => {
    const { controller, contribution, context } = mount('IPAddress', 'allocation', 'apiVersion: networking.k8s.io/v1\nkind: IPAddress\nmetadata: {name: 10.96.0.1}\nspec: {parentRef: {resource: services, namespace: preview, name: api}}\n', 'inspect');
    expect(screen.getByText('Allocator-owned · inspection only')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: controller.revision, operations: [{ op: 'set', path: ['spec', 'parentRef', 'name'], value: 'different' }] }, contribution, context).status).toBe('forbidden');
  });
});

describe('networking validation boundaries', () => {
  it('accepts API controller path characters and dotted reference names, but not adjacent port hyphens', () => {
    expect(controllerPath('example.net/controller:v2')).toBe(true);
    expect(controllerPath('example.net/controller%20path')).toBe(true);
    expect(parameterSegment('edge.options')).toBe(true);
    expect(parameterSegment('..')).toBe(false);
    expect(parameterSegment('edge/options')).toBe(false);
    expect(portName('http--tls')).toBe(false);
    expect(portName('https-tls')).toBe(true);
  });
  it('uses exact IPv6 containment and rejects non-network ServiceCIDRs', () => {
    expect(strictSubset(parseCIDR('2001:db8::/32')!, parseCIDR('2001:db8:1::/48')!)).toBe(true);
    expect(strictSubset(parseCIDR('2001:db8::/32')!, parseCIDR('2001:db9::/48')!)).toBe(false);
    expect(strictSubset(parseCIDR('10.0.0.0/8')!, parseCIDR('10.0.0.0/8')!)).toBe(false);
    expect(parseCIDR('10.0.0.1/24')).toBeNull();
    expect(parseCIDR('2001:0db8::/32')).toBeNull();
  });
  it('rejects named-port ranges, mixed peer branches, and unsupported scalar shapes without rewriting source', () => {
    const context: ResourceEditorContext = { group: 'networking.k8s.io', version: 'v1', kind: 'NetworkPolicy', resource: 'networkpolicies', scope: 'Namespaced', connectionID: 'fixture', intent: 'create', capabilities: { create: 'available', update: 'available', delete: 'denied', list: 'available', get: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } };
    const invalid = createResourceEditorDraft('apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nspec: {podSelector: {}, ingress: [{ports: [{port: https, endPort: 443}], from: [{podSelector: {}, ipBlock: {cidr: 10.0.0.0/8}}]}]}\n', 'validation', 0);
    expect(validateNetworking(invalid, context).map(issue => issue.message)).toEqual(expect.arrayContaining(['Range requires a numeric start and end ≥ start.', 'IP blocks cannot include selectors.']));
    const unsupported = createResourceEditorDraft('apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nspec: {podSelector: false}\n', 'unsupported', 0);
    expect(unsupportedShape(unsupported, context)).toContain('unsupported field shape');
  });
});
