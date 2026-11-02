import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { unsupportedShape, validateArtifact } from './domain';
export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  ownershipPolicy: 'declarative',
  targets: [{ group: 'source.extensions.fluxcd.io', version: 'v1beta1', kind: 'ArtifactGenerator', resource: 'artifactgenerators', scope: 'Namespaced' }],
  intents: ['create', 'edit', 'inspect'],
  label: 'Flux artifact composition',
  sections: [{ id: 'sources', label: 'Sources' }, { id: 'outputs', label: 'Outputs' }, { id: 'graph', label: 'Composition & inventory' }],
  ownedPaths: [['spec', 'sources'], ['spec', 'artifacts']],
  component: lazy(() => import('./ArtifactGeneratorForm')),
  validate: validateArtifact,
  formUnavailable: unsupportedShape,
  readOnly: (_draft, context) => context.intent === 'inspect' || context.ownership?.status !== 'application',
}];
