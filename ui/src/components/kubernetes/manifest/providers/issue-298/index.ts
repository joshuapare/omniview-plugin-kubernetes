import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { designs, entryReadOnly, validate } from './domain';
const components = {
 VirtualService: lazy(()=>import('./Editors').then(m=>({default:m.VirtualService}))),
 DestinationRule: lazy(()=>import('./Editors').then(m=>({default:m.DestinationRule}))),
 Gateway: lazy(()=>import('./Editors').then(m=>({default:m.Gateway}))),
 ServiceEntry: lazy(()=>import('./Editors').then(m=>({default:m.ServiceEntry}))),
 Sidecar: lazy(()=>import('./Editors').then(m=>({default:m.Sidecar}))),
 WorkloadGroup: lazy(()=>import('./Editors').then(m=>({default:m.WorkloadGroup}))),
 ProxyConfig: lazy(()=>import('./Editors').then(m=>({default:m.ProxyConfig}))),
 WorkloadEntry: lazy(()=>import('./Editors').then(m=>({default:m.WorkloadEntry}))),
 EnvoyFilter: lazy(()=>import('./Editors').then(m=>({default:m.EnvoyFilter}))),
};
export const resourceEditors: readonly ResourceEditorContribution[] = Object.entries(designs).map(([kind,design])=>({
 contractVersion:1,
 ownershipPolicy:kind==='WorkloadEntry'?'conditional':'declarative',
 targets:(kind==='EnvoyFilter'||kind==='ProxyConfig'?[design.version]:['v1','v1beta1','v1alpha3']).map(version=>({group:'networking.istio.io',version,kind,resource:design.resource,scope:'Namespaced' as const})),
 intents:['create','edit','inspect'],label:kind==='Gateway'?'Istio Gateway':kind,
 sections:[{id:'configuration',label:'Configuration'}],
 ownedPaths:[...design.fields.map(field=>['spec',...field.path]),...(design.rows??[]).map(row=>['spec',...row.path])],
 sensitivePaths:kind==='EnvoyFilter'?[['spec','configPatches','*','patch','value']]:kind==='ProxyConfig'?[['spec','environmentVariables','*']]:undefined,
 component:components[kind as keyof typeof components],
 validate:(draft)=>validate(kind,draft),
 readOnly:kind==='WorkloadEntry'?entryReadOnly:undefined,
 formUnavailable:(draft,context)=>{
  if(context.schema.status!=='available')return 'Installed Istio schema is unavailable.';
  if(kind==='VirtualService'&&(draft.has(['spec','http',0,'match',0,'uri','exact'])||draft.has(['spec','http',0,'match',0,'uri','regex'])))return 'Existing URI match uses another branch. Preserve it in source.';
  if(kind==='DestinationRule'&&draft.has(['spec','trafficPolicy','loadBalancer','consistentHash']))return 'Consistent-hash policy requires source editing.';
  if(kind==='WorkloadGroup'&&(draft.has(['spec','probe','tcpSocket'])||draft.has(['spec','probe','exec'])))return 'Existing readiness probe uses another branch. Preserve it in source.';
  return null;
 },
}));
