import type { ResourceEditorContext, ResourceEditorTarget, ResourceEditorAvailability } from '@omniviewdev/runtime';
import { inspectManifest, readManifestValue, supportedManifestKind } from './manifestDraft';
import type { ResourceType } from '@omniviewdev/runtime';
import { validateImmutableEditorFields } from './resourceEditorPolicy';

export function createEditorContext(source: string, resourceKey: string, connectionID: string, intent: ResourceEditorContext['intent'], admitted?: Partial<ResourceEditorContext>): ResourceEditorContext {
  const parsed = inspectManifest(source, resourceKey);
  const kind = readManifestValue(parsed, ['kind']);
  const apiVersion = readManifestValue(parsed, ['apiVersion']);
  const builtIn = supportedManifestKind(resourceKey) === kind && kind !== null && kind !== undefined;
  const slash = typeof apiVersion === 'string' ? apiVersion.indexOf('/') : -1;
  const sourceTarget: ResourceEditorTarget = {
    group: typeof apiVersion === 'string' && slash >= 0 ? apiVersion.slice(0, slash) : '',
    version: typeof apiVersion === 'string' ? apiVersion.slice(slash + 1) : '',
    kind: typeof kind === 'string' ? kind : '', resource: resourceKey.startsWith('k8s:') ? resourceKey.slice(resourceKey.indexOf('/') + 1) : '',
    scope: admitted?.scope ?? (builtIn ? 'Namespaced' : 'Cluster'),
  };
  const stringAt = (path: readonly string[]) => { const value = readManifestValue(parsed, path); return typeof value === 'string' ? value : undefined; };
  const unknown: ResourceEditorAvailability = 'unknown';
  return {
    ...sourceTarget, connectionID, intent,
    name: stringAt(['metadata', 'name']), namespace: stringAt(['metadata', 'namespace']), uid: stringAt(['metadata', 'uid']), resourceVersion: stringAt(['metadata', 'resourceVersion']),
    capabilities: { create: unknown, update: unknown, delete: unknown, get: unknown, list: unknown, actions: {} },
    discovery: { status: builtIn ? 'available' : unknown, features: {} }, schema: { status: unknown }, ownership: { status: 'unknown' },
    ...admitted,
  };
}

export function validateEditorIdentity(source: string, context: ResourceEditorContext, baseline?: string): string | null {
  const draft = inspectManifest(source);
  if (draft.error || !draft.document) return 'Enter a valid Kubernetes YAML object.';
  const get = (path: readonly string[]) => readManifestValue(draft, path);
  if (get(['apiVersion']) !== (context.group ? `${context.group}/${context.version}` : context.version) || get(['kind']) !== context.kind) return 'Manifest API version and kind must match the selected target.';
  if (context.scope === 'Cluster' && get(['metadata', 'namespace'])) return 'Cluster-scoped resources cannot have a namespace.';
  if (context.intent === 'edit' && baseline) {
    const original = inspectManifest(baseline);
    for (const path of [['apiVersion'], ['kind'], ['metadata', 'name'], ['metadata', 'namespace'], ['metadata', 'uid'], ['metadata', 'resourceVersion']]) {
      if (get(path) !== readManifestValue(original, path)) return 'Resource identity and revision cannot change during edit.';
    }
  }
  return baseline && context.intent === 'edit' ? validateImmutableEditorFields(source, baseline, context) : null;
}

/** Discovery is independent from authorization; advertised verbs remain advisory, never RBAC grants. */
export function catalogEditorContext(source: string, resourceKey: string, connectionID: string, intent: ResourceEditorContext['intent'], descriptor?: ResourceType): ResourceEditorContext {
  const context = createEditorContext(source, resourceKey, connectionID, intent);
  if (!descriptor) return { ...context, discovery: { status: 'unknown', features: {} } };
  const representation = descriptor.representations.find((entry) => entry.id === `kubernetes.object.v1/${context.group ? `${context.group}/` : ''}${context.version}`);
  const advertised = (operation: ResourceType['capabilities'][number]['operation']): ResourceEditorAvailability => descriptor.capabilities.some((entry) => entry.operation === operation && entry.scope.every((constraint) => constraint.match === 'any' || constraint.dimension === 'namespace' && !!context.namespace && constraint.values.includes(context.namespace))) ? 'available' : 'absent';
  return {
    ...context,
    scope: descriptor.identityDimensions.some((entry) => entry.name === 'namespace') ? 'Namespaced' : 'Cluster',
    discovery: { status: representation ? 'available' : 'unknown', features: {} },
    capabilities: { create: advertised('create'), update: advertised('mutationUpdate'), delete: advertised('delete'), list: advertised('enumerate'), get: advertised('get'), actions: {} },
    schema: { status: representation?.schema.state === 'available' ? 'available' : representation?.schema.state === 'absent' ? 'absent' : representation?.schema.state === 'unavailable' ? 'unavailable' : 'unknown', identity: representation?.schema.documentRef?.id },
  };
}
