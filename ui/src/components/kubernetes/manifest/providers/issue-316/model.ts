import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export const eventTypes = [
  ...['scaledobject', 'scaledjob'].flatMap(kind => ['ready', 'failed', 'removed'].map(event => `keda.${kind}.${event}.v1`)),
  ...['triggerauthentication', 'clustertriggerauthentication'].flatMap(kind => ['created', 'updated', 'removed'].map(event => `keda.authentication.${kind}.${event}.v1`)),
] as const;
export const ownedPaths = [
  ['spec', 'destination', 'http', 'uri'], ['spec', 'destination', 'azureEventGridTopic', 'endpoint'],
  ['spec', 'authenticationRef', 'name'], ['spec', 'authenticationRef', 'kind'],
  ['spec', 'eventSubscription', 'includedEventTypes'], ['spec', 'eventSubscription', 'excludedEventTypes'], ['spec', 'clusterName'],
  ['spec', 'destination', 'http'], ['spec', 'destination', 'azureEventGridTopic'], ['spec', 'authenticationRef'],
] as const;
export function endpointError(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) return 'Use an HTTP(S) endpoint without credentials, query or fragment.';
    return null;
  } catch { return 'Enter a complete HTTP(S) endpoint.'; }
}
/**
 * Public endpoint projection only; never stringify opaque canonical values.
 * Encoded or ambiguous references stay hidden, without changing admission rules.
 */
export function publicEndpointReference(value: unknown): string {
  if (typeof value !== 'string' || /[\s\\%?#@]/.test(value) || !/^[A-Za-z0-9._~:/+[\]-]+$/.test(value)) return '';
  return endpointError(value) ? '' : value;
}
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  for (const path of ownedPaths.slice(0, 2)) {
    const value = draft.get(path);
    if (value !== undefined && (typeof value !== 'string' || !value || endpointError(value))) issues.push({ path, message: 'Enter a complete HTTP(S) endpoint without embedded credentials.' });
    if (draft.has(path.slice(0, -1)) && value === undefined) issues.push({ path, message: 'Enter an endpoint for this destination branch.' });
  }
  if (!draft.has(['spec', 'destination'])) issues.push({ path: ['spec', 'destination'], message: 'Choose an event destination.' });
  const auth = draft.get(['spec', 'authenticationRef', 'name']);
  if (draft.has(['spec', 'authenticationRef']) && (typeof auth !== 'string' || !auth.trim())) issues.push({ path: ['spec', 'authenticationRef', 'name'], message: 'Enter an authentication reference name.' });
  if (context.scope === 'Cluster' && auth && draft.get(['spec', 'authenticationRef', 'kind']) !== 'ClusterTriggerAuthentication') issues.push({ path: ['spec', 'authenticationRef', 'kind'], message: 'Namespaced authentication requires operator namespace resolution. Use source or cluster authentication.' });
  return issues;
}
export function unavailable(draft: ResourceEditorDraft): string | null {
  for (const path of [['spec'], ['spec', 'destination'], ['spec', 'destination', 'http'], ['spec', 'destination', 'azureEventGridTopic'], ['spec', 'authenticationRef'], ['spec', 'eventSubscription']]) {
    const value = draft.get(path);
    if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) return 'Unsupported container shape. Source remains unchanged.';
  }
  const kind = draft.get(['spec', 'authenticationRef', 'kind']);
  if (kind !== undefined && (typeof kind !== 'string' || !['TriggerAuthentication', 'ClusterTriggerAuthentication'].includes(kind))) return 'Unsupported authentication kind. Source remains unchanged.';
  for (const path of ownedPaths.filter(path => path.length > 3 || path[1] === 'clusterName' || path[1] === 'eventSubscription' || (path[1] === 'authenticationRef' && path.length === 3))) {
    const value = draft.get(path);
    if (value === undefined) continue;
    if (path[1] === 'destination' && typeof value === 'string' && endpointError(value)) return 'Unsupported endpoint. Source remains unchanged.';
    if (path[1] === 'eventSubscription') {
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !eventTypes.includes(item))) return 'Unsupported event filters. Source remains unchanged.';
    } else if (typeof value !== 'string') return 'Unsupported field shape. Source remains unchanged.';
  }
  return null;
}
export function readOnly(_draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  return context.intent === 'inspect' || (context.intent !== 'create' && context.ownership?.status !== 'application');
}
