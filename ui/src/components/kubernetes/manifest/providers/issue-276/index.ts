import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { isRules, REVIEW_PROTOCOL, suppliedIdentity, targets, unavailable, validateReview } from './model';

const forms = [
  lazy(() => import('./AuthorizationReviewForm').then(module => ({ default: module.SubjectAccessReviewForm }))),
  lazy(() => import('./AuthorizationReviewForm').then(module => ({ default: module.LocalSubjectAccessReviewForm }))),
  lazy(() => import('./AuthorizationReviewForm').then(module => ({ default: module.SelfSubjectAccessReviewForm }))),
  lazy(() => import('./AuthorizationReviewForm').then(module => ({ default: module.SelfSubjectRulesReviewForm }))),
];

/** Native POST-only review tools. Never registered as persisted resource create/edit forms. */
export const resourceEditors: readonly ResourceEditorContribution[] = targets.map((target, index) => ({
  contractVersion: 1,
  targets: [target],
  intents: ['action', 'inspect'],
  label: target.kind,
  sections: [{ id: 'request', label: isRules(target.kind) ? 'Evaluate rules' : 'Access check' }, { id: 'response', label: isRules(target.kind) ? 'Effective rules' : 'Decision' }],
  ownedPaths: isRules(target.kind) ? [['spec', 'namespace']] : [
    ['spec', 'resourceAttributes'], ['spec', 'nonResourceAttributes'],
    ...(suppliedIdentity(target.kind) ? [['spec', 'user'], ['spec', 'uid'], ['spec', 'groups'], ['spec', 'extra']] : []),
  ],
  sensitivePaths: suppliedIdentity(target.kind) ? [['spec', 'user'], ['spec', 'uid'], ['spec', 'groups', '*'], ['spec', 'extra', '*', '*']] : [],
  requirements: { capabilities: ['create'], actions: [REVIEW_PROTOCOL] },
  ownershipPolicy: 'declarative',
  component: forms[index],
  validate: validateReview,
  formUnavailable: unavailable,
  readOnly: (_draft, context) => context.intent === 'inspect',
  request: { protocol: REVIEW_PROTOCOL, source: 'canonical' },
}));
