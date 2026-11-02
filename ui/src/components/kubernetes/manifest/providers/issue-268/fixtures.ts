import type { ResourceEditorContext } from '@omniviewdev/runtime';

export const hpaFixtureContext: ResourceEditorContext = {
  group: 'autoscaling', version: 'v2', kind: 'HorizontalPodAutoscaler', resource: 'horizontalpodautoscalers', scope: 'Namespaced',
  connectionID: 'fixture-only', namespace: 'sandbox', name: 'worker-scaling', intent: 'edit', ownership: { status: 'application' },
  capabilities: { create: 'available', update: 'available', delete: 'unknown', list: 'available', get: 'available', actions: {} },
  discovery: { status: 'available', features: { HPAScaleToZero: 'unknown', HPAConfigurableTolerance: 'unknown' } },
  schema: { status: 'available', identity: 'kubernetes-v1.35.0-autoscaling-v2-fixture' },
};
export const hpaFixture = `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: worker-scaling
  namespace: sandbox
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: worker
  minReplicas: 2
  maxReplicas: 12 # capacity ceiling
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: External
      external:
        metric:
          name: queue_depth
          selector:
            matchLabels:
              queue: jobs
            matchExpressions:
              - key: region
                operator: In
                values: [east, west]
        target:
          type: AverageValue
          averageValue: '9007199254740993m'
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60
  vendor:
    exact: 9007199254740993 # retain exact vendor data
status:
  observedGeneration: 3
  currentReplicas: 4
  desiredReplicas: 4
  conditions:
    - type: AbleToScale
      status: 'True'
      reason: ReadyForNewScale
  currentMetrics:
    - type: Resource
      resource:
        name: cpu
        current:
          averageUtilization: 54
`;
export const hpaCreateFixture = `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ''
  namespace: sandbox
spec: {}
`;
export const hpaV1Fixture = `apiVersion: autoscaling/v1
kind: HorizontalPodAutoscaler
metadata:
  name: legacy-cpu
  namespace: sandbox
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: worker
  minReplicas: 1
  maxReplicas: 8
  targetCPUUtilizationPercentage: 75
status:
  currentReplicas: 3
  desiredReplicas: 3
  currentCPUUtilizationPercentage: 63
`;
export const hpaFixtureCases = [
  'create-empty', 'create-populated', 'edit', 'partial-invalid', 'review-local', 'metrics-resource', 'metrics-container-resource',
  'metrics-pods', 'metrics-object', 'metrics-external', 'selectors-labels-expressions', 'behavior-policies', 'tolerance-verified',
  'tolerance-unknown', 'scale-zero-verified', 'scale-zero-unverified', 'controller-owned', 'denied-update', 'discovery-unavailable',
  'schema-unavailable', 'unknown-metric-source', 'lookup-loading', 'lookup-empty', 'lookup-denied', 'lookup-unavailable',
  'v1-cpu', 'status-snapshot', 'source-roundtrip', 'narrow-fit',
] as const;
