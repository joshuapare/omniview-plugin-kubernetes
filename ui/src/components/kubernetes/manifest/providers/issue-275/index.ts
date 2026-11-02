import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { REVIEW_PROTOCOL, TOKEN_PROTOCOL, unsupported, validateRequest } from './authentication';

const TokenReviewForm = lazy(() => import('./TokenReviewForm'));
const SelfSubjectReviewForm = lazy(() => import('./SelfSubjectReviewForm'));
const TokenRequestForm = lazy(() => import('./TokenRequestForm'));

/** POST-only authentication interfaces. No generic resource CRUD route is admitted. */
export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    targets: [{ group: 'authentication.k8s.io', version: 'v1', kind: 'TokenReview', resource: 'tokenreviews', scope: 'Cluster' }],
    intents: ['action'], label: 'Review a bearer token', sections: [{ id: 'request', label: 'Token review' }],
    ownedPaths: [['spec', 'token'], ['spec', 'audiences']],
    sensitivePaths: [['spec', 'token'], ['status', 'user'], ['status', 'error']],
    requirements: { actions: [REVIEW_PROTOCOL] }, component: TokenReviewForm,
    validate: validateRequest, formUnavailable: draft => unsupported(draft, 'TokenReview'),
    request: { protocol: REVIEW_PROTOCOL, source: 'canonical' },
  },
  {
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    targets: [{ group: 'authentication.k8s.io', version: 'v1', kind: 'SelfSubjectReview', resource: 'selfsubjectreviews', scope: 'Cluster' }],
    intents: ['action'], label: 'Inspect current identity', sections: [{ id: 'request', label: 'Current identity' }],
    ownedPaths: [], sensitivePaths: [['status', 'userInfo']],
    requirements: { actions: [REVIEW_PROTOCOL] }, component: SelfSubjectReviewForm,
    validate: validateRequest, formUnavailable: draft => unsupported(draft, 'SelfSubjectReview'),
    request: { protocol: REVIEW_PROTOCOL, source: 'canonical' },
  },
  {
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    targets: [{ group: 'authentication.k8s.io', version: 'v1', kind: 'TokenRequest', resource: 'serviceaccounts/token', scope: 'Namespaced' }],
    intents: ['action'], label: 'Request a ServiceAccount token', sections: [{ id: 'request', label: 'Token request' }],
    ownedPaths: [['spec', 'audiences'], ['spec', 'expirationSeconds'], ['spec', 'boundObjectRef']],
    sensitivePaths: [['status', 'token']], requirements: { actions: [TOKEN_PROTOCOL] }, component: TokenRequestForm,
    validate: validateRequest, formUnavailable: draft => unsupported(draft, 'TokenRequest'),
    request: { protocol: TOKEN_PROTOCOL, source: 'canonical' },
  },
];
