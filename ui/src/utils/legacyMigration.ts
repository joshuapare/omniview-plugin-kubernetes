import type { SidebarOrder } from '../hooks/useSidebarOrder';

import { builtinResourceTypes } from './builtinResourceTypes';

// Only historically registered built-ins and versions are safe without discovery.
const builtins: Record<string, string> = {};

const legacyPattern = /^[^:]+::[^:]+::[^:]+$/;

// Historical UI registrations used these short group names.
const shortGroups: Record<string, string> = {
  'networking.k8s.io': 'networking', 'rbac.authorization.k8s.io': 'rbac',
  'storage.k8s.io': 'storage', 'coordination.k8s.io': 'coordination',
  'discovery.k8s.io': 'discovery', 'node.k8s.io': 'node',
  'scheduling.k8s.io': 'scheduling', 'flowcontrol.apiserver.k8s.io': 'flowcontrol',
  'admissionregistration.k8s.io': 'admissionregistration',
  'events.k8s.io': 'events',
};
for (const [binding, canonical] of Object.entries(builtinResourceTypes)) {
  const [group, kind] = binding.split('/');
  const legacyGroup = group ? (shortGroups[group] ?? group) : 'core';
  builtins[`${legacyGroup}::v1::${kind}`] = canonical;
  if (group) builtins[`${group}::v1::${kind}`] = canonical;
}
builtins['autoscaling::v2::HorizontalPodAutoscaler'] = builtinResourceTypes['autoscaling/HorizontalPodAutoscaler'];
builtins['helm::v1::Release'] = 'helm:releases';
builtins['helm::v1::Repository'] = 'helm:repositories';
builtins['helm::v1::Chart'] = 'helm:charts';

function legacyType(segment: string): string | undefined {
  if (legacyPattern.test(segment)) return segment;
  const match = /^([^_]+)_(v[0-9]+(?:alpha[0-9]+|beta[0-9]+)?)_([^_]+)$/.exec(segment);
  return match ? `${match[1]}::${match[2]}::${match[3]}` : undefined;
}
export type PageMigration = { kind: 'unchanged' } | { kind: 'migrated'; path: string } | { kind: 'unconvertible'; reason: string };

