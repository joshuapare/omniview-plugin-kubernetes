import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch } from '@omniviewdev/runtime';

export const target = { group: 'apiregistration.k8s.io', version: 'v1', kind: 'APIService', resource: 'apiservices', scope: 'Cluster' } as const;
export const automanagedLabel = 'kube-aggregator.kubernetes.io/automanaged';
const dnsLabel = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;
const versionLabel = /^[a-z](?:[-a-z0-9]*[a-z0-9])?$/;
export function groupError(value: string, version: string): string | null {
  if (!value) return version === 'v1' ? null : 'Group is required unless version is v1.';
  return value.length <= 253 && value.split('.').every(label => dnsLabel.test(label)) ? null : 'Enter a DNS subdomain.';
}
export function versionError(value: string): string | null {
  return value.length <= 63 && versionLabel.test(value) ? null : 'Enter a DNS label starting with a letter.';
}
export function boundedInteger(text: string, min: number, max: number, optional = false): { value?: number; error: string | null } {
  if (optional && text === '') return { error: null };
  if (!/^\d+$/.test(text)) return { error: `Enter a whole number from ${min} to ${max}.` };
  const value = BigInt(text);
  return value >= BigInt(min) && value <= BigInt(max) ? { value: Number(value), error: null } : { error: `Enter a whole number from ${min} to ${max}.` };
}
export function ownershipReason(draft: ResourceEditorDraft): string | null {
  const managed = draft.get(['metadata', 'labels', automanagedLabel]);
  if (managed === 'true' || managed === 'onstart') return 'Auto-registered APIService. Inspect only; controller may restore its registration.';
  const owners = draft.get(['metadata', 'ownerReferences']);
  if (Array.isArray(owners) && owners.some((owner: unknown) => owner !== null && typeof owner === 'object' && 'controller' in owner && owner.controller === true)) return 'Controller-owned APIService. Inspect only; change its owning configuration.';
  return null;
}
export function validateAPIService(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (context.intent === 'inspect' || ownershipReason(draft)) return [];
  const errors: ResourceEditorFieldIssue[] = [];
  const add = (path: string[], message: string | null) => { if (message) errors.push({ path, message }); };
  const group = draft.get(['spec', 'group']) ?? '';
  const version = draft.get(['spec', 'version']);
  add(['spec', 'group'], typeof group === 'string' ? groupError(group, typeof version === 'string' ? version : '') : 'Group must be text.');
  add(['spec', 'version'], typeof version === 'string' ? versionError(version) : 'Version is required.');
  if (typeof group === 'string' && typeof version === 'string' && draft.get(['metadata', 'name']) !== `${version}.${group}`) add(['metadata', 'name'], 'Name must match version.group.');
  for (const [key, max] of [['groupPriorityMinimum', 20000], ['versionPriority', 1000]] as const) {
    const value = draft.get(['spec', key]);
    add(['spec', key], typeof value === 'number' || typeof value === 'bigint' ? boundedInteger(String(value), 1, max).error : `Enter a whole number from 1 to ${max}.`);
  }
  const remote = draft.has(['spec', 'service']) && draft.get(['spec', 'service']) !== null;
  if (remote) {
    for (const key of ['namespace', 'name']) {
      const value = draft.get(['spec', 'service', key]);
      add(['spec', 'service', key], typeof value === 'string' && value.trim() ? null : `Service ${key} is required.`);
    }
    if (draft.has(['spec', 'service', 'port'])) {
      const port = draft.get(['spec', 'service', 'port']);
      add(['spec', 'service', 'port'], typeof port === 'number' || typeof port === 'bigint' ? boundedInteger(String(port), 1, 65535).error : 'Port must be a whole number from 1 to 65535.');
    }
  } else if (draft.has(['spec', 'caBundle']) || draft.get(['spec', 'insecureSkipTLSVerify']) === true) {
    add(['spec', 'service'], 'Local handling cannot use a CA bundle or insecure TLS.');
  }
  if (draft.has(['spec', 'caBundle']) && draft.get(['spec', 'insecureSkipTLSVerify']) === true) add(['spec', 'insecureSkipTLSVerify'], 'Custom CA and insecure TLS cannot be combined.');
  return errors;
}
export function unsupportedShape(draft: ResourceEditorDraft): string | null {
  for (const key of ['group', 'version']) {
    if (draft.has(['spec', key]) && typeof draft.get(['spec', key]) !== 'string') return 'Unsupported identity scalar. Keep source unchanged and use YAML.';
  }
  if (draft.has(['spec', 'insecureSkipTLSVerify']) && typeof draft.get(['spec', 'insecureSkipTLSVerify']) !== 'boolean') return 'Unsupported TLS flag. Keep source unchanged and use YAML.';
  const service = draft.get(['spec', 'service']);
  if (service !== undefined && service !== null) {
    if (typeof service !== 'object' || Array.isArray(service)) return 'Unsupported Service reference. Keep source unchanged and use YAML.';
    if (Object.keys(service).some(key => !['name', 'namespace', 'port'].includes(key))) return 'Extended Service reference retained. Use YAML to change registration mode.';
    for (const key of ['name', 'namespace']) if (draft.has(['spec', 'service', key]) && typeof draft.get(['spec', 'service', key]) !== 'string') return 'Unsupported Service reference scalar. Keep source unchanged and use YAML.';
  }
  return null;
}
export function localOperations(): readonly ResourceEditorPatch[] {
  return [{ op: 'remove', path: ['spec', 'service'] }, { op: 'remove', path: ['spec', 'caBundle'] }, { op: 'remove', path: ['spec', 'insecureSkipTLSVerify'] }];
}
export function trustOperations(mode: 'system' | 'insecure'): readonly ResourceEditorPatch[] {
  return [{ op: 'remove', path: ['spec', 'caBundle'] }, mode === 'insecure' ? { op: 'set', path: ['spec', 'insecureSkipTLSVerify'], value: true } : { op: 'remove', path: ['spec', 'insecureSkipTLSVerify'] }];
}
/** Original bytes only. Never stringify binary through a Unicode text decoder. */
export function encodeCABytes(bytes: Uint8Array): string {
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) result += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(result);
}

export function labelKeyError(key: string): string | null {
  if (key === automanagedLabel) return 'Automanagement belongs to controller configuration.';
  const parts = key.split('/');
  if (parts.length > 2) return 'Use an optional DNS prefix and a label name.';
  const name = parts.at(-1) ?? '';
  if (!name || name.length > 63 || !/^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(name)) return 'Label name must be 1–63 letters, digits, dots, underscores or hyphens.';
  if (parts.length === 2 && (!parts[0] || parts[0].length > 253 || !parts[0].split('.').every(label => dnsLabel.test(label)))) return 'Label prefix must be a DNS subdomain.';
  return null;
}
export function labelValueError(value: string): string | null {
  return value.length <= 63 && (value === '' || /^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(value)) ? null : 'Label value must be at most 63 letters, digits, dots, underscores or hyphens.';
}
