import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import { admissionFixtures, admissionScenario } from './fixtures';
import { resourceEditors } from './index';
import { clientBranch, mutationBranch, unavailable, validateAdmission, validWebhookURL } from './model';
import WebhookEditor from './WebhookEditor';
import BindingEditor from './BindingEditor';
import PolicyEditor from './PolicyEditor';

const noReferences: ResourceEditorFormProps['references'] = { list: async () => ({ status: 'denied', message: 'Fixture lookup denied.' }) };
const noActions: ResourceEditorFormProps['actions'] = { execute: async () => ({ status: 'unavailable', message: 'Fixture has no live actions.' }) };
afterEach(cleanup);
function session(index: number, source = admissionFixtures[index].source) {
  const fixture = admissionFixtures[index];
  const controller = new ResourceEditorController(source, `admission-test-${index}`);
  const contribution = resourceEditors[index];
  const patch = (operations: readonly ResourceEditorPatch[]) => controller.patch({ sessionID: controller.sessionID, expectedRevision: controller.revision, operations }, contribution, fixture.context);
  return { controller, contribution, patch, context: fixture.context };
}
function Consumer({ index, controller, section = 'configuration', validity = () => {} }: { index: number; controller: ResourceEditorController; section?: string; validity?: (error: string | null) => void }) {
  const [, refresh] = useState(0);
  const contribution = resourceEditors[index];
  const form: ResourceEditorFormProps = { context: admissionFixtures[index].context, draft: controller.draft(contribution.sensitivePaths), section, disabled: false, references: noReferences, actions: noActions, onValidityChange: validity, patch: request => { const result = controller.patch(request, contribution, admissionFixtures[index].context); if (result.status === 'accepted') refresh(value => value + 1); return result; } };
  return index < 2 ? <WebhookEditor {...form} /> : index === 3 || index === 5 ? <BindingEditor {...form} /> : <PolicyEditor {...form} />;
}

