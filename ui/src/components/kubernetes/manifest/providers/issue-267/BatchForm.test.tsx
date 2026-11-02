import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import BatchForm from './BatchForm';
import { resourceEditors } from './index';
import { batchFixtureContext, cronJobFixture, jobFixture } from './fixtures';
import { batchReadOnly, batchUnavailable, INT64_MAX, parseInteger, scheduleError, timeZoneError, validateBatch } from './batchModel';

function Harness({ source = jobFixture, section = 'execution', context = batchFixtureContext('Job'), controller, validity = () => {}, execute = async () => ({ status: 'unavailable', message: 'Fixture only.' } as const) }: {
  source?: string; section?: string; context?: ResourceEditorContext; controller?: ResourceEditorController;
  validity?: ResourceEditorFormProps['onValidityChange']; execute?: ResourceEditorFormProps['actions']['execute'];
}) {
  const [owned] = useState(() => controller ?? new ResourceEditorController(source, 'batch-test'));
  const [, update] = useState(0);
  const contribution = resourceEditors[context.kind === 'CronJob' ? 1 : 0];
  return <BatchForm context={context} draft={owned.draft(contribution.sensitivePaths)} section={section} disabled={false} onValidityChange={validity}
    patch={request => { const result = owned.patch(request, contribution, context); if (result.status === 'accepted') update(value => value + 1); return result; }}
    references={{ list: async () => ({ status: 'unavailable', message: 'Fixture only.' }) }} actions={{ execute }} />;
}

describe('batch editing behavior', () => {
  it('keeps invalid integers local across sibling revisions and reports pending validity', async () => {
    const controller = new ResourceEditorController(jobFixture, 'invalid-local');
    const validity = vi.fn();
    render(<Harness controller={controller} validity={validity} />);
    fireEvent.change(screen.getByLabelText('Concurrent Pods'), { target: { value: '-' } });
    expect(controller.draft().get(['spec', 'parallelism'])).toBe(2n);
    fireEvent.change(screen.getByLabelText('Retry limit'), { target: { value: '7' } });
    expect(screen.getByLabelText('Concurrent Pods')).toHaveValue('-');
    expect(controller.draft().get(['spec', 'backoffLimit'])).toBe(7n);
    await waitFor(() => expect(validity).toHaveBeenLastCalledWith('Enter a whole number.'));
    fireEvent.change(screen.getByLabelText('Concurrent Pods'), { target: { value: '6' } });
    expect(controller.draft().get(['spec', 'parallelism'])).toBe(6n);
  });
  it('distinguishes omitted TTL, zero TTL and exact int64 values', () => {
    const controller = new ResourceEditorController(jobFixture, 'numbers');
    render(<Harness controller={controller} />);
    fireEvent.change(screen.getByLabelText('Finished cleanup TTL (seconds)'), { target: { value: '0' } });
    expect(controller.draft().get(['spec', 'ttlSecondsAfterFinished'])).toBe(0n);
    expect(screen.getByText('Finished Jobs become immediately eligible for deletion.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Finished cleanup TTL (seconds)'), { target: { value: '' } });
    expect(controller.draft().has(['spec', 'ttlSecondsAfterFinished'])).toBe(false);
    fireEvent.change(screen.getByLabelText('Active deadline (seconds)'), { target: { value: '9007199254740993' } });
    expect(controller.draft().get(['spec', 'activeDeadlineSeconds'])).toBe(9007199254740993n);
  });
  it('changes one image without replacing protected environment or sibling comments', () => {
    const controller = new ResourceEditorController(jobFixture, 'template');
    render(<Harness section="template" controller={controller} />);
    fireEvent.change(screen.getByLabelText('Container 1 image'), { target: { value: 'registry.example.invalid/report:v3' } });
    expect(controller.draft().get(['spec', 'template', 'spec', 'containers', 0, 'image'])).toBe('registry.example.invalid/report:v3');
    expect(controller.draft().get(['spec', 'template', 'spec', 'containers', 0, 'env', 0, 'valueFrom', 'secretKeyRef', 'name'])).toBe('report-config');
    expect(controller.getSource()).toContain('# preserve sibling comment');
  });
  it('adds and removes ordered argument nodes without rebuilding containers', () => {
    const controller = new ResourceEditorController(jobFixture, 'args');
    render(<Harness section="template" controller={controller} />);
    fireEvent.click(screen.getByText('Add argument'));
    fireEvent.change(screen.getByLabelText('Argument 3'), { target: { value: '--compact' } });
    fireEvent.click(screen.getByLabelText('Remove argument 1'));
    expect(controller.draft().get(['spec', 'template', 'spec', 'containers', 0, 'args'])).toEqual(['json', '--compact']);
    expect(controller.getSource()).toContain('# preserve sibling comment');
  });
  it('locks Job executable fields on edit and denies controller-owned patches', () => {
    const context = batchFixtureContext('Job', 'edit');
    const controller = new ResourceEditorController(jobFixture, 'immutable');
    const { unmount } = render(<Harness section="template" context={context} controller={controller} />);
    expect(screen.getByLabelText('Container 1 image')).toBeDisabled();
    unmount();
    const owned = jobFixture.replace('  namespace: operations', '  namespace: operations\n  ownerReferences: [{apiVersion: batch/v1, kind: CronJob, name: nightly, uid: fixture, controller: true}]');
    const ownedController = new ResourceEditorController(owned, 'owned');
    expect(batchReadOnly(ownedController.draft(), context)).toBe(true);
    expect(ownedController.patch({ sessionID: 'owned', expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'parallelism'], value: 9n }] }, resourceEditors[0], context).status).toBe('forbidden');
    expect(ownedController.getSource()).toBe(owned);
  });
  it('stages Indexed resize as one atomic paired update', () => {
    const controller = new ResourceEditorController(jobFixture.replace('  parallelism: 2', '  completionMode: Indexed\n  parallelism: 2'), 'resize');
    render(<Harness controller={controller} context={batchFixtureContext('Job', 'edit')} />);
    fireEvent.change(screen.getByLabelText('New parallelism and completions'), { target: { value: '8' } });
    fireEvent.click(screen.getByText('Stage resize'));
    expect(controller.revision).toBe(1);
    expect(controller.draft().get(['spec', 'parallelism'])).toBe(8n);
    expect(controller.draft().get(['spec', 'completions'])).toBe(8n);
  });
  it('edits CronJob scheduling without touching nested Job suspension or metadata layers', () => {
    const source = cronJobFixture.replace('      backoffLimit: 3', '      suspend: true\n      backoffLimit: 3');
    const controller = new ResourceEditorController(source, 'cron');
    render(<Harness source={source} controller={controller} context={batchFixtureContext('CronJob', 'edit')} section="schedule" />);
    fireEvent.change(screen.getByLabelText('Cron schedule'), { target: { value: '15 3 * * MON-FRI' } });
    expect(controller.draft().get(['spec', 'schedule'])).toBe('15 3 * * MON-FRI');
    expect(controller.draft().get(['spec', 'jobTemplate', 'spec', 'suspend'])).toBe(true);
    expect(controller.draft().get(['spec', 'jobTemplate', 'metadata', 'labels', 'team'])).toBe('reporting');
  });
  it('requires saved-only independent launch authorization and sends no projected template', async () => {
    const context = batchFixtureContext('CronJob', 'edit');
    context.capabilities.actions = { 'kubernetes.cronjob-run-now.v1': 'available' };
    const execute = vi.fn(async () => ({ status: 'ready', output: { opened: true } } as const));
    render(<Harness source={cronJobFixture} section="workflow" context={context} execute={execute} />);
    fireEvent.click(screen.getByText('Review manual Job'));
    await screen.findByText('Job creation review opened. No Job has been submitted.');
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ protocol: 'kubernetes.cronjob-run-now.v1', input: {}, sessionID: 'batch-test', generation: 0, signal: expect.any(AbortSignal) }));
  });
});

