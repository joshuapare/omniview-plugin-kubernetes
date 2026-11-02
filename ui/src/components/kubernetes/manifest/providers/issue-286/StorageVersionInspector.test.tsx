import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResourceEditorDraft, ResourceEditorController } from '../../resourceEditorController';
import { resourceEditors } from './index';
import StorageVersionInspector from './StorageVersionInspector';
import { readConditions, readServerReports, reportWarnings, storageReadBoundary, storageVersionTarget, storageVersionUnavailable } from './storageVersion';

const source = `# API-server generated; preserve this comment.
apiVersion: internal.apiserver.k8s.io/v1alpha1
kind: StorageVersion
metadata:
  name: apps.deployments
  generation: 9007199254740993
spec: {}
status:
  commonEncodingVersion: apps/v1
  futureStatus: {enabled: true}
  storageVersions:
    - apiServerID: server-a
      encodingVersion: apps/v1
      decodableVersions: [apps/v1, apps/v1beta1]
      servedVersions: [apps/v1]
      futureReport: retained
    - apiServerID: server-b
      encodingVersion: apps/v1
      decodableVersions: [apps/v1]
      servedVersions: [apps/v1]
  conditions:
    - type: AllEncodingVersionsEqual
      status: 'True'
      observedGeneration: 9007199254740993
      lastTransitionTime: '2026-11-01T00:00:00Z'
      reason: ContentNotForDisplay
      message: PrivateFreeTextMustStayHidden
`;
const context: ResourceEditorContext = {
  ...storageVersionTarget, connectionID: 'fixture-only', name: 'apps.deployments', intent: 'inspect',
  discovery: { status: 'available', features: {} }, schema: { status: 'available' },
  capabilities: { create: 'available', update: 'available', delete: 'available', list: 'available', get: 'available', actions: {} },
};
function draft(text = source): ResourceEditorDraft {
  return createResourceEditorDraft(text, 'fixture-session', 0, resourceEditors[0].sensitivePaths);
}
function props(overrides: Partial<ResourceEditorFormProps> = {}): ResourceEditorFormProps {
  return {
    context, draft: draft(), section: 'reports', disabled: true,
    patch: vi.fn(() => ({ status: 'forbidden', message: 'Inspection only.' })), onValidityChange: vi.fn(),
    references: { list: vi.fn(async () => ({ status: 'ready' as const, items: [] })) },
    actions: { execute: vi.fn(async () => ({ status: 'unavailable' as const, message: 'No mutation protocol.' })) },
    ...overrides,
  };
}
afterEach(cleanup);

