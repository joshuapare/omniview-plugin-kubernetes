import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export const group = 'gateway.networking.x-k8s.io';
export const targets = [
  { group, version: 'v1alpha1', kind: 'XListenerSet', resource: 'xlistenersets', scope: 'Namespaced' },
  { group, version: 'v1alpha1', kind: 'XBackendTrafficPolicy', resource: 'xbackendtrafficpolicies', scope: 'Namespaced' },
  { group, version: 'v1alpha1', kind: 'XMesh', resource: 'xmeshes', scope: 'Cluster' },
] as const;
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const error = (path: (string | number)[], message: string) => issues.push({ path, message });
  if (context.kind === 'XMesh') {
    const controller = draft.get(['spec', 'controllerName']);
    if (typeof controller !== 'string' || !/^[a-z0-9.-]+\/.+$/.test(controller)) error(['spec', 'controllerName'], 'Enter a domain-prefixed controller path.');
    const description = draft.get(['spec', 'description']);
    if (typeof description === 'string' && description.length > 64) error(['spec', 'description'], 'Use at most 64 characters.');
  }
  if (context.kind === 'XListenerSet') {
    if (!draft.get(['spec', 'parentRef', 'name'])) error(['spec', 'parentRef', 'name'], 'Choose a parent Gateway.');
    const listeners = draft.get(['spec', 'listeners']);
    if (!Array.isArray(listeners) || listeners.length < 1 || listeners.length > 64) error(['spec', 'listeners'], 'Add between 1 and 64 listeners.');
    const names = new Set<string>();
    if (Array.isArray(listeners)) listeners.forEach((_, i) => {
      const p = ['spec', 'listeners', i];
      const name = draft.get([...p, 'name']);
      if (typeof name !== 'string' || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name) || names.has(name)) error([...p, 'name'], 'Use a unique DNS label.');
      if (typeof name === 'string') names.add(name);
      const protocol = draft.get([...p, 'protocol']);
      if (!protocol) error([...p, 'protocol'], 'Choose a protocol.');
      if (['TCP', 'UDP'].includes(String(protocol)) && draft.has([...p, 'hostname'])) error([...p, 'hostname'], 'TCP and UDP cannot specify a hostname.');
      if (['HTTP', 'TCP', 'UDP'].includes(String(protocol)) && draft.has([...p, 'tls'])) error([...p, 'tls'], 'This protocol cannot specify TLS.');
      if (['HTTPS', 'TLS'].includes(String(protocol)) && !draft.has([...p, 'tls'])) error([...p, 'tls'], 'Configure TLS for this protocol.');
    });
  }
  if (context.kind === 'XBackendTrafficPolicy') {
    const refs = draft.get(['spec', 'targetRefs']);
    if (!Array.isArray(refs) || refs.length < 1 || refs.length > 16) error(['spec', 'targetRefs'], 'Add between 1 and 16 local backend targets.');
    if (Array.isArray(refs)) refs.forEach((_, i) => { if (!draft.get(['spec', 'targetRefs', i, 'name'])) error(['spec', 'targetRefs', i, 'name'], 'Enter a backend name.'); });
    if (draft.get(['spec', 'sessionPersistence', 'cookieConfig', 'lifetimeType']) === 'Permanent' && !draft.get(['spec', 'sessionPersistence', 'absoluteTimeout'])) error(['spec', 'sessionPersistence', 'absoluteTimeout'], 'Permanent cookies require an absolute timeout.');
  }
  return issues;
}
