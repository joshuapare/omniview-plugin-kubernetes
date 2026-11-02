import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorPatchRequest } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import ImageReviewInspector from './ImageReviewInspector';
import { resourceEditors } from './index';
import { imageReviewDecision, imageReviewImages, imageReviewNamespace } from './model';

const contribution = resourceEditors[0];
const context: ResourceEditorContext = {
  group: 'imagepolicy.k8s.io', version: 'v1alpha1', kind: 'ImageReview', resource: '', scope: 'Cluster',
  connectionID: 'fixture-only', intent: 'inspect',
  capabilities: { create: 'absent', update: 'absent', delete: 'absent', list: 'absent', get: 'unknown', actions: {} },
  discovery: { status: 'available', features: {} }, schema: { status: 'available' },
};
const envelope = 'apiVersion: imagepolicy.k8s.io/v1alpha1\nkind: ImageReview\nspec:\n  namespace: team-a\n  containers:\n    - image: registry.example.test/image:tag\n  annotations:\n    policy.image-policy.k8s.io/check: DO_NOT_DISPLAY_REQUEST\n';
const services = {
  references: { list: vi.fn(async () => ({ status: 'absent' as const, message: 'No fixture references.' })) },
  actions: { execute: vi.fn(async () => ({ status: 'absent' as const, message: 'No ImageReview action exists.' })) },
};
function mount(source: string, section = 'request', currentContext = context) {
  const controller = new ResourceEditorController(source, 'inspection-test');
  const patch = vi.fn((request: ResourceEditorPatchRequest) => controller.patch(request, contribution, currentContext));
  const props = { context: currentContext, draft: controller.draft(contribution.sensitivePaths), section, disabled: false, patch, onValidityChange: vi.fn(), ...services };
  return { controller, props, patch, ...render(<ImageReviewInspector {...props} />) };
}
describe('ImageReview protocol inspection', () => {
  it.each([
    ['', 'request-only'],
    ['status: {}\n', 'invalid'],
    ['status: {allowed: "true"}\n', 'invalid'],
    ['status: {allowed: 1}\n', 'invalid'],
    ['status: {allowed: true}\n', 'allowed'],
    ['status: {allowed: false}\n', 'denied'],
  ])('never infers approval from %s', (response, expected) => {
    const controller = new ResourceEditorController(envelope + response);
    expect(imageReviewDecision(controller.draft())).toBe(expected);
  });

  it('shows image rows without reading image values or policy annotations', () => {
    const { props, controller, patch } = mount(envelope);
    expect(screen.getByRole('textbox', { name: 'Image 1' })).toHaveValue('Image reference hidden');
    expect(screen.getByRole('textbox', { name: 'Image 1' })).toHaveAttribute('readonly');
    expect(screen.getByText('1 · values hidden')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('DO_NOT_DISPLAY_REQUEST');
    expect(document.body.textContent).not.toContain('registry.example.test');
    expect(imageReviewImages(props.draft)).toEqual([{ hasImage: true }]);
    fireEvent.click(screen.getByLabelText('Help: Images'));
    expect(controller.getSource()).toBe(envelope);
    expect(patch).not.toHaveBeenCalled();
  });

  it('keeps response free text and audit keys out of all rendered text', () => {
    mount(envelope + 'status:\n  allowed: false\n  reason: DO_NOT_DISPLAY_REASON\n  auditAnnotations:\n    DO_NOT_DISPLAY_KEY: DO_NOT_DISPLAY_AUDIT\n', 'decision');
    expect(screen.getByText('Denied snapshot')).toBeInTheDocument();
    expect(screen.getByText('Present · hidden')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('DO_NOT_DISPLAY');
    expect(services.actions.execute).not.toHaveBeenCalled();
  });

  it('rejects every mutation and preserves unsupported siblings, comments and exact integers', () => {
    const source = envelope + '# retained evidence\nunknown: 9007199254740993\nstatus: {allowed: false}\n';
    const controller = new ResourceEditorController(source, 'read-only');
    const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['status', 'allowed'], value: true }] }, contribution, context);
    expect(result.status).toBe('forbidden');
    expect(controller.getSource()).toBe(source);
  });

  it('does not echo malformed namespace or collapse malformed containers into empty', () => {
    const controller = new ResourceEditorController('spec: {namespace: "DO_NOT_DISPLAY", containers: malformed}\n');
    expect(imageReviewNamespace(controller.draft())).toBe('Unavailable');
    expect(imageReviewImages(controller.draft())).toBeNull();
  });

  it('distinguishes evidence access denial from missing evidence and backend availability', () => {
    mount(envelope, 'integration', { ...context, capabilities: { ...context.capabilities, get: 'denied' } });
    expect(screen.getAllByText('Evidence access denied')).toHaveLength(2);
    expect(screen.getByText('Webhook availability').nextElementSibling).toHaveTextContent('Unknown');
    expect(screen.queryByText('No captured ImageReview evidence.')).not.toBeInTheDocument();
  });
});
