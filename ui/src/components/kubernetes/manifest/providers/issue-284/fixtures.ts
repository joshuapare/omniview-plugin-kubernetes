import type { ResourceEditorContext } from '@omniviewdev/runtime';

export const flowSource = `apiVersion: flowcontrol.apiserver.k8s.io/v1
kind: FlowSchema
metadata:
  name: tenant-routing
  annotations:
    policy-owner: platform # keep annotation
spec:
  matchingPrecedence: 500 # keep precedence
  priorityLevelConfiguration:
    name: tenant-capacity
  distinguisherMethod:
    type: ByNamespace
  rules:
    - subjects:
        - kind: Group
          group:
            name: engineering
      resourceRules:
        - verbs: [get, list]
          apiGroups: [""]
          resources: [pods, pods/log]
          namespaces: [team-a]
          clusterScope: false
    - subjects:
        - kind: ServiceAccount
          serviceAccount:
            namespace: team-a
            name: reader
      nonResourceRules:
        - verbs: [get]
          nonResourceURLs: [/healthz, /readyz/*]
  vendor:
    exact: 9007199254740993 # keep exact unknown
status:
  conditions:
    - type: Dangling
      status: "False"
      reason: Found
      message: Priority reference resolved in fixture snapshot
      lastTransitionTime: "2026-11-01T12:00:00Z"
`;
export const prioritySource = `apiVersion: flowcontrol.apiserver.k8s.io/v1
kind: PriorityLevelConfiguration
metadata:
  name: tenant-capacity
spec:
  type: Limited
  limited:
    nominalConcurrencyShares: 30 # keep shares
    lendablePercent: 0
    borrowingLimitPercent: 250
    limitResponse:
      type: Queue
      queuing:
        queues: 64
        handSize: 8
        queueLengthLimit: 50
    vendor:
      exact: 9007199254740993 # keep exact unknown
`;
export const exemptSource = `apiVersion: flowcontrol.apiserver.k8s.io/v1
kind: PriorityLevelConfiguration
metadata:
  name: exempt
spec:
  type: Exempt
  exempt:
    nominalConcurrencyShares: 0
    lendablePercent: 0
`;
export function fixtureContext(kind: 'FlowSchema' | 'PriorityLevelConfiguration', intent: ResourceEditorContext['intent'] = 'edit'): ResourceEditorContext {
  return {
    group: 'flowcontrol.apiserver.k8s.io', version: 'v1', kind,
    resource: kind === 'FlowSchema' ? 'flowschemas' : 'prioritylevelconfigurations', scope: 'Cluster',
    connectionID: 'fixture-only-no-live-connection', intent,
    ownership: { status: 'application' },
    capabilities: { create: 'available', update: 'available', delete: 'unknown', list: 'available', get: 'available', actions: {} },
    discovery: { status: 'available', features: {} }, schema: { status: 'available' },
  };
}
