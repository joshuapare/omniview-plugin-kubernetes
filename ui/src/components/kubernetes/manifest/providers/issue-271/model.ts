import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPath } from '@omniviewdev/runtime';

export const MANAGER = ['metadata', 'labels', 'endpointslice.kubernetes.io/managed-by'] as const;
export const SERVICE = ['metadata', 'labels', 'kubernetes.io/service-name'] as const;
export const CONTROLLERS: Readonly<Record<string, true>> = { 'endpointslice-controller.k8s.io': true, 'endpointslicemirroring-controller.k8s.io': true };
export const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const rows = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
export const text = (value: unknown): string => typeof value === 'string' ? value : '';
export const dnsLabel = (value: string): boolean => value.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(value);
export const dnsName = (value: string): boolean => value.length <= 253 && value.split('.').every(dnsLabel);
export const labelValue = (value: string): boolean => value.length <= 63 && /^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(value);
export function qualifiedName(value: string): boolean {
  const parts = value.split('/');
  return parts.length === 1 ? labelValue(parts[0]) : parts.length === 2 && dnsName(parts[0]) && labelValue(parts[1]);
}
export function managerError(value: string): string | null {
  return !labelValue(value) ? 'Enter a distinct manager label (1–63 characters).' : Object.hasOwn(CONTROLLERS, value) ? 'Controller manager is reserved. Use your manual manager identity.' : null;
}
function ipv4(value: string): number[] | null {
  const parts = value.split('.');
  return parts.length === 4 && parts.every(part => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255) ? parts.map(Number) : null;
}
function ipv6(value: string): number[] | null {
  let source = value;
  if (source.includes('.')) {
    const colon = source.lastIndexOf(':');
    const tail = ipv4(source.slice(colon + 1));
    if (!tail) return null;
    source = `${source.slice(0, colon)}:${((tail[0] << 8) | tail[1]).toString(16)}:${((tail[2] << 8) | tail[3]).toString(16)}`;
  }
  if (!/^[0-9a-fA-F:]+$/.test(source) || source.split('::').length > 2) return null;
  const halves = source.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const length = left.length + right.length;
  if (!left.concat(right).every(part => /^[0-9a-fA-F]{1,4}$/.test(part)) || (halves.length === 1 ? length !== 8 : length >= 8)) return null;
  return left.concat(Array(8 - length).fill('0'), right).map(part => parseInt(part, 16));
}
export function addressError(value: string, family: unknown): string | null {
  if (family === 'IPv4') {
    const ip = ipv4(value);
    if (!ip) return 'Enter an IPv4 address.';
    if (ip[0] === 127 || ip[0] >= 224 && ip[0] <= 239 || ip[0] === 169 && ip[1] === 254 || ip.every(part => part === 0)) return 'Loopback, link-local, multicast and unspecified endpoints are not allowed.';
  } else if (family === 'IPv6') {
    const ip = ipv6(value);
    if (!ip) return 'Enter an IPv6 address.';
    const zeroPrefix = ip.slice(0, 7).every(part => part === 0);
    if (zeroPrefix && ip[7] <= 1 || (ip[0] & 0xffc0) === 0xfe80 || (ip[0] & 0xff00) === 0xff00) return 'Loopback, link-local, multicast and unspecified endpoints are not allowed.';
    if (ip.slice(0, 5).every(part => part === 0) && ip[5] === 0xffff) return addressError(`${ip[6] >> 8}.${ip[6] & 255}.${ip[7] >> 8}.${ip[7] & 255}`, 'IPv4');
  } else return 'Choose IPv4 or IPv6.';
  return null;
}
export function portError(value: string): string | null {
  return value === '' || /^\d+$/.test(value) && BigInt(value) >= 1n && BigInt(value) <= 65535n ? null : 'Enter a port from 1 to 65535, or leave omitted.';
}
export function ownership(draft: ResourceEditorDraft): 'manual' | 'controller' | 'unknown' {
  const manager = draft.get(MANAGER);
  if (Object.hasOwn(CONTROLLERS, text(manager)) || rows(draft.get(['metadata', 'ownerReferences'])).length > 0) return 'controller';
  return typeof manager === 'string' && !managerError(manager) ? 'manual' : 'unknown';
}
export function isReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  return context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system' || context.intent === 'create' && ownership(draft) === 'controller' || context.intent !== 'create' && (context.ownership?.status !== 'application' || ownership(draft) !== 'manual');
}
export function formUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') return `EndpointSlice API ${context.discovery.status}.`;
  if (context.schema.status !== 'available') return `EndpointSlice schema ${context.schema.status}.`;
  const family = draft.get(['addressType']);
  if (family !== undefined && family !== 'IPv4' && family !== 'IPv6') return 'This address family requires source inspection; FQDN is deprecated and not handled by kube-proxy.';
  for (const key of ['endpoints', 'ports']) {
    const value = draft.get([key]);
    if (value !== undefined && !Array.isArray(value)) return `${key} has an unsupported source shape. Source retained.`;
    if (rows(value).some(row => row === null || typeof row !== 'object' || Array.isArray(row))) return `${key} has an unsupported row. Source retained.`;
  }
  for (const endpoint of rows(draft.get(['endpoints']))) {
    const row = record(endpoint);
    if (!Array.isArray(row.addresses) || !row.addresses.every(address => typeof address === 'string')) return 'Endpoint addresses require source repair. Source retained.';
    if (row.conditions !== undefined && (row.conditions === null || typeof row.conditions !== 'object' || Array.isArray(row.conditions))) return 'Endpoint conditions have an unsupported shape. Source retained.';
    if (['ready', 'serving', 'terminating'].some(key => record(row.conditions)[key] !== undefined && typeof record(row.conditions)[key] !== 'boolean')) return 'Endpoint conditions must be booleans or omitted. Source retained.';
    if (['hostname', 'nodeName', 'zone'].some(key => row[key] !== undefined && typeof row[key] !== 'string')) return 'Endpoint topology has an unsupported shape. Source retained.';
  }
  for (const port of rows(draft.get(['ports']))) {
    const row = record(port);
    if (['name', 'protocol', 'appProtocol'].some(key => row[key] !== undefined && typeof row[key] !== 'string') || row.port !== undefined && typeof row.port !== 'bigint' && !(typeof row.port === 'number' && Number.isSafeInteger(row.port))) return 'Port has an unsupported scalar type. Source retained.';
  }
  return null;
}
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (isReadOnly(draft, context)) return [];
  const issues: ResourceEditorFieldIssue[] = [];
  const add = (path: ResourceEditorPath, message: string | null) => { if (message) issues.push({ path, message }); };
  add(MANAGER, managerError(text(draft.get(MANAGER))));
  if (!['IPv4', 'IPv6'].includes(text(draft.get(['addressType'])))) add(['addressType'], 'Choose an address family.');
  if (!draft.has(['endpoints'])) add(['endpoints'], 'Add endpoints or explicitly choose an empty slice.');
  const endpoints = rows(draft.get(['endpoints']));
  if (endpoints.length > 1000) add(['endpoints'], 'A slice supports at most 1000 endpoints.');
  endpoints.forEach((endpoint, index) => {
    const row = record(endpoint);
    const addresses = rows(row.addresses);
    if (addresses.length < 1 || addresses.length > 100) add(['endpoints', index, 'addresses'], 'Each endpoint needs 1–100 addresses.');
    addresses.forEach((address, addressIndex) => add(['endpoints', index, 'addresses', addressIndex], addressError(text(address), draft.get(['addressType']))));
    if (row.hostname !== undefined && !dnsLabel(text(row.hostname))) add(['endpoints', index, 'hostname'], 'Use a lowercase DNS label.');
    if (row.nodeName !== undefined && !dnsName(text(row.nodeName))) add(['endpoints', index, 'nodeName'], 'Use a valid Node DNS name.');
  });
  const names = new Set<string>();
  const ports = rows(draft.get(['ports']));
  if (ports.length > 20000) add(['ports'], 'Pinned server supports at most 20000 ports.');
  ports.forEach((port, index) => {
    const row = record(port);
    const name = text(row.name);
    add(['ports', index, 'name'], names.has(name) ? 'Port names must be unique, including unnamed ports.' : name && !dnsLabel(name) ? 'Use a lowercase DNS label.' : null);
    names.add(name);
    if (row.port !== undefined) add(['ports', index, 'port'], typeof row.port === 'bigint' || typeof row.port === 'number' && Number.isSafeInteger(row.port) ? portError(String(row.port)) : 'Port must be an integer scalar, not a string or object.');
    if (row.protocol !== undefined && !['TCP', 'UDP', 'SCTP'].includes(text(row.protocol))) add(['ports', index, 'protocol'], 'Choose TCP, UDP or SCTP.');
    if (row.appProtocol !== undefined && !qualifiedName(text(row.appProtocol))) add(['ports', index, 'appProtocol'], 'Use an application protocol or qualified protocol name.');
  });
  const service = draft.get(SERVICE);
  if (service !== undefined && !dnsLabel(text(service))) add(SERVICE, 'Use a valid Service name.');
  return issues;
}
