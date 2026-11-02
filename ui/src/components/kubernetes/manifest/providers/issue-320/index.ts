import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { definitions, generated, group, validateDomain } from './model';
const components = {
 CompositeResourceDefinition:lazy(()=>import('./Forms').then(module=>({default:module.XRD}))),
 Composition:lazy(()=>import('./Forms').then(module=>({default:module.Composition}))),
 EnvironmentConfig:lazy(()=>import('./Forms').then(module=>({default:module.Environment}))),
 ManagedResourceActivationPolicy:lazy(()=>import('./Forms').then(module=>({default:module.Activation}))),
 Usage:lazy(()=>import('./Forms').then(module=>({default:module.Usage}))),
 CompositionRevision:lazy(()=>import('./Forms').then(module=>({default:module.Inspection}))),
 ManagedResourceDefinition:lazy(()=>import('./Forms').then(module=>({default:module.Inspection}))),
};
const paths: Record<string, readonly (readonly string[])[]> = {
 CompositeResourceDefinition:[['spec','group'],['spec','names'],['spec','scope'],['spec','versions'],['spec','defaultCompositionUpdatePolicy'],['spec','defaultCompositionRef'],['spec','enforcedCompositionRef']],
 Composition:[['spec','compositeTypeRef'],['spec','mode'],['spec','pipeline'],['spec','writeConnectionSecretsToNamespace']],
 EnvironmentConfig:[['data']], ManagedResourceActivationPolicy:[['spec','activate']], Usage:[['spec','of'],['spec','by'],['spec','reason'],['spec','replayDeletion']],
};
export const resourceEditors: readonly ResourceEditorContribution[] = definitions.map(([kind,version,resource])=>({
 contractVersion:1, targets:[{group,version,kind,resource,scope:'Cluster'}],
 ownershipPolicy:generated(kind)?'controller':'declarative',
 intents:generated(kind)?['inspect']:['create','edit','inspect'], label:`Crossplane ${kind}`,
 sections:[{id:'configuration',label:generated(kind)?'Inspection':'Configuration'}],
 ownedPaths:paths[kind]??[], sensitivePaths:kind==='Composition'?[['spec','pipeline','*','input']]:[],
 component:components[kind], readOnly:(_draft,context)=>generated(kind)||context.intent==='inspect',
 validate:(draft)=>generated(kind)?[]:validateDomain(draft,kind),
 formUnavailable:(draft)=>kind==='Composition'&&draft.has(['spec','mode'])&&draft.get(['spec','mode'])!=='Pipeline'?'Only Pipeline compositions are supported. Original source is retained.':null,
}));
