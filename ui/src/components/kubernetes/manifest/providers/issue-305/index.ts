import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { paths, qualify, resources, validate, type Kind } from './model';
import { validateTigeraSubmission } from './submission';
const component = lazy(() => import('./CalicoOperatorEditor'));
export const resourceEditors: readonly ResourceEditorContribution[] = (Object.keys(resources) as Kind[]).map(kind => ({
 contractVersion:1,
 targets:[{group:'operator.tigera.io',version:'v1',kind,resource:resources[kind],scope:'Cluster'}],
 intents:kind === 'TigeraStatus' ? ['inspect'] : ['create','edit','inspect'],
 ownershipPolicy:kind === 'TigeraStatus' ? 'controller' as const : 'declarative' as const,
 label:`Calico ${kind}`,
 sections:[{id:'configuration',label:kind === 'TigeraStatus' ? 'Health' : 'Configuration'}],
 ownedPaths:paths[kind],
 sensitivePaths:[['metadata','annotations']],
 component,
 formUnavailable:qualify,
 validate,
 validateSubmission:validateTigeraSubmission,
 readOnly:(_draft,context)=>kind === 'TigeraStatus' || context.intent === 'inspect' || context.ownership?.status !== 'application',
}));
