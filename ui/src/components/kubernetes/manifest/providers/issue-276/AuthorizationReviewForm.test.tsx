import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorActionResult, ResourceEditorContext, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import { SubjectAccessReviewForm, LocalSubjectAccessReviewForm, SelfSubjectAccessReviewForm, SelfSubjectRulesReviewForm } from './AuthorizationReviewForm';
import { resourceEditors } from './index';
import { decision, REVIEW_PROTOCOL, unavailable, validateReview } from './model';

const references = { list: vi.fn(async () => ({ status: 'ready' as const, items: [] })) };
const actions = { execute: vi.fn(async () => ({ status: 'unavailable' as const, message: 'No live requests in this test.' })) };
function context(index: number): ResourceEditorContext {
  return { ...resourceEditors[index].targets[0], connectionID: 'fixture', namespace: index === 1 ? 'team' : undefined, intent: 'action', capabilities: { create: 'available', update: 'absent', delete: 'absent', list: 'absent', get: 'absent', actions: { [REVIEW_PROTOCOL]: 'available' } }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } };
}
const forms = [SubjectAccessReviewForm, LocalSubjectAccessReviewForm, SelfSubjectAccessReviewForm, SelfSubjectRulesReviewForm];
function Harness({ controller, index = 2, section = 'request', validity = () => {}, response }: { controller: ResourceEditorController; index?: number; section?: string; validity?: (error: string | null) => void; response?: ResourceEditorActionResult }) {
  const [, changed] = useState(0);
  const contribution = resourceEditors[index];
  const Component = forms[index];
  const props: ResourceEditorFormProps = { context: context(index), draft: controller.draft(contribution.sensitivePaths), section, disabled: false, references, actions, onValidityChange: validity, requestResult: response,
    patch: request => { const result = controller.patch(request, contribution, context(index)); changed(value => value + 1); return result; } };
  return <Component {...props} />;
}
const source = `apiVersion: authorization.k8s.io/v1
kind: SelfSubjectAccessReview
spec:
  resourceAttributes:
    namespace: team
    verb: get # retain verb comment
    resource: pods
    futureCounter: 900719925474099312345
`;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('authorization review behavior', () => {
  it('patches one attribute without losing comments or exact unknown integers', () => {
    const controller = new ResourceEditorController(source);
    render(<Harness controller={controller} />);
    fireEvent.change(screen.getByLabelText('Resource plural'), { target: { value: 'deployments' } });
    expect(controller.draft().get(['spec', 'resourceAttributes', 'resource'])).toBe('deployments');
    expect(controller.getSource()).toContain('get # retain verb comment');
    expect(controller.getSource()).toContain('900719925474099312345');
    expect(actions.execute).not.toHaveBeenCalled();
  });

  it('retains invalid namespace locally across a valid sibling edit', () => {
    const controller = new ResourceEditorController(source);
    const validity = vi.fn();
    render(<Harness controller={controller} validity={validity} />);
    fireEvent.change(screen.getByLabelText('Action namespace'), { target: { value: 'INVALID.' } });
    fireEvent.change(screen.getByLabelText('Resource plural'), { target: { value: 'services' } });
    expect(screen.getByLabelText('Action namespace')).toHaveValue('INVALID.');
    expect(controller.draft().get(['spec', 'resourceAttributes', 'namespace'])).toBe('team');
    expect(validity).toHaveBeenLastCalledWith('Use a DNS namespace label, at most 63 characters.');
  });

  it('locks local endpoint namespace and rejects imported mismatches', () => {
    const controller = new ResourceEditorController(source.replace('SelfSubjectAccessReview', 'LocalSubjectAccessReview').replace('namespace: team', 'namespace: another'));
    render(<Harness controller={controller} index={1} />);
    expect(screen.getByLabelText('Action namespace')).toBeDisabled();
    expect(screen.queryByLabelText('Action type')).not.toBeInTheDocument();
    expect(validateReview(controller.draft(), context(1))).toContainEqual({ path: ['spec', 'resourceAttributes', 'namespace'], message: 'Action namespace must match the local endpoint.' });
  });

  it('inserts a group without writing existing opaque identity values back', () => {
    const controller = new ResourceEditorController(source.replace('SelfSubjectAccessReview', 'SubjectAccessReview') + '  user: fixture-subject\n  groups: [fixture-existing]\n');
    const validity = vi.fn();
    render(<Harness controller={controller} index={0} validity={validity} />);
    expect(screen.getByLabelText('User')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('User')).toHaveValue('');
    fireEvent.click(screen.getByText('Groups and extra attributes'));
    fireEvent.change(screen.getByLabelText('New group'), { target: { value: 'fixture-added' } });
    expect(validity).toHaveBeenLastCalledWith('Add or clear pending identity rows before review.');
    expect(controller.draft().get(['spec', 'groups'])).toEqual(['fixture-existing']);
    fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
    expect(controller.draft().get(['spec', 'groups'])).toEqual(['fixture-existing', 'fixture-added']);
    expect(screen.getByLabelText('Group 1')).toHaveValue('');
    expect(screen.getByLabelText('Group 2')).toHaveAttribute('type', 'password');
    expect(validity).toHaveBeenLastCalledWith(null);
  });

  it('keeps structured selector requirements source-only without rewriting', () => {
    const original = source + '    labelSelector:\n      requirements:\n      - key: app\n        operator: Exists\n';
    const controller = new ResourceEditorController(original);
    expect(unavailable(controller.draft(), context(2))).toContain('Structured selector requirements');
    expect(controller.getSource()).toBe(original);
  });

  it('distinguishes no opinion from explicit denial and rejects contradictory decisions', () => {
    expect(decision({ allowed: false, denied: false })).toBe('No opinion');
    expect(decision({ allowed: false, denied: true })).toBe('Denied');
    expect(decision({ allowed: true, denied: true })).toBe('Invalid response');
  });

  it('shows allowed decision together with evaluation error', () => {
    render(<Harness controller={new ResourceEditorController(source)} section="response" response={{ status: 'ready', output: { status: { allowed: true, evaluationError: 'Fixture authorizer partial failure' } } }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Allowed');
    expect(screen.getByRole('alert')).toHaveTextContent('Evaluation error');
  });

  it('never renders echoed supplied identity in decision details', () => {
    render(<Harness controller={new ResourceEditorController(source)} index={0} section="response" response={{ status: 'ready', output: { status: { allowed: false, denied: true, reason: 'fixture-private-identity', evaluationError: 'fixture-private-extra' } } }} />);
    expect(screen.getByText('Response details masked.')).toBeInTheDocument();
    expect(screen.queryByText('fixture-private-identity')).not.toBeInTheDocument();
    expect(screen.queryByText('fixture-private-extra')).not.toBeInTheDocument();
  });

  it('requires effective-rules namespace and renders incomplete empty-rule semantics', () => {
    const controller = new ResourceEditorController('apiVersion: authorization.k8s.io/v1\nkind: SelfSubjectRulesReview\nspec: {}\n');
    expect(validateReview(controller.draft(), context(3))[0].message).toBe('Choose an evaluation namespace.');
    render(<Harness controller={controller} index={3} section="response" response={{ status: 'ready', sensitive: true, output: { status: { resourceRules: [], nonResourceRules: [{ verbs: ['get'], nonResourceURLs: ['/healthz'] }], incomplete: true, evaluationError: 'fixture-private-diagnostic' } } }} />);
    expect(screen.getByText(/Incomplete rules/)).toBeInTheDocument();
    expect(screen.getByText(/does not imply denial/)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '/healthz' })).toBeInTheDocument();
    expect(screen.queryByText('fixture-private-diagnostic')).not.toBeInTheDocument();
    expect(screen.getByText('Evaluation error details masked.')).toBeInTheDocument();
  });

  it('removes an empty raw-only selector instead of submitting an invalid empty selector object', () => {
    const controller = new ResourceEditorController(source + '    labelSelector:\n      rawSelector: app=api\n');
    render(<Harness controller={controller} />);
    fireEvent.click(screen.getByText('Advanced action and selectors'));
    fireEvent.change(screen.getByLabelText('Label selector'), { target: { value: '' } });
    expect(controller.draft().has(['spec', 'resourceAttributes', 'labelSelector'])).toBe(false);
  });

  it('keeps endpoint POST denial distinct from an access decision', () => {
    render(<Harness controller={new ResourceEditorController(source)} section="response" response={{ status: 'denied', message: 'Endpoint permission denied.' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Review request denied. No access decision returned.');
    expect(screen.queryByText('Denied', { exact: true })).not.toBeInTheDocument();
  });
});
