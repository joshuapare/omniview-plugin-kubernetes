import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorContribution, ResourceEditorFormProps, ResourceEditorReferenceService } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import RbacRoleForm from './RbacRoleForm';
import RbacBindingForm from './RbacBindingForm';
import { resourceEditors } from './index';
import { ruleBranchPatches, subjectKindPatches, unavailable, validate } from './model';

const roleSource = 'apiVersion: rbac.authorization.k8s.io/v1\nkind: Role\nmetadata: {name: reader, namespace: team}\nrules:\n  - verbs: [get, list]\n    apiGroups: [""]\n    resources: [pods] # keep resource comment\n    futureField: 9007199254740993\n  - verbs: [watch]\n    apiGroups: [apps]\n    resources: [deployments]\n';
const bindingSource = 'apiVersion: rbac.authorization.k8s.io/v1\nkind: RoleBinding\nmetadata: {name: readers, namespace: team}\nroleRef: {apiGroup: rbac.authorization.k8s.io, kind: Role, name: reader}\nsubjects:\n  - kind: ServiceAccount\n    apiGroup: ""\n    name: workload\n    namespace: team\n    futureField: retained\n';
function contextFor(contribution: ResourceEditorContribution, intent: ResourceEditorContext['intent'] = 'create'): ResourceEditorContext {
  return { ...contribution.targets[0], connectionID: 'fixture', namespace: 'team', intent, capabilities: { create: 'available', update: 'available', delete: 'unknown', get: 'available', list: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' }, ownership: { status: 'application' } };
}
const references: ResourceEditorReferenceService = { list: async () => ({ status: 'ready', items: [] }) };
function Harness({ source = roleSource, contribution = resourceEditors[0], intent = 'create', referenceService = references, validity = () => {} }: { source?: string; contribution?: ResourceEditorContribution; intent?: ResourceEditorContext['intent']; referenceService?: ResourceEditorReferenceService; validity?: (error: string | null) => void }) {
  const [controller] = useState(() => new ResourceEditorController(source, 'rbac-test'));
  const [, rerender] = useState(0);
  const context = contextFor(contribution, intent);
  const form: ResourceEditorFormProps = { context, draft: controller.draft(), section: contribution.sections[0].id, disabled: false, references: referenceService, actions: { execute: async () => ({ status: 'unavailable', message: 'Not used.' }) }, onValidityChange: validity, patch: request => {
    const result = controller.patch(request, contribution, context);
    if (result.status === 'accepted') rerender(result.revision);
    return result;
  } };
  const Form = contribution.targets[0].kind.endsWith('Binding') ? RbacBindingForm : RbacRoleForm;
  return <><Form {...form} /><output data-testid="canonical">{controller.getSource()}</output></>;
}

describe('RBAC canonical editing', () => {
  it('retains partial resource input locally and does not erase source or sibling rules', () => {
    const validity = vi.fn();
    render(<Harness validity={validity} />);
    fireEvent.change(screen.getByLabelText('Rule 1 resource 1'), { target: { value: '' } });
    expect(screen.getByLabelText('Rule 1 resource 1')).toHaveValue('');
    expect(screen.getByTestId('canonical').textContent).toContain('resources: [pods]');
    expect(validity).toHaveBeenLastCalledWith('Enter a value.');
    fireEvent.click(screen.getAllByRole('button', { name: 'patch', exact: true })[1]);
    expect(screen.getByLabelText('Rule 1 resource 1')).toHaveValue('');
    expect(validity).toHaveBeenLastCalledWith('Enter a value.');
    fireEvent.change(screen.getByLabelText('Rule 1 resource 1'), { target: { value: 'configmaps' } });
    const source = screen.getByTestId('canonical').textContent!;
    expect(source).toContain('configmaps');
    expect(source).toContain('keep resource comment');
    expect(source).toContain('9007199254740993');
    expect(source).toContain('deployments');
    expect(validity).toHaveBeenLastCalledWith(null);
  });

  it('locks edit roleRef but permits a leaf subject edit', () => {
    render(<Harness source={bindingSource} contribution={resourceEditors[2]} intent="edit" />);
    expect(screen.getByLabelText('Role name')).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('Subject 1 name'), { target: { value: 'new-workload' } });
    const source = screen.getByTestId('canonical').textContent!;
    expect(source).toContain('name: reader');
    expect(source).toContain('new-workload');
    expect(source).toContain('futureField: retained');
  });

  it('retains blank create role name locally without clearing the old reference', async () => {
    render(<Harness source={bindingSource} contribution={resourceEditors[2]} />);
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: '' } });
    expect(screen.getByLabelText('Role name')).toHaveValue('');
    expect(screen.getByTestId('canonical').textContent).toContain('name: reader');
    await screen.findByText('No references found. Enter a name manually.');
  });

  it('distinguishes denied reference lookup and keeps manual names usable', async () => {
    const list = vi.fn(async () => ({ status: 'denied' as const, message: 'Denied.' }));
    render(<Harness source={bindingSource} contribution={resourceEditors[2]} referenceService={{ list }} />);
    await screen.findByText('Reference access denied. Enter a name manually.');
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'unresolved-role' } });
    expect(screen.getByTestId('canonical').textContent).toContain('unresolved-role');
    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ group: 'rbac.authorization.k8s.io', version: 'v1', resource: 'roles', namespace: 'team', projection: 'metadata', sessionID: 'rbac-test', signal: expect.any(AbortSignal) })));
  });

  it('disables all system-owned mutators including row actions', () => {
    render(<Harness source={roleSource.replace('name: reader', 'name: system:reader')} intent="edit" />);
    expect(screen.getByRole('button', { name: 'Add permission rule' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove permission rule 1' })).toBeDisabled();
    expect(screen.getByLabelText('Rule 1 resource 1')).toBeDisabled();
  });

  it('does not expose generated permission mutators for aggregated ClusterRoles', () => {
    render(<Harness source={roleSource.replace('kind: Role', 'kind: ClusterRole') + 'aggregationRule:\n  clusterRoleSelectors:\n    - matchLabels: {team: platform}\n'} contribution={resourceEditors[1]} intent="edit" />);
    expect(screen.queryByRole('button', { name: 'Add permission rule' })).not.toBeInTheDocument();
    expect(screen.getByText('Controller owns effective rules. Matching selectors grant a union of permissions.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add selector' })).toBeEnabled();
  });

  it('switches rule branches atomically without dropping unknown fields or verb comments', () => {
    const controller = new ResourceEditorController(roleSource.replace('kind: Role', 'kind: ClusterRole'), 'branch');
    const contribution = resourceEditors[1];
    const result = controller.patch({ sessionID: 'branch', expectedRevision: 0, operations: ruleBranchPatches(0, true) }, contribution, contextFor(contribution));
    expect(result.status).toBe('accepted');
    expect(controller.draft().get(['rules', 0, 'resources'])).toBeUndefined();
    expect(controller.draft().get(['rules', 0, 'nonResourceURLs'])).toEqual(['/']);
    expect(controller.draft().get(['rules', 0, 'futureField'])).toBe(9007199254740993n);
    expect(controller.draft().get(['rules', 1, 'resources'])).toEqual(['deployments']);
  });

  it('switches ServiceAccount to Group without persisting an invalid namespace or losing unknown siblings', () => {
    const controller = new ResourceEditorController(bindingSource, 'subject');
    const contribution = resourceEditors[2];
    expect(controller.patch({ sessionID: 'subject', expectedRevision: 0, operations: subjectKindPatches(0, 'Group', 'team') }, contribution, contextFor(contribution)).status).toBe('accepted');
    expect(controller.draft().get(['subjects', 0, 'namespace'])).toBeUndefined();
    expect(controller.draft().get(['subjects', 0, 'apiGroup'])).toBe('rbac.authorization.k8s.io');
    expect(controller.draft().get(['subjects', 0, 'futureField'])).toBe('retained');
  });

  it('rejects missing aggregate selectors and mixed resource/URL rules; accepts core and all-URL wildcard', () => {
    const contribution = resourceEditors[1];
    const context = contextFor(contribution);
    const controller = new ResourceEditorController(roleSource.replace('kind: Role', 'kind: ClusterRole'));
    expect(validate(controller.draft(), context)).toEqual([]);
    controller.syncSource('rules: [{verbs: [get], nonResourceURLs: ["*"]}]');
    expect(validate(controller.draft(), context)).toEqual([]);
    controller.syncSource('rules: [{verbs: [get], resources: [pods], nonResourceURLs: [/healthz]}]');
    expect(validate(controller.draft(), context).some(issue => issue.message.includes('not both'))).toBe(true);
    controller.syncSource('aggregationRule: {clusterRoleSelectors: []}');
    expect(validate(controller.draft(), context).some(issue => issue.message.includes('at least one'))).toBe(true);
  });

  it('preserves unsupported scalar shapes for source fallback instead of converting them into empty fields', () => {
    const controller = new ResourceEditorController('rules: [{verbs: [get], apiGroups: [""], resources: [9007199254740993]}]');
    expect(unavailable(controller.draft(), contextFor(resourceEditors[0]))).toBeTruthy();
    expect(controller.getSource()).toContain('9007199254740993');
  });
});
