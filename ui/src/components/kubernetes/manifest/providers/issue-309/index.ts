import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { fields, common, lists, validate, isReadOnly } from './domain';
const components = {
 GitRepository: lazy(() => import('./SourceEditors').then(module => ({ default: module.GitRepositoryEditor }))),
 OCIRepository: lazy(() => import('./SourceEditors').then(module => ({ default: module.OCIRepositoryEditor }))),
 Bucket: lazy(() => import('./SourceEditors').then(module => ({ default: module.BucketEditor }))),
 HelmRepository: lazy(() => import('./SourceEditors').then(module => ({ default: module.HelmRepositoryEditor }))),
 HelmChart: lazy(() => import('./SourceEditors').then(module => ({ default: module.HelmChartEditor }))),
 ExternalArtifact: lazy(() => import('./SourceEditors').then(module => ({ default: module.ExternalArtifactEditor })))
};
const plurals = { GitRepository: 'gitrepositories', OCIRepository: 'ocirepositories', Bucket: 'buckets', HelmRepository: 'helmrepositories', HelmChart: 'helmcharts', ExternalArtifact: 'externalartifacts' } as const;
export const resourceEditors: readonly ResourceEditorContribution[] = (Object.keys(plurals) as (keyof typeof plurals)[]).map(kind => ({
 contractVersion: 1,
 targets: [{ group: 'source.toolkit.fluxcd.io', version: 'v1', kind, resource: plurals[kind], scope: 'Namespaced' }],
 ownershipPolicy: kind === 'ExternalArtifact' ? 'controller' : kind === 'HelmChart' ? 'conditional' : 'declarative',
 intents: kind === 'ExternalArtifact' ? ['inspect'] : ['create', 'edit', 'inspect'],
 label: `Flux ${kind}`,
 sections: [{ id: 'source', label: kind === 'ExternalArtifact' ? 'Artifact provenance' : 'Source' }],
 ownedPaths: kind === 'ExternalArtifact' ? [] : [...fields[kind], ...common.filter(field => kind !== 'HelmChart' || !['spec.secretRef.name', 'spec.timeout'].includes(field.path)), ...(lists[kind] ?? [])].map(field => field.path.split('.')),
 component: components[kind], validate, readOnly: isReadOnly,
 formUnavailable: (draft, context) => context.discovery.status !== 'available' || context.schema.status !== 'available' ? 'Installed Flux v1 discovery and schema are required.' : kind === 'HelmChart' && context.intent === 'create' && isReadOnly(draft, context) ? 'Independent chart ownership must be established before authoring.' : null
}));
