import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

import type { DiscoveryEndpoint, DiscoveryVersion } from './discovery';

/** Client-only canonical query fields; these are never sent as Kubernetes object fields. */
export function discoveryQuery(draft: ResourceEditorDraft, context: ResourceEditorContext): { endpoint: DiscoveryEndpoint; version: DiscoveryVersion } {
  const endpoint = draft.get(['query', 'endpoint']);
  const version = draft.get(['query', 'version']);
  const group = draft.get(['metadata', 'name']);
  return {
    endpoint: endpoint === '/api' || endpoint === '/apis' ? endpoint : draft.get(['kind']) === 'APIGroupDiscovery' && (group === '' || group === undefined) ? '/api' : '/apis',
    version: version === 'v2' || version === 'v2beta1' ? version : context.version === 'v2beta1' ? 'v2beta1' : 'v2',
  };
}
export function validateDiscoveryQuery(draft: ResourceEditorDraft): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const endpoint = draft.get(['query', 'endpoint']);
  const version = draft.get(['query', 'version']);
  if (draft.has(['query', 'endpoint']) && endpoint !== '/api' && endpoint !== '/apis') {
    issues.push({ path: ['query', 'endpoint'], message: 'Choose /api or /apis.' });
  }
  if (draft.has(['query', 'version']) && version !== 'v2' && version !== 'v2beta1') {
    issues.push({ path: ['query', 'version'], message: 'Choose v2 or v2beta1.' });
  }
  return issues;
}
