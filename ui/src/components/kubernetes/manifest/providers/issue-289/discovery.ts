export const DISCOVERY_PROTOCOL = 'kubernetes.discovery.v1';
export type DiscoveryVersion = 'v2' | 'v2beta1';
export type DiscoveryEndpoint = '/api' | '/apis';
export interface DiscoveryKind { group: string; version: string; kind: string }
export interface DiscoverySubresource {
  subresource: string;
  responseKind: DiscoveryKind | null;
  acceptedTypes: DiscoveryKind[];
  verbs: string[];
}
export interface DiscoveryResource {
  resource: string;
  scope: string;
  responseKind: DiscoveryKind | null;
  singularResource: string;
  shortNames: string[];
  categories: string[];
  verbs: string[];
  subresources: DiscoverySubresource[];
}
export interface DiscoveryVersionEntry { version: string; freshness: string; resources: DiscoveryResource[] }
export interface DiscoveryGroup { name: string; versions: DiscoveryVersionEntry[] }
export type DiscoveryResponse = { valid: true; groups: DiscoveryGroup[] } | { valid: false; message: string };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function string(value: unknown, optional = false): string {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string') throw new Error('Invalid discovery field.');
  return value;
}
function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('Invalid discovery list.');
  return value.map(parse);
}
function object(value: unknown): Record<string, unknown> {
  if (!record(value)) throw new Error('Invalid discovery object.');
  return value;
}
function kind(value: unknown): DiscoveryKind | null {
  if (value === null || value === undefined) return null;
  const item = object(value);
  return { group: string(item.group, true), version: string(item.version, true), kind: string(item.kind, true) };
}
function resource(value: unknown): DiscoveryResource {
  const item = object(value);
  const scope = string(item.scope);
  if (scope !== 'Cluster' && scope !== 'Namespaced') throw new Error('Unsupported discovery scope.');
  return {
    resource: string(item.resource), scope, responseKind: kind(item.responseKind),
    singularResource: string(item.singularResource, true), shortNames: list(item.shortNames, value => string(value)),
    categories: list(item.categories, value => string(value)), verbs: list(item.verbs, value => string(value)),
    subresources: list(item.subresources, value => {
      const sub = object(value);
      return { subresource: string(sub.subresource), responseKind: kind(sub.responseKind),
        acceptedTypes: list(sub.acceptedTypes, value => {
          const accepted = kind(value);
          if (!accepted) throw new Error('Invalid accepted type.');
          return accepted;
        }), verbs: list(sub.verbs, value => string(value)) };
    }),
  };
}
function group(value: unknown): DiscoveryGroup {
  const item = object(value);
  const metadata = item.metadata === undefined ? {} : object(item.metadata);
  return { name: string(metadata.name, true), versions: list(item.versions, value => {
    const entry = object(value);
    return { version: string(entry.version), freshness: string(entry.freshness, true), resources: list(entry.resources, resource) };
  }) };
}

/** Inspect only known protocol fields. Unknown payload fields never become writable projections. */
export function inspectDiscovery(value: unknown): DiscoveryResponse {
  try {
    const item = object(value);
    if (item.apiVersion !== 'apidiscovery.k8s.io/v2' && item.apiVersion !== 'apidiscovery.k8s.io/v2beta1') {
      return { valid: false, message: 'Unsupported discovery representation. Original source remains available.' };
    }
    if (item.kind === 'APIGroupDiscoveryList') {
      if (!Array.isArray(item.items)) throw new Error('Missing discovery items.');
      return { valid: true, groups: item.items.map(group) };
    }
    if (item.kind === 'APIGroupDiscovery') return { valid: true, groups: [group(item)] };
    return { valid: false, message: 'Not an aggregated discovery response. Original source remains available.' };
  } catch {
    return { valid: false, message: 'Discovery response has an unsupported shape. Original source remains available.' };
  }
}

export function filterDiscovery(groups: readonly DiscoveryGroup[], query: string): DiscoveryGroup[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...groups];
  return groups.flatMap(group => {
    const versions = group.versions.flatMap(version => {
      const resources = version.resources.filter(resource => [group.name, version.version, resource.resource,
        resource.singularResource, resource.responseKind?.kind ?? '', ...resource.shortNames, ...resource.categories,
        ...resource.subresources.map(sub => sub.subresource)].some(value => value.toLocaleLowerCase().includes(needle)));
      return resources.length ? [{ ...version, resources }] : [];
    });
    return versions.length ? [{ ...group, versions }] : [];
  });
}

export function discoveryAccept(version: DiscoveryVersion): string {
  return `application/json;g=apidiscovery.k8s.io;v=${version};as=APIGroupDiscoveryList`;
}
export function kindLabel(value: DiscoveryKind | null): string {
  if (!value || (!value.group && !value.version && !value.kind)) return 'No response kind advertised';
  return `${value.group ? `${value.group}/` : ''}${value.version || 'unspecified version'} · ${value.kind || 'unspecified kind'}`;
}
