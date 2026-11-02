import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { targets, readOnly, validateGateway } from './model';
const component = lazy(() => import('./GatewayForms'));
const paths: Record<string,string[]> = {
 GatewayClass:['controllerName','description','parametersRef'], Gateway:['gatewayClassName','listeners'],
 HTTPRoute:['parentRefs','hostnames','rules'], GRPCRoute:['parentRefs','hostnames','rules'],
 ReferenceGrant:['from','to'], BackendTLSPolicy:['targetRefs','validation'],
 TCPRoute:['parentRefs','rules'], TLSRoute:['parentRefs','hostnames','rules'], UDPRoute:['parentRefs','rules'],
};
export const resourceEditors: readonly ResourceEditorContribution[] = targets.map(([kind,version,resource,scope])=>({
 contractVersion:1, targets:[{group:'gateway.networking.k8s.io',version,kind,resource,scope}],
 ownershipPolicy:'declarative',
 intents:['create','edit','inspect'],label:`Gateway API · ${kind}`,sections:[{id:'configuration',label:'Configuration'}],
 ownedPaths:paths[kind].map(path=>['spec',path]),component,readOnly,validate:validateGateway,
 formUnavailable:(draft)=> {
  for(const path of ['listeners','rules','parentRefs','hostnames','from','to','targetRefs']) {
   if(draft.has(['spec',path]) && !Array.isArray(draft.get(['spec',path]))) return 'Unsupported collection shape. Source remains unchanged.';
  }
  return null;
 },
}));
