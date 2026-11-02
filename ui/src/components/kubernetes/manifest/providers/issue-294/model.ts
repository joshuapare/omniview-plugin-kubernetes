import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorPatch } from '@omniviewdev/runtime';
export const targets = [
 ['GatewayClass','v1','gatewayclasses','Cluster'], ['Gateway','v1','gateways','Namespaced'],
 ['HTTPRoute','v1','httproutes','Namespaced'], ['GRPCRoute','v1','grpcroutes','Namespaced'],
 ['ReferenceGrant','v1beta1','referencegrants','Namespaced'], ['BackendTLSPolicy','v1','backendtlspolicies','Namespaced'],
 ['TCPRoute','v1alpha2','tcproutes','Namespaced'], ['TLSRoute','v1alpha2','tlsroutes','Namespaced'], ['UDPRoute','v1alpha2','udproutes','Namespaced'],
] as const;
export function boundedInteger(text: string, maximum: number, minimum = 0) {
 if (!/^\d+$/.test(text) || BigInt(text) < BigInt(minimum) || BigInt(text) > BigInt(maximum)) return { valid: false as const, error: `Enter a whole number from ${minimum} to ${maximum}.` };
 return { valid: true as const, value: Number(text) };
}
export function trustOperations(mode: string): ResourceEditorPatch[] {
 const path = ['spec','validation'];
 return mode === 'System' ? [{op:'remove',path:[...path,'caCertificateRefs']},{op:'set',path:[...path,'wellKnownCACertificates'],value:'System'}] : [{op:'remove',path:[...path,'wellKnownCACertificates']},{op:'set',path:[...path,'caCertificateRefs'],value:[{group:'',kind:'ConfigMap',name:''}]}];
}
export function readOnly(_draft: ResourceEditorDraft, context: ResourceEditorContext) {
 return context.intent === 'inspect' || context.ownership?.status !== 'application' || (context.intent === 'create' ? context.capabilities.create : context.capabilities.update) !== 'available';
}
export const source = 'https://github.com/kubernetes-sigs/gateway-api/tree/v1.4.0/config/crd';
export function validateGateway(draft: ResourceEditorDraft, context: ResourceEditorContext) {
 const issues: {path: readonly (string|number)[]; message:string}[] = [];
 const required = (path: readonly (string|number)[]) => {
  if(typeof draft.get(path) !== 'string' || draft.get(path) === '') issues.push({path,message:'Enter a value.'});
 };
 if(context.kind==='GatewayClass') required(['spec','controllerName']);
 if(context.kind==='Gateway') required(['spec','gatewayClassName']);
 const collection = context.kind==='Gateway'?'listeners':context.kind==='ReferenceGrant'?'from':context.kind==='BackendTLSPolicy'?'targetRefs':context.kind==='GatewayClass'?null:'rules';
 if(collection) {
  const rows=draft.get(['spec',collection]);
  if(!Array.isArray(rows) || rows.length===0) issues.push({path:['spec',collection],message:'Add at least one entry.'});
 }
 if(context.kind==='BackendTLSPolicy') {
  required(['spec','validation','hostname']);
  const refs=draft.get(['spec','validation','caCertificateRefs']);
  const system=draft.get(['spec','validation','wellKnownCACertificates']);
  if((Array.isArray(refs) && refs.length>0) === (system==='System')) issues.push({path:['spec','validation'],message:'Choose exactly one trust source.'});
 }
 if(context.kind==='ReferenceGrant') {
  const targets=draft.get(['spec','to']);
  if(!Array.isArray(targets)||!targets.length) issues.push({path:['spec','to'],message:'Add a target permission.'});
 }
 return issues;
}
