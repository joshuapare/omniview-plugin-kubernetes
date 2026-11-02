import type { ResourceEditorContext, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ResourceEditorController } from '../../resourceEditorController';

import { controllerRuntimeClass, populatedRuntimeClass, runtimeClassContext, unsupportedRuntimeClass } from './fixtures';
import { resourceEditors } from './index';
import { duplicateToleration, handlerError, quantityError, readOnly, secondsError, unavailable } from './model';
import RuntimeClassForm from './RuntimeClassForm';

const contribution = resourceEditors[0];
function Harness({ controller, context = runtimeClassContext, section = 'runtime', onValidity = vi.fn() }: { controller: ResourceEditorController; context?: ResourceEditorContext; section?: string; onValidity?: (error: string | null) => void }) {
  const [, refresh] = useState(0);
  const props: ResourceEditorFormProps = {
    context, draft: controller.draft(contribution.sensitivePaths), section, disabled: false,
    patch: request => { const result = controller.patch(request, contribution, context); if (result.status === 'accepted') refresh(value => value + 1); return result; },
    onValidityChange: onValidity,
    references: { list: async () => ({ status: 'unavailable', message: 'Fixture has no references.' }) },
    actions: { execute: async () => ({ status: 'unavailable', message: 'No live requests.' }) },
  };
  return <RuntimeClassForm {...props} />;
}

