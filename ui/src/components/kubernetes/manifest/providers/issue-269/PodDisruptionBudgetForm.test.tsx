import type { ResourceEditorContext, ResourceEditorReferenceService } from '@omniviewdev/runtime';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ResourceEditorController } from '../../resourceEditorController';

import PodDisruptionBudgetForm from './PodDisruptionBudgetForm';

import { resourceEditors } from './index';

const context: ResourceEditorContext = {
  group: 'policy', version: 'v1', kind: 'PodDisruptionBudget', resource: 'poddisruptionbudgets', scope: 'Namespaced',
  connectionID: 'fixture-only', namespace: 'sandbox', intent: 'edit',
  capabilities: { create: 'available', update: 'available', delete: 'unknown', get: 'available', list: 'available', actions: {} },
  discovery: { status: 'available', features: {} }, schema: { status: 'available' },
};
const initial = 'apiVersion: policy/v1\nkind: PodDisruptionBudget\nmetadata: {name: workers, namespace: sandbox}\nspec:\n  minAvailable: 2 # unchanged until valid input\n  selector:\n    matchLabels: {app: worker}\n    matchExpressions:\n      - {key: zone, operator: In, values: [west]}\n  futureOption: 9007199254740995\n';
const references: ResourceEditorReferenceService = { list: async () => ({ status: 'ready', items: [] }) };
const actions = { execute: vi.fn(async () => ({ status: 'unavailable' as const, message: 'Fixture only.' })) };

function Harness({ controller, initialSection = 'budget', target = context, refs = references }: { controller: ResourceEditorController; initialSection?: string; target?: ResourceEditorContext; refs?: ResourceEditorReferenceService }) {
  const [, renderRevision] = useState(0);
  const [section, setSection] = useState(initialSection);
  const [validity, setValidity] = useState<string | null>(null);
  return <><PodDisruptionBudgetForm context={target} draft={controller.draft()} section={section} disabled={false} references={refs} actions={actions} onValidityChange={setValidity} patch={request => {
    const result = controller.patch(request, resourceEditors[0], target);
    if (result.status === 'accepted') renderRevision(value => value + 1);
    return result;
  }} /><button onClick={() => setSection('selector')}>Open selection section</button><button onClick={() => setSection('budget')}>Open budget section</button><output aria-label="Form validity">{validity ?? 'valid'}</output></>;
}

async function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  const item = await screen.findByRole('option', { name: option });
  fireEvent.pointerDown(item, { pointerType: 'mouse', button: 0 });
  fireEvent.pointerUp(item, { pointerType: 'mouse', button: 0 });
  fireEvent.click(item);
}

