import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export const REVIEW_PROTOCOL = 'kubernetes.review.v1';
export const TOKEN_PROTOCOL = 'kubernetes.service-account-token.v1';
export type AuthenticationKind = 'TokenReview' | 'SelfSubjectReview' | 'TokenRequest';
export const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const text = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'bigint' ? String(value) : '';
export function lifetimeError(value: string): string | null {
  if (value === '') return null;
  return /^\d+$/.test(value) && BigInt(value) >= 600n && BigInt(value) <= 4294967296n ? null : 'Enter 600–4294967296 whole seconds, or leave empty.';
}
export function unsupported(draft: ResourceEditorDraft, kind: AuthenticationKind): string | null {
  if (kind === 'SelfSubjectReview') return draft.has(['spec']) ? 'SelfSubjectReview has no authored spec. Keep this source unchanged.' : null;
  const spec = draft.get(['spec']);
  if (spec !== undefined && (spec === null || typeof spec !== 'object' || Array.isArray(spec))) return 'The request spec is not a mapping. Use source without conversion.';
  const audiences = draft.get(['spec', 'audiences']);
  if (audiences !== undefined && (!Array.isArray(audiences) || audiences.some(value => typeof value !== 'string'))) return 'Audience entries must be strings. Source remains unchanged.';
  if (kind === 'TokenRequest') {
    const duration = draft.get(['spec', 'expirationSeconds']);
    if (duration !== undefined && duration !== null && typeof duration !== 'number' && typeof duration !== 'bigint') return 'Lifetime must use an integer scalar. Source remains unchanged.';
    if (typeof duration === 'number' && !Number.isSafeInteger(duration)) return 'Lifetime is not a safe integer. Source remains unchanged.';
    const ref = draft.get(['spec', 'boundObjectRef']);
    if (ref !== undefined && ref !== null && (typeof ref !== 'object' || Array.isArray(ref))) return 'Bound object must be a mapping. Source remains unchanged.';
    for (const key of ['apiVersion', 'kind', 'name', 'uid']) {
      const value = draft.get(['spec', 'boundObjectRef', key]);
      if (value !== undefined && typeof value !== 'string') return 'Bound object fields must be strings. Source remains unchanged.';
    }
    if (ref && !['Pod', 'Secret', 'Node'].includes(text(object(ref).kind))) return 'This bound-object kind is unsupported. Keep source unchanged.';
    if (ref && object(ref).apiVersion !== undefined && object(ref).apiVersion !== 'v1') return 'This bound-object API version is unsupported. Keep source unchanged.';
  }
  return null;
}
export function validateRequest(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const kind = context.kind as AuthenticationKind;
  const shape = unsupported(draft, kind);
  if (shape) return [{ path: ['spec'], message: shape }];
  if (kind === 'TokenReview' && !draft.has(['spec', 'token'])) issues.push({ path: ['spec', 'token'], message: 'Enter a token to review.' });
  if (kind === 'TokenReview' && draft.get(['spec', 'token']) === '') issues.push({ path: ['spec', 'token'], message: 'Enter a token to review.' });
  const audiences = draft.get(['spec', 'audiences']);
  if (Array.isArray(audiences) && audiences.some(value => !String(value).trim())) issues.push({ path: ['spec', 'audiences'], message: 'Audience entries cannot be empty.' });
  if (kind === 'TokenRequest') {
    if (!context.namespace || !context.name) issues.push({ path: ['metadata'], message: 'Choose a namespace and ServiceAccount destination.' });
    if (!Array.isArray(audiences) || audiences.length === 0) issues.push({ path: ['spec', 'audiences'], message: 'Add at least one intended audience.' });
    const lifetime = draft.get(['spec', 'expirationSeconds']);
    const error = lifetimeError(lifetime === null || lifetime === undefined ? '' : text(lifetime));
    if (error) issues.push({ path: ['spec', 'expirationSeconds'], message: error });
    if (draft.get(['spec', 'boundObjectRef']) && !text(draft.get(['spec', 'boundObjectRef', 'name'])).trim()) issues.push({ path: ['spec', 'boundObjectRef', 'name'], message: 'Enter a bound object name.' });
  }
  return issues;
}
export function reviewOutcome(output: unknown, requested: readonly string[]): 'authenticated' | 'unauthenticated' | 'audience-mismatch' | 'error' {
  const status = object(object(output).status);
  if (status.error) return 'error';
  if (status.authenticated !== true) return 'unauthenticated';
  const returned = Array.isArray(status.audiences) ? status.audiences : [];
  return requested.length && !requested.some(audience => returned.includes(audience)) ? 'audience-mismatch' : 'authenticated';
}
