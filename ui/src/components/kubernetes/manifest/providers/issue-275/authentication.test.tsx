import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorFormProps, ResourceEditorActionResult } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import TokenRequestForm from './TokenRequestForm';
import TokenReviewForm from './TokenReviewForm';
import SelfSubjectReviewForm from './SelfSubjectReviewForm';
import { lifetimeError, reviewOutcome, unsupported, validateRequest } from './authentication';
import { resourceEditors } from './index';

function context(index: number): ResourceEditorContext {
  return { ...resourceEditors[index].targets[0], connectionID: 'fixture-only', intent: 'action', namespace: index === 2 ? 'fixture' : undefined, name: index === 2 ? 'fixture-account' : undefined, capabilities: { create: 'unknown', update: 'unknown', delete: 'unknown', get: 'unknown', list: 'unknown', actions: { 'kubernetes.review.v1': 'available', 'kubernetes.service-account-token.v1': 'available' } }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } };
}
function Harness({ controller, index, report, result }: { controller: ResourceEditorController; index: number; report: (error: string | null) => void; result?: ResourceEditorActionResult }) {
  const [, rerender] = useState(0);
  const contribution = resourceEditors[index];
  const Component: ComponentType<ResourceEditorFormProps> = [TokenReviewForm, SelfSubjectReviewForm, TokenRequestForm][index];
  return <Component context={context(index)} draft={controller.draft(contribution.sensitivePaths)} section="request" disabled={false} onValidityChange={report} patch={request => { const response = controller.patch(request, contribution, context(index)); rerender(value => value + 1); return response; }} references={{ list: async () => ({ status: 'ready', items: [{ name: 'fixture-pod', uid: 'fixture-object-uid' }, { name: 'fixture-account', uid: 'fixture-account-uid' }] }) }} actions={{ execute: async () => ({ status: 'unavailable', message: 'No live transport in tests.' }) }} requestResult={result} />;
}
afterEach(cleanup);

describe('authentication request validation', () => {
  it('uses the pinned exact lifetime bounds without rounded wide-number acceptance', () => {
    expect(lifetimeError('')).toBeNull();
    expect(lifetimeError('600')).toBeNull();
    expect(lifetimeError('4294967296')).toBeNull();
    for (const value of ['599', '4294967297', '9007199254740993', '1e3', '600.0', '-600', '6-']) expect(lifetimeError(value)).not.toBeNull();
  });
  it('keeps Node binding server-admitted without invented feature evidence', () => {
    const controller = new ResourceEditorController('apiVersion: authentication.k8s.io/v1\nkind: TokenRequest\nspec:\n  audiences: [fixture-audience]\n  boundObjectRef:\n    apiVersion: v1\n    kind: Node\n    name: fixture-node\n');
    const ctx = context(2);
    expect(validateRequest(controller.draft(), ctx)).toEqual([]);
    expect(ctx.discovery.features).toEqual({});
    expect(ctx.capabilities.create).toBe('unknown');
  });
  it.each(['  audiences: [false]\n  expirationSeconds: 600', '  audiences: [fixture-audience]\n  expirationSeconds: "600"'])('does not coerce unsupported scalar shapes: %s', fields => {
    const controller = new ResourceEditorController(`apiVersion: authentication.k8s.io/v1\nkind: TokenRequest\nspec:\n${fields}\n`);
    const original = controller.getSource();
    expect(unsupported(controller.draft(), 'TokenRequest')).not.toBeNull();
    expect(controller.getSource()).toBe(original);
  });
  it('requires an intersecting returned audience even after authenticated=true', () => {
    expect(reviewOutcome({ status: { authenticated: true, audiences: ['other'] } }, ['intended'])).toBe('audience-mismatch');
    expect(reviewOutcome({ status: { authenticated: true } }, ['intended'])).toBe('audience-mismatch');
    expect(reviewOutcome({ status: { authenticated: true, audiences: ['intended'] } }, ['intended'])).toBe('authenticated');
    expect(reviewOutcome({ status: { authenticated: false, audiences: ['intended'] } }, ['intended'])).toBe('unauthenticated');
  });
});

