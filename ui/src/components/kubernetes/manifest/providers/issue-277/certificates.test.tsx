import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ResourceEditorContext, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResourceEditorController } from '../../resourceEditorController';

import CertificateSigningRequestForm from './CertificateSigningRequestForm';
import ClusterTrustBundleForm from './ClusterTrustBundleForm';
import { lifetimeError, signerError, trustNameError, validateCSR } from './domain';
import { parseMaterial } from './material';
import PodCertificateRequestForm from './PodCertificateRequestForm';

import { resourceEditors } from './index';
import { ControllerActions } from '../issue-296/ControllerActions';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const requestPEM = readFileSync(join(fixtureDirectory, 'request.pem'), 'utf8');
const caPEM = readFileSync(join(fixtureDirectory, 'ca.pem'), 'utf8');

const csr = 'apiVersion: certificates.k8s.io/v1\nkind: CertificateSigningRequest\nmetadata:\n  name: fixture\n  resourceVersion: "9"\nspec:\n  signerName: fixture.invalid/client\n  request: masked-fixture\n  usages:\n    - client auth # keep comment\n    - digital signature\n  expirationSeconds: 1200\n  extensionNumber: 90071992547409931234 # unknown stays exact\n';
const context: ResourceEditorContext = {
  group: 'certificates.k8s.io', version: 'v1', kind: 'CertificateSigningRequest', resource: 'certificatesigningrequests', scope: 'Cluster', connectionID: 'fixture-only', name: 'fixture', resourceVersion: '9', intent: 'create',
  capabilities: { create: 'available', update: 'available', delete: 'unknown', list: 'available', get: 'available', actions: { 'kubernetes.csr-approval.v1': 'available' } },
  discovery: { status: 'available', features: {} }, schema: { status: 'available' },
};
function props(source = csr, intent: ResourceEditorContext['intent'] = 'create', index = 0): ResourceEditorFormProps & { controller: ResourceEditorController } {
  const controller = new ResourceEditorController(source, 'certificate-test');
  const contribution = resourceEditors[index];
  const current = { ...context, ...contribution.targets[0], intent };
  return { controller, context: current, draft: controller.draft(contribution.sensitivePaths), section: contribution.sections[0].id, disabled: false,
    patch: vi.fn(request => controller.patch(request, contribution, current)), onValidityChange: vi.fn(),
    references: { list: vi.fn(async () => ({ status: 'ready' as const, items: [] })) }, actions: { execute: vi.fn(async () => ({ status: 'ready' as const, output: {} })) },
  };
}
afterEach(cleanup);
describe('certificate policy', () => {
  it('keeps integer bounds exact and rejects partial and overflowing lifetime input', () => {
    expect(lifetimeError('599')).toBeTruthy(); expect(lifetimeError('600')).toBeNull();
    expect(lifetimeError('2147483647')).toBeNull(); expect(lifetimeError('2147483648')).toBeTruthy();
    expect(lifetimeError('90071992547409931234')).toBeTruthy(); expect(lifetimeError('6e3')).toBeTruthy();
  });
  it('validates qualified signers and exact trust name association', () => {
    expect(signerError('fixture.invalid/client')).toBeNull(); expect(signerError('local/client')).toBeTruthy();
    expect(signerError('fixture.invalid/path/extra')).toBeTruthy();
    expect(trustNameError('fixture.invalid:client:root', 'fixture.invalid/client')).toBeNull();
    expect(trustNameError('other', 'fixture.invalid/client')).toBeTruthy();
    expect(trustNameError('unbound:root', '')).toBeTruthy();
  });
  it('requires usages without populating defaults and never validates existing immutable spec as authoring', () => {
    const form = props(csr.replace(/ {2}usages:[\s\S]*? {2}expirationSeconds:/, '  expirationSeconds:'));
    expect(validateCSR(form.draft, form.context).some(issue => issue.path[1] === 'usages')).toBe(true);
    expect(validateCSR(form.draft, { ...form.context, intent: 'inspect' })).toEqual([]);
  });
});
describe('cert-manager action admission', () => {
  it('retains capability and intent admission when an immutable request exposes actions', () => {
    const form = props(csr, 'action');
    const current: ResourceEditorFormProps = { ...form, context: { ...form.context, kind: 'CertificateRequest', capabilities: { ...form.context.capabilities, actions: { 'kubernetes.cert-manager.v1': 'available' } } } };
    const view = render(<ControllerActions form={current} />);
    expect(screen.getByRole('button', { name: 'Approve request' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve request' }));
    view.rerender(<ControllerActions form={{ ...current, disabled: true }} />);
    expect(screen.getByRole('button', { name: 'Confirm approve' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approve' }));
    expect(form.actions.execute).not.toHaveBeenCalled();
    view.rerender(<ControllerActions form={{ ...current, context: { ...current.context, intent: 'inspect' } }} />);
    expect(screen.getByRole('button', { name: 'Approve request' })).toBeDisabled();
    view.rerender(<ControllerActions form={{ ...current, context: { ...current.context, capabilities: { ...current.context.capabilities, actions: { 'kubernetes.cert-manager.v1': 'denied' } } } }} />);
    expect(screen.getByRole('button', { name: 'Approve request' })).toBeDisabled();
    expect(form.actions.execute).not.toHaveBeenCalled();
  });
});

describe('canonical certificate controls', () => {
  it.each(['create', 'inspect', 'disabled', 'denied', 'missing-version'] as const)('denies approval for %s without sending an action', restriction => {
    const form = props(csr, restriction === 'create' || restriction === 'inspect' ? restriction : 'action');
    const current: ResourceEditorFormProps = { ...form, section: 'lifecycle', disabled: restriction === 'disabled', context: { ...form.context,
      resourceVersion: restriction === 'missing-version' ? undefined : form.context.resourceVersion,
      capabilities: { ...form.context.capabilities, actions: { 'kubernetes.csr-approval.v1': restriction === 'denied' ? 'denied' : 'available' } },
    } };
    render(<CertificateSigningRequestForm {...current} />);
    expect(screen.getByRole('button', { name: 'Review approval' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review approval' }));
    expect(screen.queryByRole('button', { name: 'Confirm approval' })).not.toBeInTheDocument();
    expect(form.actions.execute).not.toHaveBeenCalled();
  });

  it('retains invalid lifetime locally across unrelated canonical revisions', () => {
    const form = props(); const view = render(<CertificateSigningRequestForm {...form} />);
    fireEvent.click(screen.getByText('Optional lifetime'));
    fireEvent.change(screen.getByLabelText('Requested lifetime (seconds)'), { target: { value: '60' } });
    expect(form.patch).not.toHaveBeenCalled(); expect(form.controller.getSource()).toBe(csr);
    form.controller.syncSource(csr + '# unrelated comment\n');
    view.rerender(<CertificateSigningRequestForm {...form} draft={form.controller.draft(resourceEditors[0].sensitivePaths)} />);
    expect((screen.getByLabelText('Requested lifetime (seconds)') as HTMLInputElement).value).toBe('60');
    expect(screen.getByRole('alert').textContent).toContain('600');
  });
  it('removes one usage while preserving unknown exact scalars and untouched row comments', () => {
    const form = props(); render(<CertificateSigningRequestForm {...form} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove usage 2' }));
    expect(form.controller.getSource()).toContain('client auth # keep comment');
    expect(form.controller.getSource()).toContain('90071992547409931234 # unknown stays exact');
    expect(form.controller.getSource()).not.toContain('- digital signature');
  });
  it('locks persisted CSR spec and controller rejects direct spec mutation', () => {
    const form = props(csr, 'edit'); render(<CertificateSigningRequestForm {...form} />);
    expect((screen.getByLabelText('Signer') as HTMLInputElement).disabled).toBe(true);
    expect(form.patch({ sessionID: form.draft.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'signerName'], value: 'other.invalid/signer' }] }).status).toBe('forbidden');
    expect(form.controller.getSource()).toBe(csr);
  });
  it('reviews approval without executing and sends only minimized approval input after confirmation', async () => {
    const form = props(csr, 'action'); render(<CertificateSigningRequestForm {...form} section="lifecycle" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review denial' }));
    expect(form.actions.execute).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm denial' })); });
    expect(form.actions.execute).toHaveBeenCalledWith(expect.objectContaining({ protocol: 'kubernetes.csr-approval.v1', input: { apiVersion: 'certificates.k8s.io/v1', kind: 'CertificateSigningRequest', metadata: { name: 'fixture', resourceVersion: '9' }, status: { conditions: [{ type: 'Denied', status: 'True', reason: 'OmniviewDenial' }] } } }));
    expect(form.controller.getSource()).toBe(csr);
    expect((screen.getByRole('button', { name: 'Review approval' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('does not expose signer material or enable contradictory terminal approval', () => {
    const form = props(csr + 'status:\n  conditions:\n    - type: Approved\n      status: "True"\n      message: do-not-display-this\n', 'action');
    render(<CertificateSigningRequestForm {...form} section="lifecycle" />);
    expect((screen.getByRole('button', { name: 'Review denial' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('do-not-display-this')).toBeNull();
    expect(form.actions.execute).not.toHaveBeenCalled();
  });
  it('discards async imported material if canonical revision changes before read completes', async () => {
    const form = props(); const view = render(<CertificateSigningRequestForm {...form} />);
    const { promise, resolve } = Promise.withResolvers<ArrayBuffer>();
    const file = new File([], 'request.pem');
    Object.defineProperty(file, 'arrayBuffer', { value: () => promise });
    fireEvent.change(screen.getByLabelText('Attach Certificate signing request'), { target: { files: [file] } });
    form.controller.syncSource(csr + '# newer revision\n');
    view.rerender(<CertificateSigningRequestForm {...form} draft={form.controller.draft(resourceEditors[0].sensitivePaths)} />);
    await act(async () => { resolve(new TextEncoder().encode(requestPEM).buffer); });
    expect(form.patch).not.toHaveBeenCalled();
    expect(form.controller.getSource()).toBe(csr + '# newer revision\n');
  });
  it('locks trust signer association on edit and never renders trust material', () => {
    const form = props('apiVersion: certificates.k8s.io/v1beta1\nkind: ClusterTrustBundle\nmetadata:\n  name: fixture.invalid:client:root\nspec:\n  signerName: fixture.invalid/client\n  trustBundle: hidden-trust-material\n', 'edit', 1);
    render(<ClusterTrustBundleForm {...form} />);
    expect((screen.getByLabelText('Associated signer') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByText('hidden-trust-material')).toBeNull();
  });
  it('inspects all kubelet binding fields without authoring or proof disclosure', () => {
    const form = props('apiVersion: certificates.k8s.io/v1beta1\nkind: PodCertificateRequest\nmetadata:\n  name: pod-request\n  namespace: fixture\nspec:\n  podName: workload\n  podUID: pod-uid\n  serviceAccountName: workload-account\n  serviceAccountUID: account-uid\n  nodeName: node-a\n  nodeUID: node-uid\n  maxExpirationSeconds: 86400\n  pkixPublicKey: hidden-public-key\n  proofOfPossession: hidden-proof\n', 'inspect', 2);
    render(<PodCertificateRequestForm {...form} />);
    expect(screen.getByText('workload')).toBeTruthy(); expect(screen.getByText('node-uid')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull(); expect(screen.queryByText('hidden-proof')).toBeNull();
    expect(form.patch).not.toHaveBeenCalled();
  });
});
describe('PEM import boundary', () => {
  it('accepts structurally valid generated public CSR and CA fixtures without asserting signer issuance', () => {
    const request = parseMaterial(requestPEM, 'request'); const trust = parseMaterial(caPEM, 'trust');
    expect(request.valid).toBe(true); expect(trust.valid).toBe(true);
    if (request.valid) expect(atob(request.value)).toBe(requestPEM);
  });
  it('rejects wrong material, duplicate authorities, extra text and DER truncation with constant safe errors', () => {
    expect(parseMaterial(caPEM, 'request').valid).toBe(false);
    expect(parseMaterial(caPEM + caPEM, 'trust').valid).toBe(false);
    expect(parseMaterial('private-value\n' + caPEM, 'trust')).toEqual(expect.objectContaining({ valid: false }));
    const failure = parseMaterial('-----BEGIN CERTIFICATE REQUEST-----\nAQID\n-----END CERTIFICATE REQUEST-----', 'request');
    expect(failure.valid).toBe(false); expect(JSON.stringify(failure)).not.toContain('AQID');
  });
});
describe('pending material callback ownership', () => {
  it('does not use a replaced patch callback after a file read', async () => {
    const form = props();
    const view = render(<CertificateSigningRequestForm {...form} />);
    const { promise, resolve } = Promise.withResolvers<ArrayBuffer>();
    const file = new File([], 'fixture.pem');
    Object.defineProperty(file, 'arrayBuffer', { value: () => promise });
    fireEvent.change(screen.getByLabelText('Attach Certificate signing request'), { target: { files: [file] } });
    const replacement = vi.fn<ResourceEditorFormProps['patch']>(request => form.patch(request));
    view.rerender(<CertificateSigningRequestForm {...form} patch={replacement} />);
    await act(async () => { resolve(new TextEncoder().encode(requestPEM).buffer); });
    expect(vi.mocked(form.patch).mock.calls.length).toBe(0);
    expect(replacement.mock.calls.length).toBe(0);
    expect(form.controller.getSource() === csr).toBe(true);
  });
});
describe('certificate revision lifecycles', () => {
  it('reflects externally edited valid scalars without discarding a local invalid sibling', () => {
    const form = props();
    const view = render(<CertificateSigningRequestForm {...form} />);
    fireEvent.click(screen.getByText('Optional lifetime'));
    fireEvent.change(screen.getByLabelText('Requested lifetime (seconds)'), { target: { value: '59' } });
    form.controller.syncSource(csr.replace('fixture.invalid/client', 'other.invalid/client'));
    view.rerender(<CertificateSigningRequestForm {...form} draft={form.controller.draft(resourceEditors[0].sensitivePaths)} />);
    expect((screen.getByLabelText('Signer') as HTMLInputElement).value).toBe('other.invalid/client');
    expect((screen.getByLabelText('Requested lifetime (seconds)') as HTMLInputElement).value).toBe('59');
    expect(form.patch).not.toHaveBeenCalled();
  });
  it('aborts an in-flight approval when the revision changes and suppresses its late result', async () => {
    const form = props(csr, 'action');
    const pending = Promise.withResolvers<{ status: 'ready'; output: Record<string, never> }>();
    const execute = vi.fn<ResourceEditorFormProps['actions']['execute']>(() => pending.promise);
    const view = render(<CertificateSigningRequestForm {...form} section="lifecycle" actions={{ execute }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review approval' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    const signal = execute.mock.calls[0][0].signal;
    form.controller.syncSource(csr + '# refreshed revision\n');
    view.rerender(<CertificateSigningRequestForm {...form} section="lifecycle" draft={form.controller.draft(resourceEditors[0].sensitivePaths)} actions={{ execute }} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve({ status: 'ready', output: {} }); });
    expect(screen.queryByText(/Approval update accepted/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Approval review' })).toBeNull();
    expect(form.controller.getSource()).toBe(csr + '# refreshed revision\n');
  });
});
