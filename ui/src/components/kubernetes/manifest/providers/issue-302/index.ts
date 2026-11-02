import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { lazy } from 'react';

import { designs, isReadOnly, pathOf } from './domain';
const CiliumForm = lazy(() => import('./CiliumForm'));
export const resourceEditors: readonly ResourceEditorContribution[] = designs.map(design => ({
 ownershipPolicy:design.inspect ? 'controller' as const : design.kind.includes('EnvoyConfig') ? 'conditional' as const : 'declarative' as const,
 contractVersion:1,
 targets:[{group:'cilium.io',version:design.version,kind:design.kind,resource:design.resource,scope:design.namespaced ? 'Namespaced' : 'Cluster'}],
 intents:design.inspect ? ['inspect','edit'] : ['create','edit','inspect'],
 label:design.kind,
 sections:[{id:'network',label:design.inspect ? 'Observed state' : 'Network configuration'}],
 ownedPaths:design.inspect ? [] : design.fields.filter(field=>!design.kind.includes('EnvoyConfig') || !field.startsWith('resources.')).map(field => {
  const path=pathOf(field).filter((_part,index,parts) => index !== parts.length-1 || parts[index-1] !== 'matchLabels');
  const collection=path.findIndex(part => typeof part === 'number');
  return collection < 0 ? path : path.slice(0,collection);
 }),
 sensitivePaths:design.kind.includes('EnvoyConfig') ? [['spec','resources']] : [],
 component:CiliumForm,
 readOnly:(draft,context)=>isReadOnly(design,draft,context),
 formUnavailable:(_draft,context)=> {
  if (context.discovery.status !== 'available') return 'Cilium resource discovery is unavailable.';
  if (context.schema.status !== 'available') return 'Installed Cilium schema is unavailable. Preserve source.';
  return null;
 },
}));
