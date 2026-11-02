import type { ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export const group = 'apiextensions.crossplane.io';
export const definitions = [
  ['CompositeResourceDefinition','v2','compositeresourcedefinitions'],
  ['Composition','v1','compositions'],
  ['EnvironmentConfig','v1beta1','environmentconfigs'],
  ['ManagedResourceActivationPolicy','v1alpha1','managedresourceactivationpolicies'],
  ['Usage','v1beta1','usages'],
  ['CompositionRevision','v1','compositionrevisions'],
  ['ManagedResourceDefinition','v1alpha1','managedresourcedefinitions'],
] as const;
/** Admit only fresh JSON schema objects whose numeric tokens remain exact in the draft. */
export function parseSchemaFragment(input: string): { valid: true; value: object } | { valid: false; error: string } {
  let value: unknown;
  try { value = JSON.parse(input); } catch { return { valid: false, error: 'Enter valid JSON.' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, error: 'Schema must be an object.' };
  const numericTokens = input.replace(/"(?:\\.|[^"\\])*"/g, '""').match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) ?? [];
  if (numericTokens.some(token => !/^-?\d+$/.test(token) || !Number.isSafeInteger(Number(token)))) return { valid: false, error: 'Use safe whole-number JSON values; edit other numeric values in source.' };
  return { valid: true, value };
}
export const generated = (kind: string) => kind === 'CompositionRevision' || kind === 'ManagedResourceDefinition';
export function validateDomain(draft: ResourceEditorDraft, kind: string): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const requireText = (path: (string|number)[]) => { if (typeof draft.get(path) !== 'string' || !String(draft.get(path)).trim()) issues.push({ path, message: 'Required.' }); };
  if (kind === 'CompositeResourceDefinition') {
    [['spec','group'],['spec','names','kind'],['spec','names','plural']].forEach(requireText);
    const versions = draft.get(['spec','versions']);
    if (!Array.isArray(versions) || !versions.length) issues.push({path:['spec','versions'],message:'Add at least one version.'});
    else { let references = 0; versions.forEach((_, i) => { requireText(['spec','versions',i,'name']); if (draft.get(['spec','versions',i,'referenceable']) === true) { references++; if (draft.get(['spec','versions',i,'served']) !== true) issues.push({path:['spec','versions',i,'served'],message:'Referenceable versions must be served.'}); } }); if (references !== 1) issues.push({path:['spec','versions'],message:'Exactly one version must be referenceable.'}); }
  }
  if (kind === 'Composition') {
    requireText(['spec','compositeTypeRef','apiVersion']); requireText(['spec','compositeTypeRef','kind']);
    const pipeline = draft.get(['spec','pipeline']);
    if (!Array.isArray(pipeline) || pipeline.length < 1 || pipeline.length > 99) issues.push({path:['spec','pipeline'],message:'Use 1–99 pipeline steps.'});
    else { const names = new Set(); pipeline.forEach((_, i) => { requireText(['spec','pipeline',i,'step']); requireText(['spec','pipeline',i,'functionRef','name']); const name = draft.get(['spec','pipeline',i,'step']); if (names.has(name)) issues.push({path:['spec','pipeline',i,'step'],message:'Step names must be unique.'}); names.add(name); }); }
  }
  if (kind === 'ManagedResourceActivationPolicy') { const values = draft.get(['spec','activate']); if (!Array.isArray(values) || !values.length || values.some(v => typeof v !== 'string' || !v.trim() || !/^[a-z0-9.*-]+$/.test(v) || (v.includes('*') && (!v.endsWith('*') || v.indexOf('*') !== v.length-1)))) issues.push({path:['spec','activate'],message:'Enter resource names or trailing-prefix wildcard patterns.'}); }
  if (kind === 'Usage') { ['apiVersion','kind'].forEach(key => requireText(['spec','of',key])); if (!draft.has(['spec','of','resourceSelector'])) requireText(['spec','of','resourceRef','name']); if (!draft.has(['spec','by']) && !draft.get(['spec','reason'])) issues.push({path:['spec','reason'],message:'Provide a reason or using resource.'}); }
  return issues;
}
export function parseScalar(text: string, type: string): {valid:true;value:string|number|bigint}|{valid:false;error:string} {
  if (type === 'string') return {valid:true,value:text};
  if (type === 'boolean') return text === 'true' || text === 'false' ? {valid:true,value:text} : {valid:false,error:'Choose true or false.'};
  if (/^-?\d+$/.test(text)) return {valid:true,value:BigInt(text)};
  if (!/^-?(?:\d+\.\d*|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return {valid:false,error:'Enter a finite number.'};
  const value = Number(text); return Number.isFinite(value) ? {valid:true,value} : {valid:false,error:'Enter a finite number.'};
}
