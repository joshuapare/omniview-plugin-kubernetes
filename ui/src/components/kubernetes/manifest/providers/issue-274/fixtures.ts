import type { ResourceEditorContext } from '@omniviewdev/runtime';

export const prioritySource = `apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: batch-priority
value: 100 # keep priority comment
preemptionPolicy: Never
globalDefault: false
description: Batch scheduling
futureSchedulingField: 9007199254740993123 # preserve exact unknown integer
`;
export const workloadSource = `apiVersion: scheduling.k8s.io/v1alpha1
kind: Workload
metadata:
  name: batch-workload
  namespace: staging
spec:
  controllerRef:
    apiGroup: batch
    kind: Job
    name: batch-job
  podGroups:
    - name: workers # keep group comment
      policy:
        gang:
          minCount: 3
    - name: metrics
      policy:
        basic: {}
  futureSchedulingField: 9007199254740993123
`;
export function fixtureContext(kind: 'PriorityClass' | 'Workload', intent: ResourceEditorContext['intent'] = 'create'): ResourceEditorContext {
  return {
    connectionID: 'fixture-only-no-cluster',
    group: 'scheduling.k8s.io',
    version: kind === 'PriorityClass' ? 'v1' : 'v1alpha1',
    kind,
    resource: kind === 'PriorityClass' ? 'priorityclasses' : 'workloads',
    scope: kind === 'PriorityClass' ? 'Cluster' : 'Namespaced',
    ...(kind === 'Workload' ? { namespace: 'staging' } : {}),
    intent,
    ownership: { status: 'application' },
    capabilities: { create: 'available', update: 'available', delete: 'available', list: 'available', get: 'available', actions: {} },
    discovery: { status: 'available', features: { GenericWorkload: 'available', GangScheduling: 'available' } },
    schema: { status: 'available' },
  };
}
