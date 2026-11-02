import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { generated, resources, validatePackage, validateImage, validateRuntime, unsupportedReason } from './model';
const PackageForm=lazy(()=>import('./forms').then(module=>({default:module.PackageForm})));
const RuntimeForm=lazy(()=>import('./forms').then(module=>({default:module.RuntimeForm})));
const ImageForm=lazy(()=>import('./forms').then(module=>({default:module.ImageForm})));
const InspectionForm=lazy(()=>import('./forms').then(module=>({default:module.InspectionForm})));
export const resourceEditors: readonly ResourceEditorContribution[] = resources.map(([kind,resource,version]):ResourceEditorContribution=>{
 const inspection=generated(kind);
 const packageKind=['Provider','Configuration','Function'].includes(kind);
 const paths = packageKind ? ['package','revisionActivationPolicy','packagePullPolicy','packagePullSecrets','revisionHistoryLimit','skipDependencyResolution','ignoreCrossplaneConstraints','commonLabels',...(kind==='Configuration'?[]:['runtimeConfigRef'])] : kind==='DeploymentRuntimeConfig'?['deploymentTemplate','serviceTemplate','serviceAccountTemplate']:kind==='ImageConfig'?['matchImages','rewriteImage','registry','verification']:[];
 return {contractVersion:1,ownershipPolicy:inspection?'controller':'declarative',
 targets:[{group:'pkg.crossplane.io',version,kind,resource,scope:'Cluster'},...(['Function','FunctionRevision'].includes(kind)?[{group:'pkg.crossplane.io',version:'v1beta1',kind,resource,scope:'Cluster' as const}]:[])],
 intents:inspection?['inspect']:['create','edit','inspect'],label:`Crossplane ${kind}`,sections:[{id:'configuration',label:inspection?'Inspection':'Configuration'}],ownedPaths:paths.map(path=>['spec',path]),
 component:inspection?InspectionForm:packageKind?PackageForm:kind==='ImageConfig'?ImageForm:RuntimeForm,
 readOnly:()=>inspection,
 validate:packageKind?validatePackage:kind==='ImageConfig'?validateImage:kind==='DeploymentRuntimeConfig'?validateRuntime:undefined,
 formUnavailable:(draft,context)=>context.discovery.status!=='available'?'Crossplane resource discovery is not available.':context.schema.status!=='available'?'Installed Crossplane schema is not available.':inspection?null:unsupportedReason(draft,kind),
 };
});
