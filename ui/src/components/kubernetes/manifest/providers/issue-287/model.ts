import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
import { resourceEditorPathContains } from '@omniviewdev/runtime';

export const groupPath = ['spec', 'resource', 'group'] as const;
export const resourcePath = ['spec', 'resource', 'resource'] as const;

export function groupError(value: string): string | null {
  if (!value) return null;
  return value.length <= 253 && /^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(value)
    && value.split('.').every(label => /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(label))
    ? null : 'Enter a lowercase DNS group, or leave empty for core.';
}
export function resourceError(value: string): string | null {
  return value.length <= 63 && /^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(value)
    ? null : 'Enter the exact plural resource: lowercase DNS label, starting with a letter.';
}
function isMap(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function unsupportedMigration(draft: ResourceEditorDraft): string | null {
  for (const path of [['spec'], ['spec', 'resource']] as const) {
    if (draft.has(path) && !isMap(draft.get(path))) return 'Migration target has an unsupported shape. Source remains unchanged.';
  }
  for (const path of [groupPath, resourcePath]) {
    if (draft.has(path) && typeof draft.get(path) !== 'string') return 'Migration target must use string scalars. Source remains unchanged.';
  }
  return null;
}
export function migrationAvailability(context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') {
    return context.discovery.status === 'absent' ? 'Storage migration API is not served. Check API enablement and StorageVersionMigrator.'
      : context.discovery.status === 'denied' ? 'Storage migration API discovery is denied.' : 'Storage migration API availability is unknown or unavailable.';
  }
  if (context.schema.status !== 'available') return 'Installed migration schema is not available for guided authoring.';
  const schemaPaths = context.schema.paths;
  if (schemaPaths && [groupPath, resourcePath].some(target => !schemaPaths.some(path => resourceEditorPathContains(path, target)))) {
    return 'Installed schema does not admit the migration target fields.';
  }
  if (context.discovery.features.StorageVersionMigrator === 'absent' || context.discovery.features.StorageVersionMigrator === 'denied') {
    return 'StorageVersionMigrator is not available.';
  }
  if (context.capabilities.create !== 'available') return context.capabilities.create === 'denied'
    ? 'Creating storage migrations is denied.' : 'Create permission is unknown or unavailable.';
  return null;
}
export function validateMigration(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (context.intent !== 'create') return [];
  const unsupported = unsupportedMigration(draft);
  if (unsupported) return [{ path: resourcePath, message: unsupported }];
  const issues: ResourceEditorFieldIssue[] = [];
  const group = draft.get(groupPath);
  const resource = draft.get(resourcePath);
  const badGroup = groupError(typeof group === 'string' ? group : '');
  const badResource = resourceError(typeof resource === 'string' ? resource : '');
  if (badGroup) issues.push({ path: groupPath, message: badGroup });
  if (badResource) issues.push({ path: resourcePath, message: badResource });
  return issues;
}
export interface MigrationCondition {
  type: string;
  status: string;
  reason: string;
  lastTransitionTime: string;
  observedGeneration: string;
  hasMessage: boolean;
}
function exactText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value)) ? String(value) : 'Not reported';
}
export function migrationConditions(draft: ResourceEditorDraft): readonly MigrationCondition[] {
  const values = draft.get(['status', 'conditions']);
  if (!Array.isArray(values)) return [];
  return values.filter(isMap).map(value => ({
    type: exactText(value.type), status: exactText(value.status), reason: exactText(value.reason),
    lastTransitionTime: exactText(value.lastTransitionTime), observedGeneration: exactText(value.observedGeneration),
    hasMessage: value.message !== undefined && value.message !== '',
  }));
}
export function migrationProgress(conditions: readonly MigrationCondition[]): string {
  const active = conditions.filter(condition => condition.status === 'True');
  const terminal = active.filter(condition => condition.type === 'Failed' || condition.type === 'Succeeded');
  if (terminal.length > 1 || (terminal.length && active.some(condition => condition.type === 'Running'))) return 'Conflicting observations';
  if (terminal[0]?.type === 'Failed') return 'Failed';
  if (terminal[0]?.type === 'Succeeded') return 'Succeeded';
  if (active.some(condition => condition.type === 'Running')) return 'Running';
  return 'Not reported';
}