describe('PodDisruptionBudget production component', () => {
  it('retains a cleared budget locally across sibling patches and section changes', async () => {
    const controller = new ResourceEditorController(initial, 'policy-partial');
    render(<Harness controller={controller} />);
    fireEvent.change(screen.getByLabelText('Amount (pods)'), { target: { value: '' } });
    expect(screen.getByLabelText('Form validity')).not.toHaveTextContent('valid');
    expect(controller.draft().get(['spec', 'minAvailable'])).toBe(2n);
    await choose('Eviction policy', 'Always allow running unready pods');
    expect(screen.getByLabelText('Amount (pods)')).toHaveValue('');
    fireEvent.click(screen.getByText('Open selection section'));
    fireEvent.click(screen.getByText('Open budget section'));
    expect(screen.getByLabelText('Amount (pods)')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Amount (pods)'), { target: { value: '3' } });
    expect(controller.draft().get(['spec', 'minAvailable'])).toBe(3n);
    expect(controller.draft().get(['spec', 'futureOption'])).toBe(9007199254740995n);
    expect(controller.getSource()).toContain('# unchanged until valid input');
    expect(screen.getByLabelText('Form validity')).toHaveTextContent('valid');
  });
  it('switches budget choice and percentage scalar through actual controls', async () => {
    const controller = new ResourceEditorController(initial, 'policy-union');
    render(<Harness controller={controller} />);
    await choose('Budget rule', 'Maximum unavailable');
    await choose('Measure', 'Percentage (string)');
    fireEvent.change(screen.getByLabelText('Amount (%)'), { target: { value: '25' } });
    expect(controller.draft().has(['spec', 'minAvailable'])).toBe(false);
    expect(controller.draft().get(['spec', 'maxUnavailable'])).toBe('25%');
    fireEvent.change(screen.getByLabelText('Amount (%)'), { target: { value: '101' } });
    expect(controller.draft().get(['spec', 'maxUnavailable'])).toBe('25%');
    expect(screen.getByRole('alert')).toHaveTextContent('0–100');
  });
  it('adds and removes label requirements without erasing expressions or exact siblings', () => {
    const controller = new ResourceEditorController(initial, 'policy-labels');
    render(<Harness controller={controller} initialSection="selector" />);
    fireEvent.change(screen.getByLabelText('New label key'), { target: { value: 'track' } });
    fireEvent.change(screen.getByLabelText('New label value'), { target: { value: 'stable' } });
    expect(screen.getByLabelText('Form validity')).toHaveTextContent('pending selector');
    fireEvent.click(screen.getByText('Add label'));
    expect(controller.draft().get(['spec', 'selector', 'matchLabels', 'track'])).toBe('stable');
    fireEvent.click(screen.getByLabelText('Remove label app'));
    expect(controller.draft().has(['spec', 'selector', 'matchLabels', 'app'])).toBe(false);
    expect(controller.draft().get(['spec', 'selector', 'matchExpressions', 0, 'values', 0])).toBe('west');
    expect(controller.draft().get(['spec', 'futureOption'])).toBe(9007199254740995n);
  });
  it('omits expression values for existence operators using an atomic patch', async () => {
    const controller = new ResourceEditorController(initial, 'policy-exists');
    render(<Harness controller={controller} initialSection="selector" />);
    await choose('Operator 1', 'DoesNotExist');
    expect(controller.draft().get(['spec', 'selector', 'matchExpressions', 0, 'operator'])).toBe('DoesNotExist');
    expect(controller.draft().has(['spec', 'selector', 'matchExpressions', 0, 'values'])).toBe(false);
    expect(controller.draft().get(['spec', 'selector', 'matchLabels', 'app'])).toBe('worker');
  });
  it('makes all versus no Pods explicit and supports lossless object-to-null switching', async () => {
    const controller = new ResourceEditorController(initial, 'policy-scope');
    render(<Harness controller={controller} initialSection="selector" />);
    await choose('Selection scope', 'All namespace pods ({})');
    expect(screen.getByText('This budget selects every Pod in the namespace.')).toBeInTheDocument();
    expect(controller.draft().get(['spec', 'selector'])).toEqual({});
    await choose('Selection scope', 'No pods (null selector)');
    expect(controller.draft().get(['spec', 'selector'])).toBeNull();
    expect(controller.draft().get(['spec', 'futureOption'])).toBe(9007199254740995n);
    await choose('Selection scope', 'All namespace pods ({})');
    expect(controller.draft().get(['spec', 'selector'])).toEqual({});
    await choose('Selection scope', 'No pods (selector omitted)');
    expect(controller.draft().has(['spec', 'selector'])).toBe(false);
    expect(controller.draft().get(['spec', 'minAvailable'])).toBe(2n);
    expect(controller.getSource()).toContain('# unchanged until valid input');
  });
  it('keeps denied lookup distinct from an empty list and does not query without a namespace', async () => {
    const list = vi.fn(async () => ({ status: 'denied' as const, message: 'Not allowed.' }));
    const controller = new ResourceEditorController(initial);
    const view = render(<Harness controller={controller} refs={{ list }} initialSection="selector" />);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Pod lookup' })).toHaveAttribute('data-state', 'denied'));
    expect(screen.getByLabelText('New label key')).not.toBeDisabled();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ group: '', version: 'v1', resource: 'pods', namespace: 'sandbox', projection: 'metadata' }));
    view.unmount(); list.mockClear();
    render(<Harness controller={new ResourceEditorController(initial.replace(', namespace: sandbox', ''))} refs={{ list }} initialSection="selector" target={{ ...context, namespace: undefined }} />);
    expect(screen.getByText('Choose a namespace to preview Pod matches.')).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
  it('retains pending and invalid expression tokens locally without mutating old source', () => {
    const controller = new ResourceEditorController(initial, 'policy-token-draft');
    render(<Harness controller={controller} initialSection="selector" />);
    fireEvent.input(screen.getByLabelText('Expression values 1'), { target: { value: 'bad/value' } });
    expect(screen.getByLabelText('Form validity')).toHaveTextContent('pending expression value');
    fireEvent.click(screen.getByText('Open budget section'));
    fireEvent.click(screen.getByText('Open selection section'));
    expect(screen.getByLabelText('Expression values 1')).toHaveValue('bad/value');
    fireEvent.keyDown(screen.getByLabelText('Expression values 1'), { key: 'Enter' });
    expect(screen.getByText('bad/value')).toBeInTheDocument();
    expect(screen.getByLabelText('Form validity')).toHaveTextContent('valid label values');
    expect(controller.draft().get(['spec', 'selector', 'matchExpressions', 0, 'values'])).toEqual(['west']);
  });
  it('keeps a pending token attached to its row when an earlier expression is removed', () => {
    const controller = new ResourceEditorController(initial.replace('  futureOption:', '      - {key: track, operator: In, values: [stable]}\n  futureOption:'), 'policy-row-removal');
    render(<Harness controller={controller} initialSection="selector" />);
    fireEvent.input(screen.getByLabelText('Expression values 2'), { target: { value: 'canary' } });
    fireEvent.click(screen.getByLabelText('Remove expression 1'));
    expect(screen.getByLabelText('Expression values 1')).toHaveValue('canary');
    expect(screen.getByLabelText('Form validity')).toHaveTextContent('pending expression value');
    expect(controller.draft().get(['spec', 'selector', 'matchExpressions', 0, 'key'])).toBe('track');
    expect(controller.draft().get(['spec', 'selector', 'matchExpressions', 0, 'values'])).toEqual(['stable']);
  });
  it('locks a trusted controller-owned budget and never calls an eviction action', () => {
    const controller = new ResourceEditorController(initial);
    render(<Harness controller={controller} target={{ ...context, ownership: { status: 'controller' } }} />);
    expect(screen.getByLabelText('Amount (pods)')).toBeDisabled();
    expect(screen.getByText('Controller-managed budget. Edit its owning source.')).toBeInTheDocument();
    expect(actions.execute).not.toHaveBeenCalled();
  });
});
