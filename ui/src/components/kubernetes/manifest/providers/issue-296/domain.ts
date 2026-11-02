import type { ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export const backends = ['ca', 'acme', 'selfSigned', 'vault', 'venafi'] as const;
export function durationSeconds(text: string): number | null {
  if (!/^\+?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:ns|us|µs|μs|ms|s|m|h))+$/.test(text)) return null;
  const units: Record<string, number> = { ns: 1e-9, us: 1e-6, 'µs': 1e-6, 'μs': 1e-6, ms: 0.001, s: 1, m: 60, h: 3600 };
  let result = 0;
  for (const match of text.matchAll(/(\d+(?:\.\d*)?|\.\d+)(ns|us|µs|μs|ms|s|m|h)/g)) result += Number(match[1]) * units[match[2]];
  return Number.isFinite(result) ? result : null;
}
export function certificateIssues(draft: ResourceEditorDraft): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const get = (key: string) => draft.get(['spec', key]);
  const add = (key: string, message: string) => issues.push({ path: ['spec', key], message });
  for (const key of ['secretName']) if (!get(key)) add(key, 'Required.');
  if (!draft.get(['spec', 'issuerRef', 'name'])) add('issuerRef', 'Choose an issuer.');
  if (!['commonName', 'literalSubject', 'dnsNames', 'uris'].some(key => { const value = get(key); return Array.isArray(value) ? value.length > 0 : !!value; })) add('dnsNames', 'Add a DNS name, URI or subject.');
  if (get('literalSubject') && (get('commonName') || get('subject'))) add('literalSubject', 'Literal subject excludes common name and structured subject.');
  const duration = get('duration') === undefined ? 7776000 : durationSeconds(String(get('duration')));
  if (duration === null || duration < 3600) add('duration', 'Enter a Go duration of at least 1h.');
  if (get('renewBefore') !== undefined) {
    const renewal = durationSeconds(String(get('renewBefore')));
    if (renewal === null || renewal < 300 || (duration !== null && renewal >= duration)) add('renewBefore', 'Renewal must be at least 5m and shorter than duration.');
    if (get('renewBeforePercentage') !== undefined) add('renewBefore', 'Choose duration or percentage, not both.');
  }
  const percent = get('renewBeforePercentage');
  if (percent !== undefined && (!Number.isInteger(Number(percent)) || Number(percent) < 1 || Number(percent) > 99 || (duration !== null && duration * Number(percent) / 100 < 300))) add('renewBeforePercentage', 'Choose 1–99%; effective renewal must be at least 5m.');
  const algorithm = draft.get(['spec', 'privateKey', 'algorithm']);
  const size = draft.get(['spec', 'privateKey', 'size']);
  if (size !== undefined && ((algorithm === 'ECDSA' && ![256, 384, 521].includes(Number(size))) || ((!algorithm || algorithm === 'RSA') && ![2048, 4096, 8192].includes(Number(size))))) add('privateKey', 'Key size must match RSA or ECDSA algorithm.');
  if (typeof get('commonName') === 'string' && String(get('commonName')).length > 64) add('commonName', 'Common name must not exceed 64 characters.');
  for (const key of ['dnsNames', 'ipAddresses', 'uris', 'emailAddresses']) {
    const values = get(key);
    if (values !== undefined && (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim()))) add(key, 'Use nonempty text entries.');
  }
  return issues;
}
export function issuerIssues(draft: ResourceEditorDraft): ResourceEditorFieldIssue[] {
  const active = backends.filter(key => draft.has(['spec', key]));
  if (active.length !== 1) return [{ path: ['spec'], message: 'Choose exactly one issuer backend.' }];
  const required: Record<string, string[]> = { ca: ['secretName'], acme: ['server', 'privateKeySecretRef.name'], selfSigned: [], vault: ['server', 'path'], venafi: ['zone'] };
  const backend = active[0];
  const issues = required[backend].filter(key => !draft.get(['spec', backend, ...key.split('.')])).map(key => ({ path: ['spec', backend, ...key.split('.')], message: 'Required.' }));
  if (backend === 'vault') {
    const auth = ['tokenSecretRef', 'appRole', 'kubernetes', 'clientCertificate'].filter(key => draft.has(['spec', 'vault', 'auth', key]));
    if (auth.length !== 1) issues.push({ path: ['spec', 'vault', 'auth'], message: 'Choose one Vault authentication branch.' });
    const authFields: Record<string, string[]> = {
      tokenSecretRef: ['name', 'key'], appRole: ['path', 'roleId', 'secretRef.name', 'secretRef.key'],
      kubernetes: ['role'], clientCertificate: [],
    };
    for (const branch of auth) for (const field of authFields[branch]) if (!draft.get(['spec', 'vault', 'auth', branch, ...field.split('.')])) issues.push({ path: ['spec', 'vault', 'auth', branch, ...field.split('.')], message: 'Required.' });
    if (auth.includes('kubernetes') && !draft.get(['spec', 'vault', 'auth', 'kubernetes', 'serviceAccountRef', 'name']) && !draft.get(['spec', 'vault', 'auth', 'kubernetes', 'secretRef', 'name'])) issues.push({ path: ['spec', 'vault', 'auth', 'kubernetes'], message: 'Provide a service account or token Secret reference.' });
    if (auth.includes('clientCertificate')) for (const key of ['clientCertSecretRef', 'clientKeySecretRef']) for (const leaf of ['name', 'key']) if (!draft.get(['spec', 'vault', key, leaf])) issues.push({ path: ['spec', 'vault', key, leaf], message: 'Required for certificate authentication.' });
  }
  if (backend === 'venafi') {
    const platforms = ['tpp', 'cloud'].filter(key => draft.has(['spec', 'venafi', key]));
    if (platforms.length !== 1) issues.push({ path: ['spec', 'venafi'], message: 'Choose one Venafi platform.' });
    for (const platform of platforms) for (const field of platform === 'tpp' ? ['url', 'credentialsRef.name'] : ['apiTokenSecretRef.name', 'apiTokenSecretRef.key']) if (!draft.get(['spec', 'venafi', platform, ...field.split('.')])) issues.push({ path: ['spec', 'venafi', platform, ...field.split('.')], message: 'Required.' });
  }
  return issues;
}
