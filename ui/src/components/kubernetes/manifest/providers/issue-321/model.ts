import type { ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export const packageKinds = ['Provider', 'Configuration', 'Function'] as const;
export const resources = [
  ['Provider','providers','v1'], ['Configuration','configurations','v1'], ['Function','functions','v1'],
  ['DeploymentRuntimeConfig','deploymentruntimeconfigs','v1beta1'], ['ImageConfig','imageconfigs','v1beta1'],
  ['ProviderRevision','providerrevisions','v1'], ['ConfigurationRevision','configurationrevisions','v1'],
  ['FunctionRevision','functionrevisions','v1'], ['Lock','locks','v1beta1'],
] as const;
export function generated(kind: string) { return kind.endsWith('Revision') || kind === 'Lock'; }
export function packageImageError(value: string): string | null {
  return value && !/\s/.test(value) && !value.includes('://') ? null : 'Enter an OCI package reference without a URL scheme or spaces.';
}
export function nonnegativeInteger(text: string) {
  if (!/^\d+$/.test(text) || BigInt(text) > 9223372036854775807n) return { valid: false as const, error: 'Enter a nonnegative signed 64-bit whole number.' };
  return { valid: true as const, value: BigInt(text) };
}
export function validatePackage(draft: ResourceEditorDraft): readonly ResourceEditorFieldIssue[] {
  const image = draft.get(['spec','package']);
  const error = packageImageError(typeof image === 'string' ? image : '');
  return error ? [{path:['spec','package'],message:error}] : [];
}
export function rows(draft: ResourceEditorDraft, path: readonly (string|number)[]): readonly unknown[] {
  const value = draft.get(path); return Array.isArray(value) ? value : [];
}
export function validateImage(draft: ResourceEditorDraft): readonly ResourceEditorFieldIssue[] {
  const matches = rows(draft, ['spec','matchImages']);
  if (!matches.length) return [{path:['spec','matchImages'],message:'Add at least one image prefix.'}];
  return matches.flatMap((_,index) => {
    const value = draft.get(['spec','matchImages',index,'prefix']);
    return typeof value === 'string' && value.length ? [] : [{path:['spec','matchImages',index,'prefix'],message:'Enter an image prefix.'}];
  });
}
export function validateRuntime(draft: ResourceEditorDraft): readonly ResourceEditorFieldIssue[] {
  const path = ['spec','deploymentTemplate','spec','replicas'];
  if (!draft.has(path)) return [];
  const value = draft.get(path);
  return /^(0|[1-9]\d*)$/.test(String(value)) && BigInt(String(value)) <= 2147483647n ? [] : [{path,message:'Replicas must be a nonnegative 32-bit whole number.'}];
}
export function unsupportedReason(draft: ResourceEditorDraft, kind: string): string | null {
  const arrays = kind === 'ImageConfig' ? [['spec','matchImages'],['spec','verification','cosign','authorities']] : kind === 'DeploymentRuntimeConfig' ? [['spec','deploymentTemplate','spec','template','spec','containers']] : [['spec','packagePullSecrets']];
  for (const path of arrays) {
    if (!draft.has(path)) continue;
    const value = draft.get(path);
    if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) return 'This source shape requires the source editor. Existing content is unchanged.';
  }
  if (kind === 'ImageConfig' && rows(draft,['spec','matchImages']).some((_,index) => {
    const type = draft.get(['spec','matchImages',index,'type']);
    return type !== undefined && type !== 'Prefix';
  })) return 'This image match type is not supported by the guided editor.';
  return null;
}
