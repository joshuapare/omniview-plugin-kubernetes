import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';

export const storageVersionTarget = {
  group: 'internal.apiserver.k8s.io', version: 'v1alpha1', kind: 'StorageVersion',
  resource: 'storageversions', scope: 'Cluster',
} as const;

export interface ServerReport {
  apiServerID: string;
  encodingVersion: string;
  decodableVersions: readonly string[];
  servedVersions: readonly string[];
}
export interface StorageCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  observedGeneration: string | null;
  lastTransitionTime: string | null;
  hasReason: boolean;
  hasMessage: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function optionalString(value: unknown): boolean { return value === undefined || typeof value === 'string'; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
function exactInteger(value: unknown): string | null {
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return null;
}

/** Checks only mapped fields. Unknown siblings remain host-owned and untouched. */
export function storageVersionUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.group !== storageVersionTarget.group || context.version !== 'v1alpha1' || context.kind !== 'StorageVersion'
    || context.resource !== 'storageversions' || context.scope !== 'Cluster') return 'Unsupported StorageVersion representation. Original source remains unchanged.';
  if (draft.get(['apiVersion']) !== 'internal.apiserver.k8s.io/v1alpha1' || draft.get(['kind']) !== 'StorageVersion') {
    return 'Unsupported StorageVersion representation. Original source remains unchanged.';
  }
  const spec = draft.get(['spec']);
  if (spec !== undefined && (!record(spec) || Object.keys(spec).length !== 0)) return 'Unsupported StorageVersion spec. Use read-only source inspection.';
  const status = draft.get(['status']);
  if (status !== undefined && !record(status)) return 'Unsupported StorageVersion status. Use read-only source inspection.';
  if (!optionalString(draft.get(['status', 'commonEncodingVersion']))) return 'Unsupported encoding report. Use read-only source inspection.';
  const reports = draft.get(['status', 'storageVersions']);
  if (reports !== undefined && (!Array.isArray(reports) || reports.some(report => !record(report)
    || !optionalString(report.apiServerID) || !optionalString(report.encodingVersion)
    || (report.decodableVersions !== undefined && !strings(report.decodableVersions))
    || (report.servedVersions !== undefined && !strings(report.servedVersions))))) return 'Unsupported server reports. Use read-only source inspection.';
  const conditions = draft.get(['status', 'conditions']);
  if (conditions !== undefined && (!Array.isArray(conditions) || conditions.some(condition => !record(condition)
    || typeof condition.type !== 'string' || !['True', 'False', 'Unknown'].includes(String(condition.status))
    || !optionalString(condition.lastTransitionTime)
    || (condition.observedGeneration !== undefined && exactInteger(condition.observedGeneration) === null)))) {
    return 'Unsupported condition report. Use read-only source inspection.';
  }
  return null;
}

export function readServerReports(draft: ResourceEditorDraft): readonly ServerReport[] {
  const reports = draft.get(['status', 'storageVersions']);
  if (!Array.isArray(reports)) return [];
  return reports.filter(record).map(report => ({
    apiServerID: typeof report.apiServerID === 'string' ? report.apiServerID : '',
    encodingVersion: typeof report.encodingVersion === 'string' ? report.encodingVersion : '',
    decodableVersions: strings(report.decodableVersions) ? report.decodableVersions : [],
    servedVersions: strings(report.servedVersions) ? report.servedVersions : [],
  }));
}

export function readConditions(draft: ResourceEditorDraft): readonly StorageCondition[] {
  const conditions = draft.get(['status', 'conditions']);
  if (!Array.isArray(conditions)) return [];
  return conditions.filter(record).map(condition => ({
    type: condition.type === 'AllEncodingVersionsEqual' ? condition.type : 'Other condition',
    status: condition.status === 'True' || condition.status === 'False' ? condition.status : 'Unknown',
    observedGeneration: exactInteger(condition.observedGeneration),
    lastTransitionTime: typeof condition.lastTransitionTime === 'string' ? condition.lastTransitionTime : null,
    hasReason: condition.reason !== undefined,
    hasMessage: condition.message !== undefined,
  }));
}

export function reportWarnings(report: ServerReport): readonly string[] {
  const warnings: string[] = [];
  if (report.encodingVersion && !report.decodableVersions.includes(report.encodingVersion)) warnings.push('Encoding version is missing from the decode set.');
  if (report.servedVersions.some(version => !report.decodableVersions.includes(version))) warnings.push('A served version is missing from the decode set.');
  return warnings;
}

export function storageReadBoundary(context: ResourceEditorContext): string | null {
  const discovery = context.discovery.status;
  if (discovery === 'denied') return 'API discovery denied. No current reports shown.';
  if (discovery === 'absent') return 'StorageVersion API not discovered. No current reports shown.';
  if (discovery === 'unavailable') return 'StorageVersion API unavailable. No current reports shown.';
  if (discovery === 'unknown') return 'StorageVersion discovery is unknown. No current reports shown.';
  const read = context.capabilities.get;
  if (read === 'denied') return 'Read access denied. No current reports shown.';
  if (read === 'absent') return 'StorageVersion read endpoint absent. No current reports shown.';
  if (read === 'unavailable') return 'StorageVersion read unavailable. No current reports shown.';
  if (read === 'unknown') return 'Read authorization is unknown. No current reports shown.';
  return null;
}
