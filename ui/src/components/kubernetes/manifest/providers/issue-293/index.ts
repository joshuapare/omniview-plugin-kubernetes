import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { group, version, protocol, queryInput, validateQuery } from './model';

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: [{ group, version, kind: 'ExternalMetricValue', resource: '', scope: 'Namespaced' }],
  intents: ['action', 'inspect'],
  label: 'External metrics query',
  sections: [{ id: 'query', label: 'Query' }, { id: 'values', label: 'Values' }],
  ownedPaths: [['query', 'namespace'], ['query', 'metric'], ['query', 'labelSelector']],
  component: lazy(() => import('./ExternalMetricQuery')),
  validate: (draft, context) => context.intent === 'action' ? validateQuery(draft, context) : [],
  readOnly: (_draft, context) => context.intent === 'inspect',
  request: { protocol, buildInput: queryInput },
}];
