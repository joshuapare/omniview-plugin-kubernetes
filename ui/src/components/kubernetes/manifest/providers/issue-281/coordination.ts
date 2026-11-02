import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export const leaseFields = [
  { name: 'holderIdentity', label: 'Holder identity', kind: 'text', help: 'Application-defined holder identity. Changing this value can transfer coordination ownership.' },
  { name: 'leaseDurationSeconds', label: 'Takeover wait (seconds)', kind: 'positive', help: 'Time contenders wait after the last observed renewal before attempting acquisition. This is not an expiry or health verdict.' },
  { name: 'acquireTime', label: 'Acquired at', kind: 'time', help: 'RFC3339 timestamp with six fractional digits and a timezone. This records acquisition; it does not acquire the Lease.' },
  { name: 'renewTime', label: 'Last renewed at', kind: 'time', help: 'RFC3339 timestamp with six fractional digits and a timezone. Editing this record does not start a renewal process.' },
  { name: 'leaseTransitions', label: 'Holder transitions', kind: 'counter', help: 'Nonnegative int32 transition count. Clearing omits the value; zero remains an explicit value.' },
] as const;
export type LeaseField = typeof leaseFields[number];
export const leaseOwnedPaths = leaseFields.map(field => ['spec', field.name] as const);
export type ParsedField = { valid: true; value?: string | bigint } | { valid: false; error: string };

export function parseLeaseField(field: LeaseField, text: string): ParsedField {
  if (text === '') return { valid: true };
  if (field.kind === 'text') return { valid: true, value: text };
  if (field.kind === 'time') {
    // Match metav1.MicroTime's RFC3339Micro format without reducing precision through Date serialization.
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{6}(Z|[+-]\d{2}:\d{2})$/.exec(text);
    if (!match) return { valid: false, error: 'Use RFC3339 with six fractional digits and a timezone.' };
    const [, year, month, day, hour, minute, second, zone] = match;
    const y = Number(year), m = Number(month), d = Number(day);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59
      || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) {
      return { valid: false, error: 'Enter a valid calendar timestamp and timezone.' };
    }
    return { valid: true, value: text };
  }
  if (!/^\d+$/.test(text)) return { valid: false, error: 'Enter a whole number.' };
  const value = BigInt(text);
  const minimum = field.kind === 'positive' ? 1n : 0n;
  if (value < minimum || value > 2147483647n) return { valid: false, error: `Enter ${minimum}–2147483647.` };
  return { valid: true, value };
}

export function coordinationShapeError(draft: ResourceEditorDraft, candidate = false): string | null {
  if (draft.has(['spec'])) {
    const spec = draft.get(['spec']);
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) return 'Unsupported spec shape. Source remains unchanged.';
  }
  const names = candidate
    ? ['leaseName', 'binaryVersion', 'emulationVersion', 'strategy', 'pingTime', 'renewTime']
    : ['holderIdentity', 'acquireTime', 'renewTime', 'strategy', 'preferredHolder'];
  for (const name of names) {
    if (draft.has(['spec', name]) && typeof draft.get(['spec', name]) !== 'string') return 'Unsupported field type. Source remains unchanged.';
  }
  if (!candidate) for (const name of ['leaseDurationSeconds', 'leaseTransitions']) {
    const value = draft.get(['spec', name]);
    if (draft.has(['spec', name]) && typeof value !== 'bigint' && !(typeof value === 'number' && Number.isSafeInteger(value))) {
      return 'Unsupported integer type. Source remains unchanged.';
    }
  }
  return null;
}

export function validateLease(draft: ResourceEditorDraft): readonly ResourceEditorFieldIssue[] {
  return leaseFields.flatMap(field => {
    const value = draft.get(['spec', field.name]);
    if (value === undefined) return [];
    const integer = field.kind === 'positive' || field.kind === 'counter';
    if (integer ? typeof value !== 'bigint' && !(typeof value === 'number' && Number.isSafeInteger(value)) : typeof value !== 'string') {
      return [{ path: ['spec', field.name], message: 'Unsupported field type. Source remains unchanged.' }];
    }
    const text = typeof value === 'string' ? value : typeof value === 'bigint' || typeof value === 'number' ? value.toString() : '';
    const parsed = parseLeaseField(field, text);
    return parsed.valid ? [] : [{ path: ['spec', field.name], message: parsed.error }];
  });
}

export function readAvailability(context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') return `API discovery: ${context.discovery.status}.`;
  if (context.capabilities.get !== 'available' && context.intent !== 'create') return `Read access: ${context.capabilities.get}.`;
  return null;
}

/** Only the host can establish application ownership; draft metadata never grants it. */
export function leaseWriteBoundary(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.intent === 'inspect' || context.intent === 'action') return 'Inspection only. Renewal and election remain writer-owned.';
  if (context.ownership?.status !== 'application') return 'Application ownership is not established. Inspection only.';
  const namespace = context.namespace ?? draft.get(['metadata', 'namespace']);
  if (namespace === 'kube-system' || namespace === 'kube-node-lease') return 'System coordination records are inspection only.';
  const owners = draft.get(['metadata', 'ownerReferences']);
  if (owners !== undefined && (!Array.isArray(owners) || owners.length > 0)) return 'Owner-managed records are inspection only.';
  if (draft.has(['spec', 'strategy']) || draft.has(['spec', 'preferredHolder'])) return 'Coordinated election records are inspection only.';
  if (context.discovery.status !== 'available') return `API discovery: ${context.discovery.status}.`;
  if (context.schema.status !== 'available') return `Schema: ${context.schema.status}.`;
  const verb = context.intent === 'create' ? 'create' : 'update';
  if (context.capabilities[verb] !== 'available') return `${verb === 'create' ? 'Create' : 'Update'} access: ${context.capabilities[verb]}.`;
  if (context.intent === 'edit' && (context.capabilities.get !== 'available' || !context.resourceVersion)) return 'A readable current revision is required for editing.';
  if (context.schema.paths && leaseOwnedPaths.some(path => !context.schema.paths!.some(known => known.length === path.length && known.every((part, index) => part === path[index])))) {
    return 'Installed schema does not expose every supported Lease field.';
  }
  return coordinationShapeError(draft);
}