describe('admission registration behavior', () => {
  it.each(admissionFixtures.map((fixture, index) => [fixture.target.kind, index] as const))('accepts a complete %s fixture', (_kind, index) => {
    const { controller, context, contribution } = session(index);
    const draft = controller.draft(contribution.sensitivePaths);
    expect(unavailable(draft, context)).toBeNull();
    expect(validateAdmission(draft, context)).toEqual([]);
  });
  it.each([
    ['port: 443', 'port: {toString: withheld}', 'Port must be 1–65535.'],
    ['timeoutSeconds: 10', 'timeoutSeconds: {toString: withheld}', 'Timeout must be 1–30 seconds.'],
  ])('rejects opaque numeric webhook fields without coercion: %s', (before, after, message) => {
    const source = admissionFixtures[0].source.replace(before, after);
    const { controller, context, contribution } = session(0, source);
    expect(validateAdmission(controller.draft(contribution.sensitivePaths), context).map(issue => issue.message)).toContain(message);
    expect(controller.getSource()).toBe(source);
  });
  it('keeps CA material and unknown siblings when atomically switching webhook clients', () => {
    const source = admissionFixtures[0].source.replace('    sideEffects:', '      caBundle: fixture-public-trust-material\n      futureTLSOption: preserve\n    sideEffects:');
    const { controller, contribution, patch } = session(0, source);
    expect(controller.draft(contribution.sensitivePaths).get(['webhooks', 0, 'clientConfig', 'caBundle'])).not.toBe('fixture-public-trust-material');
    expect(patch(clientBranch(['webhooks', 0, 'clientConfig'], 'url')).status).toBe('accepted');
    expect(controller.draft().has(['webhooks', 0, 'clientConfig', 'service'])).toBe(false);
    expect(controller.draft().get(['webhooks', 0, 'clientConfig', 'futureTLSOption'])).toBe('preserve');
    expect(controller.draft().get(['webhooks', 0, 'clientConfig', 'caBundle'])).toBe('fixture-public-trust-material');
  });
  it('rejects credential-bearing webhook URLs without echoing their values', () => {
    expect(validWebhookURL('https://name:credential@example.test/review')).toBe(false);
    expect(validWebhookURL('https://example.test/review?credential=hidden')).toBe(false);
    expect(validWebhookURL('http://example.test/review')).toBe(false);
    expect(validWebhookURL('https://example.test/review')).toBe(true);
  });
  it.each([0, 1])('edits public webhook URL leaves without exposing CA or replacing unknown siblings (%s)', index => {
    const { controller, patch } = session(index);
    const client = ['webhooks', 0, 'clientConfig'] as const;
    expect(patch([
      ...clientBranch(client, 'url'),
      { op: 'set', path: [...client, 'url'], value: 'https://hooks.example.invalid/admit' },
      { op: 'set', path: [...client, 'caBundle'], value: 'private-ca-data' },
      { op: 'set', path: [...client, 'futureTLSOption'], value: { exact: '9007199254740993' } },
    ]).status).toBe('accepted');
    const view = render(<Consumer index={index} controller={controller} />);
    const input = screen.getByLabelText('HTTPS URL');
    expect(input).not.toHaveAttribute('type', 'password');
    expect(input).toHaveValue('https://hooks.example.invalid/admit');
    expect(view.container.innerHTML).not.toContain('private-ca-data');
    fireEvent.change(input, { target: { value: 'https://hooks.example.invalid/replacement' } });
    expect(controller.draft().get([...client, 'url'])).toBe('https://hooks.example.invalid/replacement');
    expect(controller.draft().get([...client, 'caBundle'])).toBe('private-ca-data');
    expect(controller.draft().get([...client, 'futureTLSOption'])).toEqual({ exact: '9007199254740993' });
  });
  it.each([
    'https://name:private-credential@example.test/review',
    'https://example.test/review?token=private-credential',
    'https://example.test/review#private-credential',
  ])('retains hidden unsafe URL through remount until explicit replacement (%s)', value => {
    const { controller, patch } = session(0);
    const client = ['webhooks', 0, 'clientConfig'] as const;
    expect(patch([
      ...clientBranch(client, 'url'),
      { op: 'set', path: [...client, 'url'], value },
      { op: 'set', path: [...client, 'caBundle'], value: 'private-ca-data' },
      { op: 'set', path: [...client, 'futureTLSOption'], value: 'retain' },
    ]).status).toBe('accepted');
    const original = controller.getSource();
    const view = render(<Consumer index={0} controller={controller} />);
    expect(screen.getByLabelText('HTTPS URL')).toHaveValue('');
    expect(view.container.innerHTML).not.toContain('private-credential');
    expect(view.container.innerHTML).not.toContain('private-ca-data');
    expect(controller.getSource()).toBe(original);
    view.unmount();
    const remount = render(<Consumer index={0} controller={controller} />);
    expect(screen.getByLabelText('HTTPS URL')).toHaveValue('');
    expect(controller.getSource()).toBe(original);
    fireEvent.change(screen.getByLabelText('HTTPS URL'), { target: { value: 'https://hooks.example.invalid/replacement' } });
    expect(controller.draft().get([...client, 'url'])).toBe('https://hooks.example.invalid/replacement');
    expect(controller.draft().get([...client, 'caBundle'])).toBe('private-ca-data');
    expect(controller.draft().get([...client, 'futureTLSOption'])).toBe('retain');
    const next = session(0);
    expect(next.patch([
      ...clientBranch(client, 'url'),
      { op: 'set', path: [...client, 'url'], value: 'https://next.example.invalid/admit' },
    ]).status).toBe('accepted');
    remount.rerender(<Consumer index={0} controller={next.controller} />);
    expect(screen.getByLabelText('HTTPS URL')).toHaveValue('https://next.example.invalid/admit');
    expect(controller.draft().get([...client, 'url'])).toBe('https://hooks.example.invalid/replacement');
  });
  it('keeps invalid timeout locally through a sibling edit and section roundtrip', () => {
    const { controller } = session(0);
    const validity = vi.fn();
    const view = render(<Consumer index={0} controller={controller} validity={validity} />);
    fireEvent.change(screen.getByLabelText('Timeout (seconds)'), { target: { value: '31' } });
    expect(controller.draft().get(['webhooks', 0, 'timeoutSeconds'])).toBe(10n);
    expect(validity).toHaveBeenLastCalledWith('Enter a whole number from 1 to 30.');
    fireEvent.change(screen.getByLabelText('Webhook DNS name'), { target: { value: 'new.fixture.example.test' } });
    expect(screen.getByLabelText('Timeout (seconds)')).toHaveValue('31');
    view.rerender(<Consumer index={0} controller={controller} validity={validity} section="matching" />);
    view.rerender(<Consumer index={0} controller={controller} validity={validity} section="configuration" />);
    expect(screen.getByLabelText('Timeout (seconds)')).toHaveValue('31');
    fireEvent.change(screen.getByLabelText('Timeout (seconds)'), { target: { value: '20' } });
    expect(controller.draft().get(['webhooks', 0, 'timeoutSeconds'])).toBe(20n);
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('preserves exact unknown integers and comments while authoring validation CEL', () => {
    const { controller } = session(2);
    render(<Consumer index={2} controller={controller} section="logic" />);
    fireEvent.change(screen.getByLabelText('Validation CEL'), { target: { value: 'object.metadata.name.startsWith("safe-")' } });
    expect(controller.getSource()).toContain('# Keep this comment and exact integer through unrelated edits.');
    expect(controller.draft().get(['spec', 'preservedExact'])).toBe(9007199254740993n);
    expect(controller.draft().get(['spec', 'validations', 0, 'expression'])).toBe('object.metadata.name.startsWith("safe-")');
  });
  it('blocks Deny and Warn together for validating bindings only', () => {
    const { controller, context } = session(3);
    const validity = vi.fn();
    render(<Consumer index={3} controller={controller} section="binding" validity={validity} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Warn' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Deny and Warn cannot be combined.');
    expect(controller.draft().get(['spec', 'validationActions'])).toEqual(['Deny', 'Audit']);
    expect(validateAdmission(controller.draft(), context)).toEqual([]);
    expect(validity).toHaveBeenLastCalledWith('Deny and Warn cannot be combined.');
    cleanup();
    const mutation = session(5);
    render(<Consumer index={5} controller={mutation.controller} section="binding" />);
    expect(screen.queryByRole('checkbox', { name: 'Deny' })).not.toBeInTheDocument();
  });
  it('switches mutation strategy atomically and rejects DELETE matching', () => {
    const { controller, patch, context } = session(4);
    expect(patch(mutationBranch(['spec', 'mutations', 0], 'JSONPatch')).status).toBe('accepted');
    expect(controller.draft().has(['spec', 'mutations', 0, 'applyConfiguration'])).toBe(false);
    expect(controller.draft().get(['spec', 'mutations', 0, 'patchType'])).toBe('JSONPatch');
    patch([{ op: 'set', path: ['spec', 'matchConstraints', 'resourceRules', 0, 'operations'], value: ['DELETE'] }]);
    expect(validateAdmission(controller.draft(), context).some(issue => issue.message === 'Choose supported admission operations.')).toBe(true);
  });
  it('does not write controller-owned configurations', () => {
    const { controller, contribution } = session(1);
    const fixture = admissionScenario(1, 'managed');
    const before = controller.getSource();
    const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['webhooks', 0, 'failurePolicy'], value: 'Ignore' }] }, contribution, fixture.context);
    expect(result.status).toBe('forbidden');
    expect(controller.getSource()).toBe(before);
  });
  it('retains unsupported source and distinguishes unavailable gate from unknown discovery', () => {
    const fixture = admissionScenario(4, 'unsupported');
    const controller = new ResourceEditorController(fixture.source);
    expect(unavailable(controller.draft(), fixture.context)).toContain('source shape');
    expect(controller.getSource()).toBe(fixture.source);
    expect(unavailable(session(4).controller.draft(), admissionScenario(4, 'gate-off').context)).toContain('feature availability');
    expect(unavailable(session(4).controller.draft(), admissionScenario(4, 'discovery-unknown').context)).toContain('discovery is unknown');
    const installed = session(4);
    expect(unavailable(installed.controller.draft(), { ...installed.context, discovery: { status: 'available', features: {} } })).toBeNull();
  });
});
