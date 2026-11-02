import { fireEvent, render, screen } from '@testing-library/react';
import type { ResourceEditorDraft, ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { describe, expect, it, vi } from 'vitest';
import AdmissionReviewInspector from './AdmissionReviewInspector';
import { summarizeAdmissionReview } from './admissionReview';

const envelope = () => ({
  apiVersion: 'admission.k8s.io/v1', kind: 'AdmissionReview',
  request: {
    uid: 'exchange-1', kind: { group: 'apps', version: 'v1', kind: 'Deployment' },
    resource: { group: 'apps', version: 'v1', resource: 'deployments' }, operation: 'UPDATE',
    name: 'workload', namespace: 'preview',
    requestKind: { group: 'apps', version: 'v1beta1', kind: 'Deployment' },
    requestResource: { group: 'apps', version: 'v1beta1', resource: 'deployments' },
  },
  response: { uid: 'exchange-1', allowed: true },
});
function draftFor(value: unknown, revision = 0) {
  const get = vi.fn((path: ResourceEditorPath): unknown => {
    let current = value;
    for (const segment of path) {
      if (current === null || typeof current !== 'object') return undefined;
      current = (current as Record<string | number, unknown>)[segment];
    }
    return current;
  });
  const draft: ResourceEditorDraft = { sessionID: 'fixture-288', revision, get, has: path => get(path) !== undefined };
  return { draft, get };
}
function propsFor(value: unknown, section = 'request'): ResourceEditorFormProps {
  return {
    draft: draftFor(value).draft, section, disabled: false,
    context: {
      group: 'admission.k8s.io', version: 'v1', kind: 'AdmissionReview', resource: '', scope: 'Cluster',
      connectionID: 'fixture', intent: 'inspect',
      capabilities: { create: 'absent', update: 'absent', delete: 'absent', list: 'absent', get: 'absent', actions: {} },
      discovery: { status: 'available', features: {} }, schema: { status: 'available' },
    },
    patch: vi.fn(() => ({ status: 'forbidden', message: 'Protocol is read-only.' })),
    onValidityChange: vi.fn(),
    references: { list: vi.fn(async () => ({ status: 'absent', message: 'No fixture lookup.' })) },
    actions: { execute: vi.fn(async () => ({ status: 'absent', message: 'No capture transport.' })) },
  };
}

describe('AdmissionReview safety and protocol semantics', () => {
  it('does not conflate omitted dryRun, false, true, or a quoted false', () => {
    const value = envelope();
    expect(summarizeAdmissionReview(draftFor(value).draft).dryRun).toBe('Omitted (defaults to false)');
    const request = value.request;
    for (const [input, output] of [[false, 'No'], [true, 'Yes'], ['false', 'Unsupported value']] as const) {
      const summary = summarizeAdmissionReview(draftFor({ ...value, request: { ...request, dryRun: input } }).draft);
      expect(summary.dryRun).toBe(output);
      expect(summary.issues.some(issue => issue.includes('Dry-run'))).toBe(typeof input !== 'boolean');
    }
  });
  it('requires matching nonempty string UIDs and exact boolean decisions', () => {
    const value = envelope();
    const mismatch = summarizeAdmissionReview(draftFor({ ...value, response: { uid: 'exchange-2', allowed: 'true' } }).draft);
    expect(mismatch.correlated).toBe(false);
    expect(mismatch.issues).toContain('Request and response UIDs do not match. Do not treat these as one exchange.');
    expect(mismatch.decision).toBe('Unsupported decision');
    expect(summarizeAdmissionReview(draftFor({ ...value, request: { ...value.request, uid: '' }, response: { uid: '', allowed: false } }).draft).correlated).toBe(false);
  });
  it('never reads protected payload contents or echoes unknown free text', () => {
    const value = { ...envelope(),
      request: { ...envelope().request, object: {}, oldObject: {}, options: {}, userInfo: {} },
      response: { uid: 'exchange-1', allowed: false, patch: 'withheld-fixture-value', patchType: 'JSONPatch', warnings: ['withheld-fixture-value'], auditAnnotations: {}, status: { code: 403n, status: 'Failure', reason: 'Forbidden', message: 'withheld-fixture-value', details: {} } },
      unrecognized: 'withheld-fixture-value',
    };
    const { draft, get } = draftFor(value);
    const protectedRoots = ['request.object', 'request.oldObject', 'request.options', 'request.userInfo', 'response.patch', 'response.warnings', 'response.auditAnnotations', 'response.status.message', 'response.status.details'];
    const guarded: ResourceEditorDraft = { ...draft, get: path => {
      expect(protectedRoots).not.toContain(path.join('.'));
      return get(path);
    } };
    const summary = summarizeAdmissionReview(guarded);
    expect(JSON.stringify(summary)).not.toContain('withheld-fixture-value');
    expect(summary.code).toBe('403');
    expect(summary.payloads.find(item => item.path === 'response.patch')?.state).toBe('Withheld');
  });
  it('supports retained beta without claiming served discovery or final admission', () => {
    const value = { ...envelope(), apiVersion: 'admission.k8s.io/v1beta1' };
    const summary = summarizeAdmissionReview(draftFor(value).draft);
    expect(summary.supported).toBe(true);
    expect(summary.status).toBe('Ignored for an allowed response');
    expect(summary.decision).toBe('Allowed by this webhook');
    expect(summarizeAdmissionReview(draftFor({ ...value, apiVersion: 'admission.k8s.io/vNext' }).draft).supported).toBe(false);
  });
  it('keeps original conversion fields independent and unnamed CREATE unnamed', () => {
    const value = envelope();
    const summary = summarizeAdmissionReview(draftFor({ ...value, request: { ...value.request, operation: 'CREATE', name: '', subResource: 'scale', requestSubResource: 'status' } }).draft);
    expect(summary.name).toBe('(empty)');
    expect(summary.originalKind).toContain('v1beta1');
    expect(summary.targetKind).toContain('v1 /');
    expect(summary.subresource).toBe('scale');
    expect(summary.originalSubresource).toBe('status');
  });
});

describe('AdmissionReview production inspection controls', () => {
  it('expands original conversion fields without patching or executing', () => {
    const props = propsFor(envelope());
    render(<AdmissionReviewInspector {...props} />);
    expect(screen.queryByText('Original kind')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show original request' }));
    expect(screen.getByText('Original kind')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide original request' })).toHaveAttribute('aria-expanded', 'true');
    expect(props.patch).not.toHaveBeenCalled();
    expect(props.actions.execute).not.toHaveBeenCalled();
  });
  it('checks correlation locally and clears the result when canonical revision changes', () => {
    const props = propsFor(envelope(), 'review');
    const { rerender } = render(<AdmissionReviewInspector {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check exchange locally' }));
    expect(screen.getByRole('status')).toHaveTextContent('UIDs correlate. This does not prove final admission');
    rerender(<AdmissionReviewInspector {...props} draft={draftFor(envelope(), 1).draft} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(props.actions.execute).not.toHaveBeenCalled();
    expect(props.patch).not.toHaveBeenCalled();
  });
  it('surfaces UID mismatch without exposing free-text status or offering mutation', () => {
    const value = envelope();
    const props = propsFor({ ...value, response: { uid: 'different', allowed: false, status: { message: 'withheld-fixture-value' } } }, 'response');
    render(<AdmissionReviewInspector {...props} />);
    expect(screen.getByRole('alert')).toHaveTextContent('UIDs do not match');
    expect(props.onValidityChange).toHaveBeenCalledWith(expect.any(String));
    expect(screen.queryByText('withheld-fixture-value')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save|create|replay/i })).not.toBeInTheDocument();
  });
  it('distinguishes an absent capture from an admission decision', () => {
    render(<AdmissionReviewInspector {...propsFor({ apiVersion: 'admission.k8s.io/v1', kind: 'AdmissionReview' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('No admission capture is attached');
    expect(screen.queryByText('Allowed by this webhook')).not.toBeInTheDocument();
  });
});
