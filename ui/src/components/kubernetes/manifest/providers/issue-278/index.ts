import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { group, isBinding, isMutating, isWebhook, managed, resources, unavailable, validateAdmission } from './model';

const WebhookEditor = lazy(() => import('./WebhookEditor'));
const PolicyEditor = lazy(() => import('./PolicyEditor'));
const BindingEditor = lazy(() => import('./BindingEditor'));

export const resourceEditors: readonly ResourceEditorContribution[] = resources.map<ResourceEditorContribution>(([kind, resource, version]) => ({
  contractVersion: 1,
  targets: [{ group, version, kind, resource, scope: 'Cluster' }],
  intents: ['create', 'edit', 'inspect'],
  label: kind,
  ownershipPolicy: 'declarative',
  sections: isWebhook(kind) ? [{ id: 'configuration', label: 'Webhook clients' }, { id: 'matching', label: 'Rules & conditions' }]
    : isBinding(kind) ? [{ id: 'binding', label: 'Policy & parameters' }, { id: 'matching', label: 'Matching intersection' }]
      : [{ id: 'logic', label: isMutating(kind) ? 'Mutations' : 'Validations' }, { id: 'matching', label: 'Rules & conditions' }, { id: 'advanced', label: 'Parameters & expressions' }, ...(!isMutating(kind) ? [{ id: 'status', label: 'Policy status' }] : [])],
  ownedPaths: isWebhook(kind) ? [['webhooks']] : [['spec']],
  sensitivePaths: isWebhook(kind) ? [['webhooks', '*', 'clientConfig', 'caBundle']] : [],
  component: isWebhook(kind) ? WebhookEditor : isBinding(kind) ? BindingEditor : PolicyEditor,
  validate: validateAdmission,
  formUnavailable: unavailable,
  readOnly: (draft, context) => context.intent === 'inspect' || managed(draft) || context.ownership?.status === 'controller' || context.ownership?.status === 'system',
}));
