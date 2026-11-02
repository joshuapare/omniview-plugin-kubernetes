import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { definitions, unsupported } from './model';
import { validateMonitoring } from './validation';
const component=lazy(()=>import('./MonitoringForm'));
export const resourceEditors:readonly ResourceEditorContribution[]=Object.entries(definitions).map(([kind,definition])=>({
 contractVersion:1,targets:[{group:'monitoring.coreos.com',version:definition.version,kind,resource:definition.resource,scope:'Namespaced'}],
 ownershipPolicy:'declarative',
 intents:['create','edit','inspect'],label:kind,sections:[{id:'configuration',label:'Configuration'}],
 ownedPaths:definition.fields.map(field=>['spec',field.key]),component,
 sensitivePaths:[['spec','remoteWrite','*','bearerToken'],['spec','remoteWrite','*','headers'],['spec','receivers','*','webhookConfigs','*','url'],['spec','groups','*','rules','*','annotations']],
 formUnavailable:(draft)=>unsupported(draft,kind),
 validate:(draft)=>validateMonitoring(draft,kind),
 readOnly:(_draft,context)=>context.intent==='inspect'||context.ownership?.status!=='application',
 requirements:{schema:{paths:[['spec']]}},
}));
