import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorContribution, ResourceEditorReferenceService } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import { resourceEditors } from './index';
import { DaemonSetEditor, ReplicaSetEditor } from './WorkloadEditor';
import OwnerInspection from './OwnerInspection';
import { containersPath, linkLabel, ownership, parseBudget, strategyPatch, validateApps } from './model';

const context: ResourceEditorContext = {
  group: 'apps', version: 'v1', kind: 'DaemonSet', resource: 'daemonsets', scope: 'Namespaced',
  connectionID: 'fixture', namespace: 'preview', intent: 'create', ownership: { status: 'application' },
  capabilities: { create: 'available', update: 'available', delete: 'denied', list: 'available', get: 'available', actions: {} },
  discovery: { status: 'available', features: {} }, schema: { status: 'available' },
};
const source = `apiVersion: apps/v1
kind: DaemonSet
metadata: {name: agent, namespace: preview}
spec:
  selector: {matchLabels: {app: agent}}
  template:
    metadata: {labels: {app: agent, retained: yes}}
    spec:
      containers:
        - name: main
          image: registry.invalid/agent:v1
          env: [{name: KEEP, value: hidden-fixture-value}]
          ports: [{containerPort: 8080, name: metrics}]
  minReadySeconds: 2
  updateStrategy:
    type: RollingUpdate
    rollingUpdate: {maxUnavailable: 1, maxSurge: 0}
`;
const references: ResourceEditorReferenceService = { list: async () => ({ status: 'ready', items: [] }) };
function Harness({ controller, contribution = resourceEditors[0], editorContext = context, section = 'workload', validity = () => {}, lookup = references }: { controller: ResourceEditorController; contribution?: ResourceEditorContribution; editorContext?: ResourceEditorContext; section?: string; validity?: (error: string | null) => void; lookup?: ResourceEditorReferenceService }) {
  const [, renderRevision] = useState(0);
  const Form = editorContext.kind === 'ControllerRevision' ? OwnerInspection : editorContext.kind === 'ReplicaSet' ? ReplicaSetEditor : DaemonSetEditor;
  return <Form context={editorContext} draft={controller.draft(contribution.sensitivePaths)} section={section} disabled={false} onValidityChange={validity} references={lookup} actions={{ execute: async () => ({ status: 'unavailable', message: 'No fixture actions.' }) }} patch={request => {
    const result = controller.patch(request, contribution, editorContext);
    if (result.status === 'accepted') renderRevision(value => value + 1);
    return result;
  }} />;
}

