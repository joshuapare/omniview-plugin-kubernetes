import type { ResourceEditorContext } from '@omniviewdev/runtime';

export const jobFixture = `apiVersion: batch/v1
kind: Job
metadata:
  name: report-once
  namespace: operations
spec:
  parallelism: 2
  completions: 4
  backoffLimit: 3
  template:
    metadata:
      labels: {app: report}
    spec:
      restartPolicy: Never
      containers:
        - name: report
          image: registry.example.invalid/report:v2
          args: [--format, json]
          imagePullPolicy: IfNotPresent # preserve sibling comment
          env:
            - name: REPORT_CONFIG
              valueFrom:
                secretKeyRef: {name: report-config, key: config}
`;
export const cronJobFixture = `apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-report
  namespace: operations
  resourceVersion: "42"
spec:
  schedule: "0 2 * * *"
  timeZone: Etc/UTC
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  suspend: false
  jobTemplate:
    metadata:
      labels: {team: reporting}
    spec:
      backoffLimit: 3
      activeDeadlineSeconds: 600
      template:
        metadata:
          labels: {app: report}
        spec:
          restartPolicy: Never
          containers:
            - name: report
              image: registry.example.invalid/report:v2
              args: [--format, json]
`;

export function batchFixtureContext(kind: 'Job' | 'CronJob', intent: ResourceEditorContext['intent'] = 'create'): ResourceEditorContext {
  return {
    group: 'batch', version: 'v1', kind, resource: kind === 'Job' ? 'jobs' : 'cronjobs', scope: 'Namespaced',
    connectionID: 'fixture-no-live-connection', namespace: 'operations', intent,
    name: intent === 'create' ? undefined : kind === 'Job' ? 'report-once' : 'nightly-report',
    resourceVersion: intent === 'create' ? undefined : '42',
    capabilities: { create: 'available', update: 'available', delete: 'denied', list: 'unavailable', get: 'available', actions: {} },
    discovery: { status: 'available', features: {} }, schema: { status: 'available' }, ownership: { status: 'application' },
  };
}

export const batchFixtureCases = [
  { id: 'job-empty', kind: 'Job', intent: 'create', source: 'apiVersion: batch/v1\nkind: Job\nmetadata: {namespace: operations}\nspec: {}\n' },
  { id: 'cronjob-empty', kind: 'CronJob', intent: 'create', source: 'apiVersion: batch/v1\nkind: CronJob\nmetadata: {namespace: operations}\nspec: {jobTemplate: {spec: {}}}\n' },
  { id: 'job-create', kind: 'Job', intent: 'create', source: jobFixture },
  { id: 'job-edit', kind: 'Job', intent: 'edit', source: jobFixture },
  { id: 'job-owned', kind: 'Job', intent: 'edit', source: jobFixture.replace('  namespace: operations', '  namespace: operations\n  ownerReferences:\n    - apiVersion: batch/v1\n      kind: CronJob\n      name: nightly-report\n      uid: fixture-owner\n      controller: true') },
  { id: 'job-indexed', kind: 'Job', intent: 'edit', source: jobFixture.replace('  parallelism: 2', '  completionMode: Indexed\n  parallelism: 2') },
  { id: 'job-external', kind: 'Job', intent: 'edit', source: jobFixture.replace('  parallelism: 2', '  managedBy: batch.example.invalid/controller\n  parallelism: 2') },
  { id: 'cronjob-create', kind: 'CronJob', intent: 'create', source: cronJobFixture },
  { id: 'cronjob-edit', kind: 'CronJob', intent: 'edit', source: cronJobFixture },
  { id: 'cronjob-replace-suspended', kind: 'CronJob', intent: 'edit', source: cronJobFixture.replace('concurrencyPolicy: Forbid', 'concurrencyPolicy: Replace').replace('suspend: false', 'suspend: true') },
  { id: 'job-status', kind: 'Job', intent: 'inspect', source: `${jobFixture}status:\n  active: 1\n  succeeded: 2\n  conditions: [{type: Suspended, status: "False"}]\n` },
  { id: 'cronjob-status', kind: 'CronJob', intent: 'inspect', source: `${cronJobFixture}status:\n  lastScheduleTime: "2026-11-01T02:00:00Z"\n  active: []\n` },
  { id: 'job-unsupported', kind: 'Job', intent: 'edit', source: jobFixture.replace('  parallelism: 2', '  completionMode: FutureMode\n  parallelism: 2') },
  { id: 'cronjob-denied', kind: 'CronJob', intent: 'edit', source: cronJobFixture },
  { id: 'cronjob-unavailable', kind: 'CronJob', intent: 'edit', source: cronJobFixture },
] as const;
