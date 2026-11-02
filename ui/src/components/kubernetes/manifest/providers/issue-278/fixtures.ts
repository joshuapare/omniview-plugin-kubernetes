import type { ResourceEditorContext, ResourceEditorTarget } from '@omniviewdev/runtime';
import { group, resources } from './model';

export function fixtureContext(target: ResourceEditorTarget, intent: ResourceEditorContext['intent'] = 'create'): ResourceEditorContext {
  return { ...target, connectionID: 'fixture-only-no-cluster', intent, ownership: { status: 'application' }, capabilities: { create: 'available', update: 'available', delete: 'denied', list: 'available', get: 'available', actions: {} }, discovery: { status: 'available', features: { MutatingAdmissionPolicy: 'available' } }, schema: { status: 'available', identity: 'fixture-kubernetes-v1.35.0' } };
}
const rule = `      - operations: [CREATE, UPDATE]
        apiGroups: [""]
        apiVersions: [v1]
        resources: [pods]
`;
const matching = `  matchConstraints:
    resourceRules:
${rule.trimEnd()}
`;
const policy = `spec:
  # Keep this comment and exact integer through unrelated edits.
  preservedExact: 9007199254740993
  failurePolicy: Fail
${matching}`;
const webhook = `webhooks:
  - name: review.fixture.example.test
    clientConfig:
      service:
        namespace: admission-fixture
        name: admission-fixture
        port: 443
        path: /review
    sideEffects: None
    admissionReviewVersions: [v1]
    timeoutSeconds: 10
    rules:
${rule.trimEnd()}
`;
export const admissionFixtures = resources.map(([kind, resource, version]) => {
  const target: ResourceEditorTarget = { group, version, kind, resource, scope: 'Cluster' };
  const header = `apiVersion: ${group}/${version}\nkind: ${kind}\nmetadata:\n  name: admission-fixture\n`;
  let body: string;
  if (kind.endsWith('WebhookConfiguration')) body = webhook + (kind.startsWith('Mutating') ? '    reinvocationPolicy: Never\n' : '');
  else if (kind.endsWith('Binding')) body = `spec:\n  policyName: admission-fixture\n` + (kind.startsWith('Validating') ? '  validationActions: [Deny, Audit]\n' : '');
  else if (kind.startsWith('Mutating')) body = policy + `  reinvocationPolicy: Never\n  mutations:\n    - patchType: ApplyConfiguration\n      applyConfiguration:\n        expression: 'Object{spec: Object.spec{}}'\n`;
  else body = policy + `  validations:\n    - expression: 'object.metadata.name != ""'\n      message: A name is required\n  auditAnnotations:\n    - key: validation\n      valueExpression: '"checked"'\nstatus:\n  observedGeneration: 1\n  conditions:\n    - type: Accepted\n      status: Unknown\n`;
  return { target, source: header + body, context: fixtureContext(target) };
});
export type AdmissionFixtureScenario = 'create' | 'edit' | 'managed' | 'denied' | 'discovery-unknown' | 'gate-off' | 'unsupported' | 'invalid-actions' | 'lookup-denied';
export function admissionScenario(index: number, scenario: AdmissionFixtureScenario) {
  const fixture = admissionFixtures[index];
  const context = { ...fixture.context, capabilities: { ...fixture.context.capabilities }, discovery: { ...fixture.context.discovery, features: { ...fixture.context.discovery.features } } };
  let source = fixture.source;
  if (scenario === 'edit' || scenario === 'managed') context.intent = 'edit';
  if (scenario === 'managed') context.ownership = { status: 'controller' };
  if (scenario === 'denied') { context.capabilities.create = 'denied'; context.capabilities.update = 'denied'; }
  if (scenario === 'discovery-unknown') context.discovery.status = 'unknown';
  if (scenario === 'gate-off') context.discovery.features.MutatingAdmissionPolicy = 'absent';
  if (scenario === 'unsupported') source = source.replace(fixture.target.kind.endsWith('WebhookConfiguration') ? /webhooks:\n[\s\S]*$/ : /spec:\n[\s\S]*$/, fixture.target.kind.endsWith('WebhookConfiguration') ? 'webhooks: unsupported-scalar\n' : 'spec: unsupported-scalar\n');
  if (scenario === 'invalid-actions' && fixture.target.kind === 'ValidatingAdmissionPolicyBinding') source = source.replace('[Deny, Audit]', '[Deny, Warn]');
  return { ...fixture, source, context, baseline: context.intent === 'edit' ? fixture.source : undefined };
}