describe('apps workload behavior', () => {
  it('rejects both positive budgets as well as both zero budgets', () => {
    for (const budgets of ['maxUnavailable: 0, maxSurge: 0', 'maxUnavailable: 1, maxSurge: 1']) {
      const controller = new ResourceEditorController(source.replace('maxUnavailable: 1, maxSurge: 0', budgets));
      expect(validateApps(controller.draft(), context).some(issue => issue.message === 'Exactly one rollout budget must be greater than zero.')).toBe(true);
    }
    expect(parseBudget('100', true)).toBe('100%');
    expect(parseBudget('101', true)).toBeNull();
    expect(parseBudget('2147483648', false)).toBeNull();
    expect(parseBudget('5', false)).toBe(5n);
  });
  it('keeps invalid partial input local across accepted sibling edits', () => {
    const controller = new ResourceEditorController(source);
    const validity = vi.fn();
    render(<Harness controller={controller} validity={validity} />);
    fireEvent.change(screen.getByLabelText('Minimum ready (seconds)'), { target: { value: '1e' } });
    fireEvent.change(screen.getByLabelText('Revision history limit'), { target: { value: '7' } });
    expect(screen.getByLabelText('Minimum ready (seconds)')).toHaveValue('1e');
    expect(controller.draft().get(['spec', 'minReadySeconds'])).toBe(2n);
    expect(controller.draft().get(['spec', 'revisionHistoryLimit'])).toBe(7n);
    expect(validity).toHaveBeenLastCalledWith('Use a whole number from 0 to 2147483647.');
    fireEvent.change(screen.getByLabelText('Minimum ready (seconds)'), { target: { value: '3' } });
    expect(controller.draft().get(['spec', 'minReadySeconds'])).toBe(3n);
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('links selector leaves atomically without touching unrelated Pod labels', () => {
    const controller = new ResourceEditorController(source);
    const before = controller.draft();
    expect(controller.patch({ sessionID: before.sessionID, expectedRevision: before.revision, operations: linkLabel('app', 'changed') }, resourceEditors[0], context).status).toBe('accepted');
    expect(controller.draft().get(['spec', 'selector', 'matchLabels', 'app'])).toBe('changed');
    expect(controller.draft().get(['spec', 'template', 'metadata', 'labels', 'app'])).toBe('changed');
    expect(controller.draft().get(['spec', 'template', 'metadata', 'labels', 'retained'])).toBe('yes');
  });
  it('inserts and removes explicit containers without copying opaque existing children', () => {
    const controller = new ResourceEditorController(source);
    render(<Harness controller={controller} section="containers" />);
    fireEvent.change(screen.getByLabelText('Container 1 image'), { target: { value: 'registry.invalid/agent:v2' } });
    expect(controller.draft().get([...containersPath, 0, 'env', 0, 'value'])).toBe('hidden-fixture-value');
    expect(controller.draft().get([...containersPath, 0, 'ports', 0, 'name'])).toBe('metrics');
    fireEvent.click(screen.getByRole('button', { name: 'Add container' }));
    fireEvent.change(screen.getByLabelText('New container name'), { target: { value: 'sidecar' } });
    fireEvent.change(screen.getByLabelText('New container image'), { target: { value: 'registry.invalid/sidecar:v1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
    expect(controller.draft().get([...containersPath, 1, 'name'])).toBe('sidecar');
    fireEvent.click(screen.getByRole('button', { name: 'Remove container 2' }));
    expect(controller.draft().get([...containersPath, 1, 'name'])).toBe('sidecar');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    expect(controller.draft().get([...containersPath, 1])).toBeUndefined();
    expect(controller.draft().get([...containersPath, 0, 'env', 0, 'value'])).toBe('hidden-fixture-value');
  });
  it('preserves unknown rolling-update fields rather than silently discarding them', () => {
    const controller = new ResourceEditorController(source.replace('maxSurge: 0}', 'maxSurge: 0, future: retained}'));
    expect(strategyPatch(controller.draft(), 'OnDelete')).toBeNull();
    expect(controller.getSource()).toContain('future: retained');
  });
  it('retains percentage type and budget values through explicit OnDelete transitions', async () => {
    const controller = new ResourceEditorController(source.replace('  minReadySeconds: 2', '  retainedExact: 9007199254740993\n  minReadySeconds: 2 # keep-comment'));
    const validity = vi.fn();
    render(<Harness controller={controller} validity={validity} />);
    const choose = async (label: string, option: string) => {
      fireEvent.click(screen.getByLabelText(label));
      const item = await screen.findByRole('option', { name: option });
      fireEvent.pointerDown(item, { pointerType: 'mouse', button: 0 });
      fireEvent.pointerUp(item, { pointerType: 'mouse', button: 0 });
      fireEvent.click(item);
    };
    await choose('Maximum unavailable unit', 'Percent (%)');
    expect(controller.draft().get(['spec', 'updateStrategy', 'rollingUpdate', 'maxUnavailable'])).toBe('1%');
    fireEvent.change(screen.getByLabelText('Maximum unavailable'), { target: { value: '1e' } });
    await choose('Update strategy', 'On delete');
    expect(controller.draft().has(['spec', 'updateStrategy', 'rollingUpdate'])).toBe(false);
    expect(screen.getByText('Existing Pods remain until explicitly deleted. No Pod deletion occurs here.')).toBeInTheDocument();
    expect(validity).toHaveBeenLastCalledWith(null);
    await choose('Update strategy', 'Rolling update');
    expect(controller.draft().get(['spec', 'updateStrategy', 'rollingUpdate', 'maxUnavailable'])).toBe('1%');
    expect(screen.getByLabelText('Maximum unavailable')).toHaveValue('1e');
    fireEvent.change(screen.getByLabelText('Maximum unavailable'), { target: { value: '2' } });
    expect(controller.draft().get(['spec', 'updateStrategy', 'rollingUpdate', 'maxUnavailable'])).toBe('2%');
    expect(controller.draft().get(['spec', 'retainedExact'])).toBe(9007199254740993n);
    expect(controller.getSource()).toContain('# keep-comment');
  });
  it('never unlocks existing standalone resources when trusted ownership is unknown', () => {
    const controller = new ResourceEditorController(source.replace('kind: DaemonSet', 'kind: ReplicaSet'));
    const unknownContext = { ...context, kind: 'ReplicaSet', resource: 'replicasets', intent: 'edit' as const, ownership: undefined };
    render(<Harness controller={controller} contribution={resourceEditors[1]} editorContext={unknownContext} />);
    expect(screen.getByText('Controller ownership cannot be verified. Editing stays locked.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Desired replicas')).not.toBeInTheDocument();
  });
  it('locks immutable selectors on edit', () => {
    render(<Harness controller={new ResourceEditorController(source)} editorContext={{ ...context, intent: 'edit' }} />);
    expect(screen.getByLabelText('Selector app')).toBeDisabled();
  });
  it('keeps a Deployment-owned ReplicaSet locked when owner lookup is denied', async () => {
    const ownedSource = source.replace('kind: DaemonSet', 'kind: ReplicaSet').replace('metadata: {name: agent, namespace: preview}', 'metadata: {name: agent, namespace: preview, ownerReferences: [{apiVersion: apps/v1, kind: Deployment, name: parent, uid: parent-uid, controller: true}]}');
    const controller = new ResourceEditorController(ownedSource);
    const ownedContext = { ...context, kind: 'ReplicaSet', resource: 'replicasets', intent: 'edit' as const };
    render(<Harness controller={controller} contribution={resourceEditors[1]} editorContext={ownedContext} lookup={{ list: async () => ({ status: 'denied', message: 'Denied' }) }} />);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Owner lookup' })).toHaveTextContent('Owner lookup denied'));
    expect(screen.queryByLabelText('Desired replicas')).not.toBeInTheDocument();
    const draft = controller.draft();
    expect(controller.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations: [{ op: 'set', path: ['spec', 'replicas'], value: 10n }] }, resourceEditors[1], ownedContext).status).toBe('forbidden');
  });
  it('never interprets malformed owner references as standalone ownership', () => {
    const controller = new ResourceEditorController(source.replace('namespace: preview}', 'namespace: preview, ownerReferences: {hidden: true}}'));
    expect(ownership(controller.draft()).state).toBe('unknown');
  });
  it('shows an exact large revision and withholds opaque payload', () => {
    const controller = new ResourceEditorController('apiVersion: apps/v1\nkind: ControllerRevision\nmetadata: {name: history, namespace: preview}\nrevision: 9007199254740993\ndata: {private: withheld-fixture-payload}\n');
    render(<Harness controller={controller} contribution={resourceEditors[2]} editorContext={{ ...context, kind: 'ControllerRevision', resource: 'controllerrevisions', intent: 'inspect' }} />);
    expect(screen.getByText('9007199254740993')).toBeInTheDocument();
    expect(screen.queryByText('withheld-fixture-payload')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
