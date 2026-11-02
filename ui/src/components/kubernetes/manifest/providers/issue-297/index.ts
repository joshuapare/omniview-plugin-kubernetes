import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';

const OrderInspector = lazy(() => import('./inspectors').then(module => ({ default: module.OrderInspector })));
const ChallengeInspector = lazy(() => import('./inspectors').then(module => ({ default: module.ChallengeInspector })));

export const resourceEditors: readonly ResourceEditorContribution[] = [
  { kind: 'Order', resource: 'orders', component: OrderInspector },
  { kind: 'Challenge', resource: 'challenges', component: ChallengeInspector },
].map(({ kind, resource, component }): ResourceEditorContribution => ({
  contractVersion: 1,
  ownershipPolicy: 'controller',
  targets: [{ group: 'acme.cert-manager.io', version: 'v1', kind, resource, scope: 'Namespaced' }],
  intents: ['inspect', 'edit'],
  label: `${kind} lifecycle`,
  sections: [{ id: 'overview', label: 'Lifecycle' }, { id: 'details', label: kind === 'Order' ? 'Authorizations' : 'Solver' }],
  ownedPaths: [],
  sensitivePaths: [
    ['metadata', 'annotations'], ['spec', 'request'], ['spec', 'token'], ['spec', 'key'],
    ['spec', 'solver', 'dns01', '*'], ['spec', 'solver', 'http01', 'ingress', 'podTemplate'],
    ['spec', 'solver', 'http01', 'ingress', 'ingressTemplate'],
    ['spec', 'solver', 'http01', 'gatewayHTTPRoute', 'podTemplate'],
    ['spec', 'url'], ['spec', 'authorizationURL'],
    ['status', 'certificate'], ['status', 'reason'], ['status', 'url'], ['status', 'finalizeURL'],
    ['status', 'authorizations', '*', 'url'],
    ['status', 'authorizations', '*', 'challenges', '*', 'url'],
    ['status', 'authorizations', '*', 'challenges', '*', 'token'],
  ],
  component,
  readOnly: () => true,
  formUnavailable: (_draft, context) => context.intent === 'create' ? 'ACME lifecycle records are controller-created.' : null,
}));
