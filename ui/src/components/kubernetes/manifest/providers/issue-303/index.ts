import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { definitions } from './definitions';
import { readOnly, unavailable, validate } from './policy';
const CalicoEditor = lazy(() => import('./CalicoEditor'));
export const resourceEditors: readonly ResourceEditorContribution[] = definitions.map(definition => ({
  contractVersion: 1,
  ownershipPolicy:['BlockAffinity','ClusterInformation'].includes(definition.kind)?'system':definition.kind==='Profile'?'conditional':'declarative',
  targets: [{ group:'projectcalico.org',version:'v3',kind:definition.kind,resource:definition.resource,scope:definition.scope }],
  intents: ['BlockAffinity','ClusterInformation'].includes(definition.kind)?['inspect']:['create','edit','inspect'],
  label: `Calico ${definition.kind}`,
  sections:[{id:'configuration',label:definition.title}],
  ownedPaths:['BlockAffinity','ClusterInformation'].includes(definition.kind)?[]:definition.fields.map(field=>['spec',...field.path.split('.')]),
  component:CalicoEditor,
  readOnly,
  validate,
  formUnavailable:unavailable,
}));
