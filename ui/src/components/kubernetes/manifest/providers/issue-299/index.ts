import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { unavailable, validate } from './model';
const AuthorizationPolicy = lazy(() => import('./policies').then(module => ({ default: module.AuthorizationPolicy })));
const PeerAuthentication = lazy(() => import('./policies').then(module => ({ default: module.PeerAuthentication })));
const RequestAuthentication = lazy(() => import('./policies').then(module => ({ default: module.RequestAuthentication })));
export const resourceEditors: readonly ResourceEditorContribution[] = [
  { kind: 'AuthorizationPolicy', resource: 'authorizationpolicies', component: AuthorizationPolicy, paths: ['selector', 'targetRefs', 'action', 'provider', 'rules'] },
  { kind: 'PeerAuthentication', resource: 'peerauthentications', component: PeerAuthentication, paths: ['selector', 'mtls', 'portLevelMtls'] },
  { kind: 'RequestAuthentication', resource: 'requestauthentications', component: RequestAuthentication, paths: ['selector', 'targetRefs', 'jwtRules'] },
].map<ResourceEditorContribution>(({ kind, resource, component, paths }) => ({
  contractVersion: 1, label: `Istio ${kind}`, component,
  ownershipPolicy: 'declarative',
  targets: ['v1', 'v1beta1'].map(version => ({ group: 'security.istio.io', version, kind, resource, scope: 'Namespaced' as const })),
  intents: ['create', 'edit', 'inspect'], sections: [{ id: 'policy', label: 'Policy' }],
  ownedPaths: paths.map(path => ['spec', path]), validate, formUnavailable: unavailable,
  readOnly: (_draft, context) => context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system',
}));