describe('StorageVersion inspection', () => {
  it('filters reports locally while all host mutation controls remain unused', () => {
    const input = props();
    render(<StorageVersionInspector {...input} />);
    fireEvent.change(screen.getByLabelText('Filter API servers'), { target: { value: 'SERVER-B' } });
    expect(screen.queryByRole('heading', { name: 'server-a' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'server-b' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter API servers'), { target: { value: 'no match' } });
    expect(screen.getByText('No matching API servers.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getByRole('heading', { name: 'server-a' })).toBeInTheDocument();
    expect(input.patch).not.toHaveBeenCalled();
    expect(input.actions.execute).not.toHaveBeenCalled();
    expect(input.references.list).not.toHaveBeenCalled();
  });

  it('does not infer common encoding from matching server reports', () => {
    render(<StorageVersionInspector {...props({ draft: draft(source.replace('  commonEncodingVersion: apps/v1\n', '')) })} />);
    expect(screen.getByText('Not reported')).toBeInTheDocument();
    expect(screen.queryByText('Server encoding reports differ.')).not.toBeInTheDocument();
  });

  it('surfaces contradictory reported common encoding without claiming migration health', () => {
    render(<StorageVersionInspector {...props({ draft: draft(source.replace('commonEncodingVersion: apps/v1', 'commonEncodingVersion: apps/v2')) })} />);
    expect(screen.getByText('Common encoding conflicts with a server report.')).toBeInTheDocument();
  });

  it('keeps observed generations exact and free-text conditions hidden', () => {
    render(<StorageVersionInspector {...props({ section: 'conditions' })} />);
    expect(screen.getByText('9007199254740993')).toBeInTheDocument();
    expect(screen.queryByText('ContentNotForDisplay')).not.toBeInTheDocument();
    expect(screen.queryByText('PrivateFreeTextMustStayHidden')).not.toBeInTheDocument();
    expect(screen.getAllByText('Reported · Content hidden')).toHaveLength(2);
  });

  it('does not convert unknown condition status into a successful observation', () => {
    const input = draft(source.replace("status: 'True'", "status: 'Unknown'"));
    expect(readConditions(input)[0].status).toBe('Unknown');
  });

  it.each(['denied', 'absent', 'unavailable', 'unknown'] as const)('does not show cached reports when discovery is %s', state => {
    const current = { ...context, discovery: { ...context.discovery, status: state } };
    render(<StorageVersionInspector {...props({ context: current })} />);
    expect(screen.getByRole('status')).toHaveTextContent('No current reports shown.');
    expect(screen.queryByRole('heading', { name: 'server-a' })).not.toBeInTheDocument();
  });

  it('distinguishes read denial from missing discovery', () => {
    expect(storageReadBoundary({ ...context, capabilities: { ...context.capabilities, get: 'denied' } })).toMatch(/^Read access denied/);
    expect(storageReadBoundary({ ...context, discovery: { ...context.discovery, status: 'absent' } })).toMatch(/not discovered/);
  });

  it('shows missing feature evidence as unknown rather than enabled', () => {
    render(<StorageVersionInspector {...props({ section: 'ownership' })} />);
    expect(screen.getAllByText('unknown')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /create|save|delete|enable/i })).not.toBeInTheDocument();
  });

  it('rejects unsupported mapped shapes while retaining unknown report siblings', () => {
    expect(storageVersionUnavailable(draft(), context)).toBeNull();
    expect(storageVersionUnavailable(draft(source.replace('decodableVersions: [apps/v1]', 'decodableVersions: false')), context)).toMatch(/Unsupported server reports/);
    expect(storageVersionUnavailable(draft(), { ...context, version: 'v1' })).toMatch(/Unsupported StorageVersion representation/);
    expect(storageVersionUnavailable(draft(source.replace('spec: {}', 'spec: {futureIntent: true}')), context)).toMatch(/Unsupported StorageVersion spec/);
  });

  it('flags invalid decode-set reports without editing server claims', () => {
    const reports = readServerReports(draft(source.replace('decodableVersions: [apps/v1]', 'decodableVersions: [apps/v1beta1]')));
    expect(reportWarnings(reports[1])).toEqual([
      'Encoding version is missing from the decode set.', 'A served version is missing from the decode set.',
    ]);
  });

  it('keeps empty reports distinct from missing API', () => {
    render(<StorageVersionInspector {...props({ draft: draft('apiVersion: internal.apiserver.k8s.io/v1alpha1\nkind: StorageVersion\nspec: {}\nstatus: {}\n') })} />);
    expect(screen.getByText('No server reports. Encoding agreement is unknown.')).toBeInTheDocument();
    expect(screen.queryByText(/API not discovered/)).not.toBeInTheDocument();
  });

  it('rejects writes on the edit route even with discovered write permissions and preserves exact source', () => {
    const controller = new ResourceEditorController(source, 'read-only-edit');
    const result = controller.patch({
      sessionID: controller.sessionID, expectedRevision: 0,
      operations: [{ op: 'set', path: ['status', 'commonEncodingVersion'], value: 'apps/v2' }],
    }, resourceEditors[0], { ...context, intent: 'edit' });
    expect(result.status).toBe('forbidden');
    expect(controller.getSource()).toBe(source);
    expect(controller.revision).toBe(0);
    expect(controller.draft(resourceEditors[0].sensitivePaths).get(['status', 'conditions', 0, 'message'])).not.toBe('PrivateFreeTextMustStayHidden');
  });
});