describe('batch domain validation', () => {
  it('screens cron ranges and allows Kubernetes named ranges/macros', () => {
    expect(scheduleError('61 2 * * *')).not.toBeNull();
    expect(scheduleError('0 2 * JAN-MAR MON-FRI')).toBeNull();
    expect(scheduleError('*/0 * * * *')).not.toBeNull();
    expect(scheduleError('@daily')).toBeNull();
    expect(scheduleError('TZ=UTC 0 2 * * *')).not.toBeNull();
    expect(timeZoneError('Local')).not.toBeNull();
    expect(timeZoneError('Etc/UTC')).toBeNull();
  });
  it('rejects int64 overflow and preserves exact wide integer parsing', () => {
    expect(parseInteger('9007199254740993', INT64_MAX).value).toBe(9007199254740993n);
    expect(parseInteger('9223372036854775808', INT64_MAX).error).not.toBeNull();
    expect(parseInteger('').value).toBeUndefined();
    expect(parseInteger('0').value).toBe(0n);
  });
  it('validates per-index policy dependencies and preserves unsupported versions', () => {
    const source = jobFixture.replace('  parallelism: 2', '  backoffLimitPerIndex: 2\n  maxFailedIndexes: 7\n  parallelism: 2');
    const draft = new ResourceEditorController(source).draft();
    expect(validateBatch(draft, batchFixtureContext('Job')).map(issue => issue.message)).toContain('Per-index retries require Indexed execution.');
    const unsupported = new ResourceEditorController(jobFixture.replace('  parallelism: 2', '  completionMode: FutureMode\n  parallelism: 2'));
    expect(batchUnavailable(unsupported.draft(), batchFixtureContext('Job'))).not.toBeNull();
    expect(unsupported.getSource()).toContain('completionMode: FutureMode');
  });
});
