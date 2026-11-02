import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorFormProps, ResourceEditorReferenceRequest, ResourceEditorReferenceResult, ResourceEditorReferenceService } from '@omniviewdev/runtime';
import { createResourceEditorDraft, ResourceEditorController } from '../../resourceEditorController';
import EventInspector from './EventInspector';
import { eventContext, recurringEventSource, singletonEventSource, fixtureEventReferences, fixtureEventActions } from './EventInspector.fixtures';
import { coreEventAlias, eventReference, eventText } from './eventModel';
import { resourceEditors } from './index';

// Object navigation belongs to the existing native inspector, not this provider's tests.
vi.mock('../../../../shared/ResourceLinkChip', () => ({ default: () => <button>Inspect referenced object</button> }));

function props(source = recurringEventSource, section = 'diagnostics'): ResourceEditorFormProps {
  return {
    context: eventContext,
    draft: createResourceEditorDraft(source, 'event-test', 0, resourceEditors[0].sensitivePaths),
    section, disabled: true, patch: vi.fn(() => ({ status: 'forbidden', message: 'Read-only.' })), onValidityChange: vi.fn(),
    references: fixtureEventReferences(), actions: fixtureEventActions,
  };
}

describe('Event diagnostic boundary', () => {
  it('never renders diagnostic text or annotation values, including in accessible help', () => {
    const material = 'private-diagnostic-sentinel';
    const source = recurringEventSource.replace('Fixture diagnostic text is intentionally withheld.', material).replace('  name: observation-01', `  annotations: {private: ${material}}\n  name: observation-01`);
    const form = props(source);
    render(<EventInspector {...form} />);
    fireEvent.click(screen.getByLabelText('Help: Diagnostic note privacy'));
    expect(document.body.innerHTML).not.toContain(material);
    expect(screen.getByText('Diagnostic note hidden')).toBeInTheDocument();
    expect(form.patch).not.toHaveBeenCalled();
  });

  it('retains future Event types rather than claiming Normal or health', () => {
    render(<EventInspector {...props(recurringEventSource.replace('type: Warning', 'type: FutureDiagnostic'))} />);
    expect(screen.getByText('FutureDiagnostic')).toBeInTheDocument();
    expect(screen.queryByText('Normal')).not.toBeInTheDocument();
  });

  it('keeps singleton omission distinct from zero occurrences and absent compatibility fields', () => {
    render(<EventInspector {...props(singletonEventSource, 'series')} />);
    expect(screen.getByText('No series reported; no count inferred.')).toBeInTheDocument();
    expect(screen.queryByText('Occurrences at heartbeat')).not.toBeInTheDocument();
    expect(screen.getAllByText('Not reported')).toHaveLength(5);
  });

  it('matches core aliases only by UID and namespace, never by similar names', () => {
    const draft = props().draft;
    expect(coreEventAlias(draft, 'diagnostics-fixture', [{ name: 'observation-01', namespace: 'diagnostics-fixture', uid: 'replacement' }])).toBeUndefined();
    expect(coreEventAlias(draft, 'diagnostics-fixture', [{ name: 'observation-01', namespace: 'different', uid: 'fixture-event-uid' }])).toBeUndefined();
    expect(coreEventAlias(draft, 'diagnostics-fixture', [{ name: 'legacy-alias', namespace: 'diagnostics-fixture', uid: 'fixture-event-uid' }])?.name).toBe('legacy-alias');
    const noUID = props(recurringEventSource.replace('  uid: fixture-event-uid\n', '')).draft;
    expect(coreEventAlias(noUID, 'diagnostics-fixture', [{ name: 'observation-01', namespace: 'diagnostics-fixture' }])).toBeUndefined();
  });

  it('shows core alias provenance without adding heartbeat and compatibility counts', async () => {
    render(<EventInspector {...props(`${recurringEventSource}deprecatedCount: 5\n`, 'series')} />);
    expect(await screen.findByText('core/v1 alias: legacy-observation-01. One Event; counts are not added.')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.queryByText('22')).not.toBeInTheDocument();
  });

  it.each(['denied', 'absent', 'unavailable'] as const)('retains distinct core alias %s boundary', async status => {
    render(<EventInspector {...props(recurringEventSource, 'series')} references={fixtureEventReferences(status)} />);
    const expected = { denied: 'lookup denied', absent: 'not served', unavailable: 'lookup unavailable' }[status];
    expect(await screen.findByText(new RegExp(expected))).toBeInTheDocument();
  });

  it('cancels pending alias reads when inspector closes', () => {
    let signal: AbortSignal | undefined;
    const references: ResourceEditorReferenceService = { list: vi.fn((request: ResourceEditorReferenceRequest) => { signal = request.signal; return new Promise<ResourceEditorReferenceResult>(() => {}); }) };
    const view = render(<EventInspector {...props(recurringEventSource, 'series')} references={references} />);
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('does not inherit Event namespace for cluster-scoped references or open incomplete identities', () => {
    expect(eventReference(props().draft, 'related')?.namespace).toBeUndefined();
    const source = recurringEventSource.replace('  uid: fixture-pod-uid\n', '').replace('  uid: fixture-node-uid\n', '');
    render(<EventInspector {...props(source, 'objects')} />);
    expect(screen.queryByRole('button', { name: 'Inspect referenced object' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Incomplete reference — safe object handoff unavailable.')).toHaveLength(2);
  });

  it.each(['denied', 'absent', 'unavailable', 'unknown'] as const)('hides retained diagnostic when read authorization is %s', status => {
    render(<EventInspector {...props()} context={{ ...eventContext, capabilities: { ...eventContext.capabilities, get: status } }} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('FailedScheduling')).not.toBeInTheDocument();
  });

  it('blocks host patches even with update permission and preserves exact original source', () => {
    const controller = new ResourceEditorController(recurringEventSource, 'event-readonly');
    const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['reason'], value: 'Changed' }] }, resourceEditors[0], { ...eventContext, intent: 'edit' });
    expect(result.status).toBe('forbidden');
    expect(controller.getSource()).toBe(recurringEventSource);
    expect(controller.draft().get(['x-future', 'exact'])).toBe(900719925474099312345n);
  });

  it('does not coerce opaque markers or unsafe numeric values to display text', () => {
    expect(eventText(Object.create(null))).toBe('Unsupported representation');
    expect(eventText(9007199254740992)).toBe('Unsupported representation');
    expect(eventText('900719925474099312345')).toBe('900719925474099312345');
  });
});