export function migratePagePath(path: string): PageMigration {
  const match = /^(\/_plugin\/[^/]+\/cluster\/[^/]+\/resources\/)([^/?#]+)([?#].*)?$/.exec(path);
  if (!match) return { kind: 'unchanged' };
  let type: string;
  try { type = decodeURIComponent(match[2]); } catch {
    return { kind: 'unconvertible', reason: `Invalid resource path encoding: ${match[2]}` };
  }
  // Canonical provider types are opaque, even when their payload resembles a legacy GVK.
  if (type.startsWith('k8s:') || type.startsWith('helm:')) return { kind: 'unchanged' };
  const legacy = legacyType(type);
  if (!legacy) return /::|_v[0-9]/.test(type)
    ? { kind: 'unconvertible', reason: `Malformed legacy Kubernetes resource type: ${type}` }
    : { kind: 'unchanged' };
  const canonical = Object.hasOwn(builtins, legacy) ? builtins[legacy] : undefined;
  return canonical
    ? { kind: 'migrated', path: `${match[1]}${encodeURIComponent(canonical)}${match[3] ?? ''}` }
    : { kind: 'unconvertible', reason: `Unknown legacy Kubernetes resource type: ${type}` };
}

const preferenceSuffix = /-(?:column-visibility|column-filters|column-sizing|label-cols|annotation-cols|toolbar-filter-values)$/;
export const legacyBackupPrefix = 'kubernetes-legacy-preference-backup:';

/** Resolve the scope from configured connections, never from a legacy type suffix. */
export function migrateColumnPreferences(storage: Storage, connectionIDs: readonly string[], profilePrefix = ''): string[] {
  const unknown: string[] = [];
  const providerPrefix = 'kubernetes-';
  const connectionPrefixes = [...new Set(connectionIDs)].map(id => `${providerPrefix}${id}-`);
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => key !== null);
  for (const key of keys) {
    if (!key.startsWith(profilePrefix)) {
      continue;
    }

    const logicalKey = key.slice(profilePrefix.length);
    if (!logicalKey.startsWith(providerPrefix) || logicalKey.startsWith(legacyBackupPrefix)) {
      continue;
    }

    const suffix = preferenceSuffix.exec(logicalKey)?.[0];
    if (!suffix) {
      continue;
    }

    const stem = logicalKey.slice(0, -suffix.length);
    const matches = connectionPrefixes.filter(prefix => stem.startsWith(prefix));
    const destinationPrefix = matches.length === 1 ? matches[0] : providerPrefix;
    const legacy = stem.slice(destinationPrefix.length);
    if (!legacy.includes('::') || legacy.startsWith('k8s:') || legacy.startsWith('helm:')) {
      continue;
    }

    const value = storage.getItem(key);
    if (value === null) {
      continue;
    }

    const backup = profilePrefix + legacyBackupPrefix + logicalKey;
    if (storage.getItem(backup) === null) {
      storage.setItem(backup, value);
    }

    if (matches.length > 1 || !legacyPattern.test(legacy) || !Object.hasOwn(builtins, legacy)) {
      unknown.push(key);
      continue;
    }

    const destination = `${profilePrefix}${destinationPrefix}${builtins[legacy]}${suffix}`;
    if (storage.getItem(destination) === null) {
      storage.setItem(destination, value);
    }
  }

  return unknown;
}

/** Preserve the first order before replacing historical resource IDs in-place. */
export function migrateSidebarOrder(storage: Storage, profilePrefix = ''): string[] {
  const key = profilePrefix + 'kubernetes-sidebar-order';
  const value = storage.getItem(key);
  if (value === null) {
    return [];
  }

  const backup = profilePrefix + legacyBackupPrefix + 'kubernetes-sidebar-order';
  const preserve = () => {
    if (storage.getItem(backup) === null) {
      storage.setItem(backup, value);
    }
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    preserve();
    return [key];
  }

  const order = parsed as SidebarOrder | null;
  if (order === null || typeof order !== 'object' || !Array.isArray(order.items)
    || !order.items.every(id => typeof id === 'string')
    || order.children === null || typeof order.children !== 'object' || Array.isArray(order.children)
    || !Object.values(order.children).every(ids => Array.isArray(ids) && ids.every(id => typeof id === 'string'))) {
    preserve();
    return [key];
  }

  const issues = new Set<string>();
  let changed = false;
  const convert = (id: string): string => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(id);
    } catch {
      issues.add(`${key}: ${id}`);
      return id;
    }

    if (decoded.startsWith('k8s:') || decoded.startsWith('helm:')) {
      return id;
    }

    const legacy = legacyType(decoded);
    if (legacy && Object.hasOwn(builtins, legacy)) {
      return encodeURIComponent(builtins[legacy]);
    }

    if (legacy || /::|_v[0-9]/.test(decoded)) {
      issues.add(`${key}: ${id}`);
    }
    return id;
  };
  const convertOrder = (ids: string[]): string[] => {
    const originalIDs = new Set(ids);
    const convertedIDs = new Set<string>();
    const next: string[] = [];
    for (const id of ids) {
      const converted = convert(id);
      if (converted !== id) {
        changed = true;
        // A current canonical choice wins over an older spelling of that choice.
        if (originalIDs.has(converted) || convertedIDs.has(converted)) {
          continue;
        }
      }
      convertedIDs.add(converted);
      next.push(converted);
    }
    return next;
  };
  const items = convertOrder(order.items);
  const children = new Map<string, string[]>();
  for (const [id, ids] of Object.entries(order.children)) {
    const converted = convert(id);
    const convertedOrder = convertOrder(ids);
    if (converted !== id) {
      changed = true;
      if (Object.hasOwn(order.children, converted) || children.has(converted)) {
        continue;
      }
    }
    children.set(converted, convertedOrder);
  }

  if (changed || issues.size > 0) {
    preserve();
    if (changed) {
      storage.setItem(key, JSON.stringify({ ...order, items, children: Object.fromEntries(children) }));
    }
  }
  return [...issues];
}
