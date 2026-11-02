import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

const stringValue = (value: unknown): string => typeof value === 'string' ? value : '';

/** Only public reference syntax reaches the view; opaque values and credential-bearing URLs stay canonical and unreadable. */
export function publicModuleReference(value: unknown): string {
  if (typeof value !== 'string' || !value || /[\s\\%?#]/.test(value)) return '';
  const reference = value.replace(/@sha256:[a-f0-9]{64}$/, '');
  if (reference.includes('@') || !/^[A-Za-z0-9._~:/+-]+$/.test(reference)) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(reference) && !/^(oci|https?|file):\/\//.test(reference)) return '';
  return value;
}

export function moduleError(url: string, sha: string): string | null {
  if (!url.trim() || /\s/.test(url)) return 'Enter a module reference without whitespace.';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^(oci|https?|file):\/\//.test(url)) return 'Use OCI, HTTP(S), or a proxy-local file.';
  if (!publicModuleReference(url)) return 'Use a public module reference without embedded credentials, query parameters, or encoded characters.';
  if (sha && !/^[a-f0-9]{64}$/.test(sha)) return 'Enter a lowercase SHA-256 digest (64 characters).';
  const digest = url.match(/@sha256:([a-f0-9]{64})$/)?.[1];
  return digest && sha && digest !== sha ? 'Module digest and SHA-256 must match.' : null;
}
export function validate(draft: ResourceEditorDraft): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const error = moduleError(stringValue(draft.get(['spec', 'url'])), stringValue(draft.get(['spec', 'sha256'])));
  if (error) issues.push({ path: ['spec', 'url'], message: error });
  const refs = draft.get(['spec', 'targetRefs']);
  if (Array.isArray(refs) && refs.length > 16) issues.push({ path: ['spec', 'targetRefs'], message: 'Use at most 16 targets.' });
  if (draft.has(['spec', 'selector']) && draft.has(['spec', 'targetRefs'])) issues.push({ path: ['spec', 'selector'], message: 'Choose labels or resource targets, not both.' });
  if (Array.isArray(refs)) refs.forEach((_, i) => {
    const kind = draft.get(['spec', 'targetRefs', i, 'kind']);
    const group = draft.get(['spec', 'targetRefs', i, 'group']);
    const expected = kind === 'Service' ? ['', 'core'] : kind === 'ServiceEntry' ? ['networking.istio.io'] : ['gateway.networking.k8s.io'];
    if (typeof kind !== 'string' || !['Gateway', 'GatewayClass', 'Service', 'ServiceEntry'].includes(kind) || (group != null && typeof group !== 'string') || !expected.includes(stringValue(group)) || typeof draft.get(['spec', 'targetRefs', i, 'name']) !== 'string' || !draft.get(['spec', 'targetRefs', i, 'name'])) issues.push({ path: ['spec', 'targetRefs', i], message: 'Choose a supported target and enter its name.' });
  });
  const env = draft.get(['spec', 'vmConfig', 'env']);
  if (Array.isArray(env)) {
    const names = new Set<string>();
    env.forEach((_, i) => {
      const name = stringValue(draft.get(['spec', 'vmConfig', 'env', i, 'name']));
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.length > 256 || names.has(name)) issues.push({ path: ['spec', 'vmConfig', 'env', i, 'name'], message: 'Use a unique environment identifier, at most 256 characters.' });
      names.add(name);
    });
  }
  return issues;
}
export function unavailable(draft: ResourceEditorDraft, _context: ResourceEditorContext): string | null {
  for (const key of ['match', 'targetRefs']) {
    if (draft.has(['spec', key]) && !Array.isArray(draft.get(['spec', key]))) return 'Unsupported collection shape remains unchanged in source.';
  }
  const targets = draft.get(['spec', 'targetRefs']);
  if (Array.isArray(targets) && targets.some((_, i) => {
    const namespace = draft.get(['spec', 'targetRefs', i, 'namespace']);
    return typeof namespace === 'string' && namespace.length > 0;
  })) return 'Cross-namespace target references are unsupported; source remains unchanged.';
  if (draft.has(['spec', 'targetRef']) || draft.has(['spec', 'verificationKey'])) return 'Legacy attachment or unimplemented signature verification requires source editing.';
  const refs = draft.get(['spec', 'targetRefs']);
  if (Array.isArray(refs) && refs.some((_, i) => draft.get(['spec', 'targetRefs', i, 'kind']) === 'GatewayClass')) return 'GatewayClass attachment requires config-root verification outside this editor; use source.';
  return null;
}