describe('RuntimeClass behavior', () => {
  it('retains invalid quantity input locally across sibling revisions and sections', () => {
    const controller = new ResourceEditorController(populatedRuntimeClass, 'quantity');
    const onValidity = vi.fn();
    const view = render(<Harness controller={controller} onValidity={onValidity} />);
    fireEvent.change(screen.getByLabelText('CPU overhead'), { target: { value: '12m?' } });
    expect(controller.draft().get(['overhead', 'podFixed', 'cpu'])).toBe('100m');
    fireEvent.change(screen.getByLabelText('Memory overhead'), { target: { value: '64Mi' } });
    expect(screen.getByLabelText('CPU overhead')).toHaveValue('12m?');
    view.rerender(<Harness controller={controller} section="scheduling" onValidity={onValidity} />);
    view.rerender(<Harness controller={controller} section="runtime" onValidity={onValidity} />);
    expect(screen.getByLabelText('CPU overhead')).toHaveValue('12m?');
    expect(onValidity).toHaveBeenLastCalledWith('Enter a nonnegative Kubernetes quantity.');
    fireEvent.change(screen.getByLabelText('CPU overhead'), { target: { value: '125m' } });
    expect(controller.draft().get(['overhead', 'podFixed', 'cpu'])).toBe('125m');
    expect(controller.getSource()).toContain('# Preserve this admission note.');
    expect(controller.draft().get(['overhead', 'podFixed', 'example.test/accelerator'])).toBe('1');
    expect(controller.draft().get(['futureExtension', 'exactInteger'])).toBe(9007199254740993n);
    expect(controller.draft().get(['futureExtension', 'typedBoolean'])).toBe(false);
  });
  it('locks edit handler and all controls for controller-owned objects', () => {
    const controller = new ResourceEditorController(populatedRuntimeClass, 'edit');
    const view = render(<Harness controller={controller} context={{ ...runtimeClassContext, intent: 'edit' }} />);
    expect(screen.getByLabelText('Handler')).toBeDisabled();
    expect(screen.getByLabelText('CPU overhead')).not.toBeDisabled();
    view.unmount();
    render(<Harness controller={new ResourceEditorController(controllerRuntimeClass, 'owner')} context={{ ...runtimeClassContext, intent: 'edit' }} />);
    expect(screen.getByLabelText('CPU overhead')).toBeDisabled();
    expect(screen.getByText('Managed object · change its owning configuration.')).toBeInTheDocument();
  });
  it('edits exact toleration seconds without replacing unknown row siblings', () => {
    const controller = new ResourceEditorController(populatedRuntimeClass, 'toleration');
    render(<Harness controller={controller} section="scheduling" />);
    fireEvent.change(screen.getByLabelText('Toleration seconds 1'), { target: { value: '-' } });
    expect(controller.draft().get(['scheduling', 'tolerations', 0, 'tolerationSeconds'])).toBe(9007199254740993n);
    fireEvent.change(screen.getByLabelText('Toleration seconds 1'), { target: { value: '9007199254740995' } });
    expect(controller.draft().get(['scheduling', 'tolerations', 0, 'tolerationSeconds'])).toBe(9007199254740995n);
    expect(controller.draft().get(['scheduling', 'tolerations', 0, 'futureField'])).toBe('retain');
    expect(controller.getSource()).toContain('# Preserve this admission note.');
  });
  it('adds and removes tolerations explicitly without altering node labels', () => {
    const controller = new ResourceEditorController(populatedRuntimeClass, 'rows');
    render(<Harness controller={controller} section="scheduling" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add toleration' }));
    fireEvent.change(screen.getByLabelText('New taint key'), { target: { value: 'runtime.example.test/second' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));
    expect(controller.draft().get(['scheduling', 'tolerations', 1, 'key'])).toBe('runtime.example.test/second');
    fireEvent.click(screen.getByRole('button', { name: 'Remove toleration 1' }));
    expect(controller.draft().get(['scheduling', 'tolerations', 0, 'key'])).toBe('runtime.example.test/second');
    expect(controller.draft().get(['scheduling', 'nodeSelector', 'runtime.example.test/enabled'])).toBe('true');
  });
  it('switches conditional branches atomically and restores local branch drafts', async () => {
    const controller = new ResourceEditorController(populatedRuntimeClass, 'branches');
    render(<Harness controller={controller} section="scheduling" />);
    fireEvent.click(screen.getByLabelText('Operator 1'));
    const exists = await screen.findByRole('option', { name: 'Exists' });
    fireEvent.pointerDown(exists, { pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(exists, { pointerType: 'mouse', button: 0 });
    fireEvent.click(exists);
    expect(controller.draft().has(['scheduling', 'tolerations', 0, 'value'])).toBe(false);
    expect(screen.queryByLabelText('Taint value 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Operator 1'));
    const equal = await screen.findByRole('option', { name: 'Equal' });
    fireEvent.pointerDown(equal, { pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(equal, { pointerType: 'mouse', button: 0 });
    fireEvent.click(equal);
    expect(screen.getByLabelText('Taint value 1')).toHaveValue('enabled');
    expect(controller.draft().get(['scheduling', 'tolerations', 0, 'value'])).toBe('enabled');
    fireEvent.click(screen.getByLabelText('Effect 1'));
    const noSchedule = await screen.findByRole('option', { name: 'NoSchedule' });
    fireEvent.pointerDown(noSchedule, { pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(noSchedule, { pointerType: 'mouse', button: 0 });
    fireEvent.click(noSchedule);
    expect(controller.draft().has(['scheduling', 'tolerations', 0, 'tolerationSeconds'])).toBe(false);
    expect(controller.draft().get(['scheduling', 'tolerations', 0, 'futureField'])).toBe('retain');
  });
  it('retains another row partial input when an earlier row is removed', () => {
    const initial = populatedRuntimeClass.replace('futureExtension:', `    - key: second
      effect: NoExecute
      tolerationSeconds: 3
futureExtension:`);
    const controller = new ResourceEditorController(initial, 'stable-rows');
    expect(controller.draft().get(['scheduling', 'tolerations'])).toHaveLength(2);
    expect(controller.draft().get(['scheduling', 'tolerations', 1, 'key'])).toBe('second');
    render(<Harness controller={controller} section="scheduling" />);
    fireEvent.change(screen.getByLabelText('Toleration seconds 2'), { target: { value: '-' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove toleration 1' }));
    expect(screen.getByLabelText('Toleration seconds 1')).toHaveValue('-');
    expect(controller.draft().get(['scheduling', 'tolerations', 0, 'tolerationSeconds'])).toBe(3n);
    expect(controller.draft().get(['scheduling', 'tolerations', 0, 'key'])).toBe('second');
    fireEvent.change(screen.getByLabelText('Toleration seconds 1'), { target: { value: '7' } });
    expect(controller.draft().get(['scheduling', 'tolerations', 0, 'tolerationSeconds'])).toBe(7n);
  });
  it('keeps missing, denied, unavailable, unsafe shape and trusted ownership distinct', () => {
    const controller = new ResourceEditorController(populatedRuntimeClass);
    expect(unavailable(controller.draft(), { ...runtimeClassContext, discovery: { status: 'absent', features: {} } })).toContain('absent');
    expect(unavailable(controller.draft(), { ...runtimeClassContext, discovery: { status: 'denied', features: {} } })).toContain('denied');
    expect(unavailable(controller.draft(), { ...runtimeClassContext, discovery: { status: 'unavailable', features: {} } })).toContain('unavailable');
    const unsupported = new ResourceEditorController(unsupportedRuntimeClass);
    expect(unavailable(unsupported.draft(), runtimeClassContext)).toContain('Unsupported toleration');
    expect(unsupported.getSource()).toBe(unsupportedRuntimeClass);
    const effectSource = populatedRuntimeClass.replace('effect: NoExecute', 'effect: {unexpected: object}');
    const effectController = new ResourceEditorController(effectSource);
    expect(unavailable(effectController.draft(), runtimeClassContext)).toContain('Unsupported toleration');
    expect(effectController.getSource()).toBe(effectSource);
    expect(readOnly(controller.draft(), { ...runtimeClassContext, ownership: { status: 'controller' } })).toBe(true);
    expect(readOnly(controller.draft(), { ...runtimeClassContext, ownership: { status: 'unknown' } })).toBe(false);
  });
  it('matches Kubernetes handler, quantity, duplicate and int64 boundaries', () => {
    expect(handlerError('UpperCase')).not.toBeNull();
    expect(handlerError('valid-handler')).toBeNull();
    for (const value of ['0', '100m', '.5', '32Mi', '2e3', '+1Gi']) expect(quantityError(value)).toBeNull();
    for (const value of ['-1', '1K', 'NaN', '1 Mi', '12m?']) expect(quantityError(value)).not.toBeNull();
    expect(secondsError('-1')).toBeNull();
    expect(secondsError('9223372036854775808')).not.toBeNull();
    expect(duplicateToleration([{ key: 'isolated', effect: 'NoExecute', tolerationSeconds: 1n }], { key: 'isolated', operator: 'Equal', effect: 'NoExecute', tolerationSeconds: 2n })).toBe(true);
  });
});
