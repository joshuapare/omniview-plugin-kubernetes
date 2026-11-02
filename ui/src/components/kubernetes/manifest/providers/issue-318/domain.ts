import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPath, ResourceEditorTarget } from '@omniviewdev/runtime';

export const targets: readonly ResourceEditorTarget[] = [
  { group: 'external-secrets.io', version: 'v1', kind: 'ExternalSecret', resource: 'externalsecrets', scope: 'Namespaced' },
  { group: 'external-secrets.io', version: 'v1', kind: 'SecretStore', resource: 'secretstores', scope: 'Namespaced' },
  { group: 'external-secrets.io', version: 'v1', kind: 'ClusterSecretStore', resource: 'clustersecretstores', scope: 'Cluster' },
  { group: 'external-secrets.io', version: 'v1', kind: 'ClusterExternalSecret', resource: 'clusterexternalsecrets', scope: 'Cluster' },
  { group: 'external-secrets.io', version: 'v1alpha1', kind: 'PushSecret', resource: 'pushsecrets', scope: 'Namespaced' },
  { group: 'external-secrets.io', version: 'v1alpha1', kind: 'ClusterPushSecret', resource: 'clusterpushsecrets', scope: 'Cluster' },
];
export const isPush = (kind: string) => kind.includes('PushSecret');
export const isStore = (kind: string) => kind.endsWith('SecretStore');
export const isFanout = (kind: string) => kind === 'ClusterExternalSecret' || kind === 'ClusterPushSecret';
export function specPath(kind: string): ResourceEditorPath {
  return isFanout(kind) ? ['spec', isPush(kind) ? 'pushSecretSpec' : 'externalSecretSpec'] : ['spec'];
}
export function generated(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  if (context.ownership?.status === 'controller' || context.ownership?.status === 'system') return true;
  const owners = draft.get(['metadata', 'ownerReferences']);
  if (!Array.isArray(owners)) return false;
  const references: readonly unknown[] = owners;
  return references.some(owner => owner !== null && typeof owner === 'object' && 'controller' in owner && owner.controller === true);
}
export function unavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (!isStore(context.kind)) return null;
  const provider = draft.get(['spec', 'provider']);
  if (provider && typeof provider === 'object' && Object.keys(provider).some(key => key !== 'aws')) return 'This provider requires its installed editor or YAML. Existing configuration is preserved.';
  return null;
}
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (generated(draft, context) || context.intent === 'inspect') return [];
  const base = specPath(context.kind);
  const issues: ResourceEditorFieldIssue[] = [];
  const required = (path: ResourceEditorPath, message: string) => { if (typeof draft.get(path) !== 'string' || !String(draft.get(path)).trim()) issues.push({ path, message }); };
  if (isStore(context.kind)) {
    required(['spec', 'provider', 'aws', 'service'], 'Choose an AWS service.');
    required(['spec', 'provider', 'aws', 'region'], 'Enter an AWS region.');
    const auth = ['spec', 'provider', 'aws', 'auth'];
    if (draft.has([...auth, 'jwt']) && draft.has([...auth, 'secretRef'])) issues.push({ path: auth, message: 'Choose one authentication method.' });
    if (draft.has([...auth, 'jwt'])) required([...auth, 'jwt', 'serviceAccountRef', 'name'], 'Choose a ServiceAccount.');
    if (draft.has([...auth, 'secretRef'])) for (const key of ['accessKeyIDSecretRef', 'secretAccessKeySecretRef', ...(draft.has([...auth, 'secretRef', 'sessionTokenSecretRef']) ? ['sessionTokenSecretRef'] : [])]) {
      required([...auth, 'secretRef', key, 'name'], 'Choose a credential Secret.');
      required([...auth, 'secretRef', key, 'key'], 'Enter a credential key name.');
      if (context.scope === 'Cluster') required([...auth, 'secretRef', key, 'namespace'], 'Enter the credential namespace.');
    }
    if (context.scope === 'Cluster' && draft.has([...auth, 'jwt'])) required([...auth, 'jwt', 'serviceAccountRef', 'namespace'], 'Enter the ServiceAccount namespace.');
  } else {
    if (isPush(context.kind)) {
      if (!draft.has([...base, 'selector', 'generatorRef']) && !draft.has([...base, 'selector', 'secret', 'selector'])) required([...base, 'selector', 'secret', 'name'], 'Choose a source Secret.');
      const refs = draft.get([...base, 'secretStoreRefs']);
      if (!Array.isArray(refs) || !refs.length) issues.push({ path: [...base, 'secretStoreRefs'], message: 'Add a destination store.' });
      if (Array.isArray(refs)) refs.forEach((_, index) => { if (!draft.has([...base, 'secretStoreRefs', index, 'labelSelector'])) required([...base, 'secretStoreRefs', index, 'name'], 'Choose a destination store.'); });
    } else required([...base, 'secretStoreRef', 'name'], 'Choose a source store.');
    const rows = draft.get([...base, 'data']);
    if (!isPush(context.kind) && (!Array.isArray(rows) || !rows.length) && !draft.has([...base, 'dataFrom'])) issues.push({ path: [...base, 'data'], message: 'Add a remote-key mapping or configure dataFrom in YAML.' });
    if (Array.isArray(rows)) rows.forEach((_, index) => {
      const row = [...base, 'data', index, ...(isPush(context.kind) ? ['match'] : [])];
      if (!isPush(context.kind)) required([...row, 'secretKey'], 'Enter a Kubernetes key.');
      required([...row, 'remoteRef', isPush(context.kind) ? 'remoteKey' : 'key'], 'Enter a remote key.');
    });
    if (!isPush(context.kind) && draft.get([...base, 'target', 'creationPolicy']) === 'Merge' && draft.get([...base, 'target', 'deletionPolicy']) === 'Delete') issues.push({ path: [...base, 'target', 'deletionPolicy'], message: 'Merge creation cannot delete the target Secret.' });
  }
  return issues;
}
