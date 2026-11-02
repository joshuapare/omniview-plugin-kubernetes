import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { targets, validate } from './model';
const component = lazy(() => import('./ExperimentalGatewayForm'));
export const resourceEditors: readonly ResourceEditorContribution[] = targets.map(target => ({
  contractVersion: 1,
  ownershipPolicy: 'declarative' as const,
  targets: [target],
  intents: ['create', 'edit', 'inspect'],
  label: target.kind,
  sections: [{ id: 'configuration', label: target.kind === 'XMesh' ? 'Mesh controller' : target.kind === 'XListenerSet' ? 'Listeners' : 'Backend traffic' }],
  ownedPaths: target.kind === 'XMesh' ? [['spec', 'controllerName'], ['spec', 'description'], ['spec', 'parametersRef']] : target.kind === 'XListenerSet' ? [['spec', 'parentRef'], ['spec', 'listeners']] : [['spec', 'targetRefs'], ['spec', 'retryConstraint'], ['spec', 'sessionPersistence']],
  requirements: { schema: { paths: [['spec']] } },
  readOnly: (_draft, context) => context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system',
  validate,
  component,
}));
