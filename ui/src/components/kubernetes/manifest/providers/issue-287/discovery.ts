import { groupError, resourceError } from './model';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export interface MigrationTarget { group: string; resource: string }

/** Only exact base resources from negotiated APIGroupDiscoveryList are candidates. */
export function migrationTargets(output: unknown): readonly MigrationTarget[] | null {
  if (!record(output) || output.kind !== 'APIGroupDiscoveryList' || !Array.isArray(output.items)) return null;
  const targets = new Map<string, MigrationTarget>();
  for (const item of output.items) {
    if (!record(item) || item.versions !== undefined && !Array.isArray(item.versions)) return null;
    if (item.metadata !== undefined && !record(item.metadata)) return null;
    const group = record(item.metadata) ? item.metadata.name ?? '' : '';
    if (typeof group !== 'string' || groupError(group)) return null;
    for (const version of item.versions ?? []) {
      if (!record(version)) return null;
      if (version.freshness !== 'Current') continue;
      if (version.resources !== undefined && !Array.isArray(version.resources)) return null;
      for (const resource of version.resources ?? []) {
        if (!record(resource) || typeof resource.resource !== 'string' || resourceError(resource.resource)) continue;
        if (!Array.isArray(resource.verbs) || !resource.verbs.includes('list') || !resource.verbs.includes('update')) continue;
        const target = { group, resource: resource.resource };
        targets.set(JSON.stringify([group, target.resource]), target);
      }
    }
  }
  return [...targets.values()].sort((left, right) => left.group.localeCompare(right.group) || left.resource.localeCompare(right.resource));
}
