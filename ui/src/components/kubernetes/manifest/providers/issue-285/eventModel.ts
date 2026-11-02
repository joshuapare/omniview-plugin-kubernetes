import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorReference } from '@omniviewdev/runtime';

export const NOT_REPORTED = 'Not reported';

/** Never stringify opaque redaction markers or arbitrary projected objects. */
export function eventText(value: unknown): string {
  if (typeof value === 'string') return value || NOT_REPORTED;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return value == null ? NOT_REPORTED : 'Unsupported representation';
}

export function eventReadBoundary(context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') {
    return ({ denied: 'Event discovery denied.', absent: 'Event API is not served.', unavailable: 'Event API unavailable.', unknown: 'Event discovery unknown.' } as const)[context.discovery.status];
  }
  if (context.capabilities.get !== 'available') {
    return ({ denied: 'Event read denied.', absent: 'Event read is not supported.', unavailable: 'Event read unavailable.', unknown: 'Event read authorization unknown.' } as const)[context.capabilities.get];
  }
  return null;
}

export interface EventObjectReference {
  apiVersion?: string;
  kind?: string;
  namespace?: string;
  name?: string;
  uid?: string;
  resourceVersion?: string;
  fieldPath?: string;
}

export function eventReference(draft: ResourceEditorDraft, field: 'regarding' | 'related'): EventObjectReference | null {
  if (!draft.has([field])) return null;
  const result: EventObjectReference = {};
  for (const key of ['apiVersion', 'kind', 'namespace', 'name', 'uid', 'resourceVersion', 'fieldPath'] as const) {
    const value = draft.get([field, key]);
    if (typeof value === 'string' && value) result[key] = value;
  }
  return result;
}

/** Compare identity, never reason, timestamps, names alone, or diagnostic text. */
export function coreEventAlias(draft: ResourceEditorDraft, namespace: string, candidates: readonly ResourceEditorReference[]): ResourceEditorReference | undefined {
  const uid = draft.get(['metadata', 'uid']);
  if (typeof uid !== 'string' || !uid) return undefined;
  return candidates.find(candidate => candidate.uid === uid && candidate.namespace === namespace);
}