describe('authentication production controls', () => {
  it('keeps an empty audience local while adding a sibling and clears only the removed pending row', () => {
    const controller = new ResourceEditorController('apiVersion: authentication.k8s.io/v1\nkind: TokenReview\nspec:\n  audiences: [first, second]\n');
    const report = vi.fn();
    render(<Harness controller={controller} index={0} report={report} />);
    fireEvent.change(screen.getByLabelText('Audience 1'), { target: { value: '' } });
    expect(controller.draft().get(['spec', 'audiences', 0])).toBe('first');
    fireEvent.change(screen.getByLabelText('New audience'), { target: { value: 'third' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add audience' }));
    expect(controller.draft().get(['spec', 'audiences'])).toEqual(['first', 'second', 'third']);
    expect(report.mock.calls.at(-1)?.[0]).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove audience 1' }));
    expect(controller.draft().get(['spec', 'audiences'])).toEqual(['second', 'third']);
    expect(report.mock.calls.at(-1)?.[0]).toBeNull();
  });
  it('retains invalid lifetime locally through valid sibling edits and keeps source comments/unknown exact integers', () => {
    const controller = new ResourceEditorController('apiVersion: authentication.k8s.io/v1\nkind: TokenRequest\nspec:\n  audiences: [fixture-audience] # recipient\n  expirationSeconds: 600 # lifetime\n  future: 9007199254740993\n');
    const report = vi.fn();
    render(<Harness controller={controller} index={2} report={report} />);
    fireEvent.click(screen.getByText('Lifetime and object binding'));
    fireEvent.change(screen.getByLabelText('Lifetime (seconds)'), { target: { value: '6-' } });
    expect(controller.draft().get(['spec', 'expirationSeconds'])).toBe(600n);
    fireEvent.change(screen.getByLabelText('Audience 1'), { target: { value: 'changed-audience' } });
    expect((screen.getByLabelText('Lifetime (seconds)') as HTMLInputElement).value).toBe('6-');
    expect(report.mock.calls.at(-1)?.[0]).toContain('600');
    expect(controller.getSource()).toContain('# lifetime');
    expect(controller.getSource()).toContain('9007199254740993');
    fireEvent.change(screen.getByLabelText('Lifetime (seconds)'), { target: { value: '' } });
    expect(controller.draft().has(['spec', 'expirationSeconds'])).toBe(false);
    expect(report.mock.calls.at(-1)?.[0]).toBeNull();
  });
  it('pins a selected bound object UID atomically and drops stale UID on a manual replacement', async () => {
    const controller = new ResourceEditorController('apiVersion: authentication.k8s.io/v1\nkind: TokenRequest\nspec:\n  audiences: [fixture-audience]\n  boundObjectRef:\n    apiVersion: v1\n    kind: Pod\n    name: old-pod\n    uid: old-uid\n    future: keep\n');
    render(<Harness controller={controller} index={2} report={vi.fn()} />);
    fireEvent.click(screen.getByText('Lifetime and object binding'));
    await waitFor(() => expect(screen.getByText('Reference suggestions available · manual names allowed')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Bound object name'), { target: { value: 'fixture-pod' } });
    expect(controller.draft().get(['spec', 'boundObjectRef', 'uid'])).toBe('fixture-object-uid');
    expect(controller.draft().get(['spec', 'boundObjectRef', 'future'])).toBe('keep');
    fireEvent.change(screen.getByLabelText('Bound object name'), { target: { value: 'manual-pod' } });
    expect(controller.draft().has(['spec', 'boundObjectRef', 'uid'])).toBe(false);
  });
  it('never reflects canonical token or response identity into visible input, text, or ARIA', () => {
    const controller = new ResourceEditorController('apiVersion: authentication.k8s.io/v1\nkind: TokenReview\nspec:\n  token: private-fixture-value\n  audiences: [intended]\n');
    const { container } = render(<Harness controller={controller} index={0} report={vi.fn()} result={{ status: 'ready', output: { status: { authenticated: true, audiences: ['other'], user: { username: 'private-fixture-user', uid: 'private-fixture-uid', extra: { value: ['private-fixture-extra'] } } } } }} />);
    const input = screen.getByLabelText('Bearer token') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('');
    expect(container.innerHTML).not.toContain('private-fixture');
    expect(screen.getByRole('alert').textContent).toContain('Audience mismatch');
    fireEvent.change(input, { target: { value: 'replacement-fixture' } });
    expect(controller.draft().get(['spec', 'token'])).toBe('replacement-fixture');
  });
  it('hides identity and server errors in SelfSubjectReview and request failures', () => {
    const controller = new ResourceEditorController('apiVersion: authentication.k8s.io/v1\nkind: SelfSubjectReview\n');
    const view = render(<Harness controller={controller} index={1} report={vi.fn()} result={{ status: 'ready', output: { status: { userInfo: { username: 'private-fixture-user', groups: ['private-fixture-group'] } } } }} />);
    expect(view.container.textContent).not.toContain('private-fixture');
    view.rerender(<Harness controller={controller} index={1} report={vi.fn()} result={{ status: 'denied', message: 'private-fixture-server-message' }} />);
    expect(screen.getByRole('alert').textContent).toContain('Request denied');
    expect(view.container.textContent).not.toContain('private-fixture');
  });
  it('renders host opaque credential and identity results by presence without reading hidden fields', () => {
    const opaque = Object.freeze(Object.create(null));
    const controller = new ResourceEditorController('apiVersion: authentication.k8s.io/v1\nkind: TokenRequest\nspec:\n  audiences: [fixture-audience]\n');
    const view = render(<Harness controller={controller} index={2} report={vi.fn()} result={{ status: 'ready', sensitive: true, output: { status: { token: opaque, expirationTimestamp: '2030-01-01T00:10:00Z' } } }} />);
    expect(screen.getByText('Token: masked')).toBeTruthy();
    expect(screen.getByText('2030-01-01T00:10:00Z')).toBeTruthy();
    view.rerender(<Harness controller={controller} index={1} report={vi.fn()} result={{ status: 'ready', sensitive: true, output: { status: { userInfo: opaque } } }} />);
    expect(screen.getByText('Masked')).toBeTruthy();
    expect(screen.queryByText('Not returned')).toBeNull();
  });
});
