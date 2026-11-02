import type { ResourceEditorContext, ResourceEditorReferenceService, ResourceEditorActionService } from '@omniviewdev/runtime';

export const eventContext: ResourceEditorContext = {
  group: 'events.k8s.io', version: 'v1', kind: 'Event', resource: 'events', scope: 'Namespaced',
  connectionID: 'fixture-only-cluster', namespace: 'diagnostics-fixture', name: 'observation-01', uid: 'fixture-event-uid', intent: 'inspect',
  capabilities: { create: 'available', update: 'available', delete: 'available', get: 'available', list: 'available', actions: {} },
  discovery: { status: 'available', features: {} }, schema: { status: 'available' }, ownership: { status: 'system' },
};

export const recurringEventSource = `apiVersion: events.k8s.io/v1
kind: Event
metadata:
  name: observation-01
  namespace: diagnostics-fixture
  uid: fixture-event-uid
  resourceVersion: "900719925474099312345"
eventTime: "2026-10-31T09:12:01.123456Z"
type: Warning
reason: FailedScheduling
action: Scheduling
reportingController: default-scheduler
reportingInstance: scheduler-fixture
note: Fixture diagnostic text is intentionally withheld.
regarding:
  apiVersion: v1
  kind: Pod
  namespace: diagnostics-fixture
  name: pending-workload
  uid: fixture-pod-uid
  fieldPath: spec.containers{worker}
related:
  apiVersion: v1
  kind: Node
  name: fixture-node
  uid: fixture-node-uid
series:
  count: 17
  lastObservedTime: "2026-10-31T09:15:01.123456Z"
x-future:
  exact: 900719925474099312345 # never rewritten by inspector
`;

export const singletonEventSource = `apiVersion: events.k8s.io/v1
kind: Event
metadata:
  name: singleton-01
  namespace: diagnostics-fixture
  uid: fixture-singleton-uid
  resourceVersion: "900719925474099312346"
eventTime: "2026-10-31T10:00:00.000001Z"
type: Normal
reason: Scheduled
action: Binding
reportingController: default-scheduler
reportingInstance: scheduler-fixture
`;

/** Isolated fixture transport. No cluster request or mutation occurs. */
export function fixtureEventReferences(state: 'alias' | 'empty' | 'denied' | 'absent' | 'unavailable' = 'alias'): ResourceEditorReferenceService {
  return { list: request => {
    if (request.signal.aborted) return Promise.resolve({ status: 'unavailable', message: 'Fixture read cancelled.' });
    if (state !== 'alias' && state !== 'empty') return Promise.resolve({ status: state, message: 'Fixture-only reference boundary.' });
    return Promise.resolve({ status: 'ready', items: state === 'empty' ? [] : [{ name: 'legacy-observation-01', namespace: 'diagnostics-fixture', uid: 'fixture-event-uid' }] });
  } };
}

export const fixtureEventActions: ResourceEditorActionService = {
  execute: () => Promise.resolve({ status: 'unavailable', message: 'Events expose no mutation protocol. Fixture only.' }),
};
