import type { ResourceEditorDraft, ResourceEditorContext, ResourceEditorPatch } from '@omniviewdev/runtime';
export const metrics = ['ALL_METRICS','REQUEST_COUNT','REQUEST_DURATION','REQUEST_SIZE','RESPONSE_SIZE','TCP_OPENED_CONNECTIONS','TCP_CLOSED_CONNECTIONS','TCP_SENT_BYTES','TCP_RECEIVED_BYTES','GRPC_REQUEST_MESSAGES','GRPC_RESPONSE_MESSAGES'] as const;
export function sampling(text: string) {
  if (!/^\d+(?:\.\d+)?$/.test(text) || Number(text) > 100) return { valid: false as const, error: 'Enter a percentage from 0 to 100.' };
  return { valid: true as const, value: Number(text) };
}
export function placementOperations(mode: string): ResourceEditorPatch[] {
  return [ ...['selector','targetRef','targetRefs'].map(key => ({ op: 'remove' as const, path: ['spec',key] })), ...(mode === 'selector' ? [{ op: 'set' as const, path: ['spec','selector'], value: { matchLabels: {} } }] : mode === 'targetRefs' ? [{ op: 'set' as const, path: ['spec','targetRefs'], value: [] }] : []) ];
}
export function readOnly(draft: ResourceEditorDraft, context: ResourceEditorContext) {
  return context.intent === 'inspect' || context.ownership?.status !== 'application' || Array.isArray(draft.get(['metadata','ownerReferences'])) && (draft.get(['metadata','ownerReferences']) as unknown[]).length > 0;
}
export function unavailable(draft: ResourceEditorDraft, context: ResourceEditorContext) {
  if (context.discovery.status !== 'available' || context.schema.status !== 'available') return 'Installed Telemetry API and schema must be available.';
  if (draft.has(['spec','targetRef'])) return 'Deprecated targetRef remains source-owned. Use YAML to migrate explicitly.';
  const targets = draft.get(['spec','targetRefs']);
  if (Array.isArray(targets) && targets.some((_,index)=>!['Gateway','Service','ServiceEntry'].includes(String(draft.get(['spec','targetRefs',index,'kind']))))) return 'This attachment kind remains source-owned.';
  return null;
}

export function validate(draft: ResourceEditorDraft) {
  const issues: {path: (string | number)[]; message: string}[] = [];
  function walk(path: (string | number)[]) {
    const value = draft.get(path);
    if (value === null || value === undefined) return;
    // Canonical YAML integers are bigint; compare directly to preserve exact source values.
    if (path[path.length-1] === 'randomSamplingPercentage' && (typeof value === 'bigint' ? value < 0n || value > 100n : typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)) issues.push({path,message:'Sampling must be between 0 and 100.'});
    if (path[path.length-1] === 'targetRefs' && Array.isArray(value) && value.length > 16) issues.push({path,message:'At most 16 targets are allowed.'});
    if (value && typeof value === 'object') {
      if (!Array.isArray(value)) {
        const record = value as Record<string,unknown>;
        if (record.operation === 'UPSERT' && (typeof record.value !== 'string' || !record.value)) issues.push({path,message:'UPSERT requires a CEL value.'});
        if ((path[path.length-2] === 'targetRefs' || path[path.length-2] === 'providers') && (typeof record.name !== 'string' || !record.name)) issues.push({path:[...path,'name'],message:'Enter a name.'});
        if (record.operation === 'REMOVE' && 'value' in record) issues.push({path,message:'REMOVE must omit its value.'});
        if ('name' in record && record.name === '') issues.push({path:[...path,'name'],message:'Enter a name.'});
        if ('literal' in record && draft.get([...path,'literal','value']) === '') issues.push({path,message:'Enter a literal tag value.'});
      }
      Object.keys(value).forEach(key=>walk([...path,Array.isArray(value) ? Number(key) : key]));
    }
  }
  walk(['spec']);
  return issues;
}