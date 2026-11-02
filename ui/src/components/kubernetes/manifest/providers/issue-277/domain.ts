import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export const usages = ['signing', 'digital signature', 'content commitment', 'key encipherment', 'key agreement', 'data encipherment', 'cert sign', 'crl sign', 'encipher only', 'decipher only', 'any', 'server auth', 'client auth', 'code signing', 'email protection', 's/mime', 'ipsec end system', 'ipsec tunnel', 'ipsec user', 'timestamping', 'ocsp signing', 'microsoft sgc', 'netscape sgc'] as const;
const dns = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;
export function signerError(value: string, optional = false): string | null {
  if (!value && optional) return null;
  const parts = value.split('/');
  if (parts.length !== 2 || value.length > 571) return 'Enter a qualified signer: domain/path.';
  const [domain, path] = parts;
  if (domain.length > 253 || domain.split('.').length < 2 || domain.split('.').some(label => label.length > 63 || !dns.test(label)) || path.split('.').some(label => label.length > 253 || !dns.test(label))) return 'Use a DNS domain and lowercase DNS path.';
  return null;
}
export function lifetimeError(value: string): string | null {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return 'Enter whole seconds.';
  const n = BigInt(value);
  return n < 600n || n > 2147483647n ? 'Use 600–2147483647 seconds.' : null;
}
export function trustNameError(name: string, signer: string): string | null {
  const prefix = signer ? `${signer.replace('/', ':')}:` : '';
  if (signer && !name.startsWith(prefix)) return 'Name must start with the signer, replacing / with :, followed by :.';
  const suffix = name.slice(prefix.length);
  if (!suffix || suffix.length > 253 || suffix.split('.').some(label => !dns.test(label))) return 'Use a DNS subdomain name after the signer prefix.';
  return null;
}
export function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function conditionTypes(draft: ResourceEditorDraft): string[] {
  const list = draft.get(['status', 'conditions']);
  if (!Array.isArray(list)) return [];
  return list.flatMap((_, i) => {
    const type = draft.get(['status', 'conditions', i, 'type']);
    const status = draft.get(['status', 'conditions', i, 'status']);
    return typeof type === 'string' && ['Approved', 'Denied', 'Failed', 'Issued'].includes(type) && status === 'True' ? [type] : [];
  });
}
export function approvalBlocked(draft: ResourceEditorDraft): boolean {
  return conditionTypes(draft).some(type => ['Approved', 'Denied', 'Failed'].includes(type)) || draft.has(['status', 'certificate']);
}
export function validateCSR(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (context.intent !== 'create') return [];
  const errors: ResourceEditorFieldIssue[] = [];
  const signer = stringValue(draft.get(['spec', 'signerName']));
  const signerIssue = signerError(signer) || (signer === 'kubernetes.io/legacy-unknown' ? 'The legacy-unknown signer is not supported in v1.' : null);
  if (signerIssue) errors.push({ path: ['spec', 'signerName'], message: signerIssue });
  if (!draft.has(['spec', 'request']) || draft.get(['spec', 'request']) === '') errors.push({ path: ['spec', 'request'], message: 'Attach a PEM certificate signing request.' });
  const selected = draft.get(['spec', 'usages']);
  if (!Array.isArray(selected) || !selected.length || selected.some(value => typeof value !== 'string' || !usages.some(usage => usage === value)) || new Set(selected).size !== selected.length) errors.push({ path: ['spec', 'usages'], message: 'Choose at least one unique supported key usage.' });
  if (draft.has(['spec', 'expirationSeconds'])) {
    const raw = draft.get(['spec', 'expirationSeconds']);
    const message = typeof raw !== 'number' && typeof raw !== 'bigint' ? 'Lifetime must be an integer scalar.' : lifetimeError(String(raw));
    if (message) errors.push({ path: ['spec', 'expirationSeconds'], message });
  }
  return errors;
}
export function validateTrust(draft: ResourceEditorDraft): readonly ResourceEditorFieldIssue[] {
  const signer = stringValue(draft.get(['spec', 'signerName']));
  const name = stringValue(draft.get(['metadata', 'name']));
  const errors: ResourceEditorFieldIssue[] = [];
  const signerIssue = signerError(signer, true);
  if (signerIssue) errors.push({ path: ['spec', 'signerName'], message: signerIssue });
  const nameIssue = trustNameError(name, signer);
  if (nameIssue) errors.push({ path: ['metadata', 'name'], message: nameIssue });
  if (!draft.has(['spec', 'trustBundle']) || draft.get(['spec', 'trustBundle']) === '') errors.push({ path: ['spec', 'trustBundle'], message: 'Attach a PEM trust bundle.' });
  return errors;
}
export function availability(_draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') return `Certificate API discovery: ${context.discovery.status}. Source remains unchanged.`;
  if (context.schema.status !== 'available') return `Certificate schema: ${context.schema.status}. Source remains unchanged.`;
  return null;
}
export function unsupportedCSR(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  const unavailable = availability(draft, context);
  if (unavailable) return unavailable;
  const selected = draft.get(['spec', 'usages']);
  if (selected !== undefined && (!Array.isArray(selected) || selected.some(value => typeof value !== 'string' || !usages.some(usage => usage === value)) || new Set(selected).size !== selected.length)) return 'Unsupported or duplicate key usage shape. Source remains unchanged.';
  for (const key of ['signerName', 'expirationSeconds']) {
    const value = draft.get(['spec', key]);
    if (value !== undefined && (key === 'signerName' ? typeof value !== 'string' : typeof value !== 'number' && typeof value !== 'bigint')) return 'Unsupported certificate field type. Source remains unchanged.';
  }
  return null;
}
export function unsupportedTrust(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  const unavailable = availability(draft, context);
  if (unavailable) return unavailable;
  const signer = draft.get(['spec', 'signerName']);
  return signer !== undefined && typeof signer !== 'string' ? 'Unsupported signer shape. Source remains unchanged.' : null;
}
