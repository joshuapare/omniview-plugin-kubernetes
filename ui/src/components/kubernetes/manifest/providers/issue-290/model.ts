import type { ResourceEditorDraft } from '@omniviewdev/runtime';

export type ImageReviewDecision = 'allowed' | 'denied' | 'request-only' | 'invalid';

/** Never coerce protocol booleans: a malformed response is not approval. */
export function imageReviewDecision(draft: ResourceEditorDraft): ImageReviewDecision {
  if (!draft.has(['status'])) return 'request-only';
  const allowed = draft.get(['status', 'allowed']);
  return allowed === true ? 'allowed' : allowed === false ? 'denied' : 'invalid';
}

export function imageReviewNamespace(draft: ResourceEditorDraft): string {
  const namespace = draft.get(['spec', 'namespace']);
  if (namespace === undefined || namespace === '') return 'Not supplied';
  // Never echo malformed free text into an input or accessible name.
  return typeof namespace === 'string' && namespace.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(namespace)
    ? namespace : 'Unavailable';
}

export function imageReviewImages(draft: ResourceEditorDraft): readonly { hasImage: boolean }[] | null {
  const containers = draft.get(['spec', 'containers']);
  if (containers === undefined) return [];
  if (!Array.isArray(containers)) return null;
  // Image strings can contain credentials. Do not read, stringify, or infer names from them.
  return containers.map((_, index) => ({ hasImage: draft.has(['spec', 'containers', index, 'image']) }));
}

export function imageReviewAnnotationCount(draft: ResourceEditorDraft, path: readonly string[]): number | null {
  const value = draft.get(path);
  if (value === undefined) return 0;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.keys(value).length;
}

export const decisionLabels: Record<ImageReviewDecision, string> = {
  allowed: 'Allowed snapshot',
  denied: 'Denied snapshot',
  'request-only': 'Unknown · no response',
  invalid: 'Unknown · invalid response',
};
