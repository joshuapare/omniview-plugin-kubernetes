import { lazy } from 'react';
import type { ResourceEditorContribution, ResourceEditorPath } from '@omniviewdev/runtime';
import { generators } from './schemas';
import { clusterBranches, clusterProblem, passwordIssues } from './policy';
import { requiredIssues } from './validation';

const GeneratorForm = lazy(() => import('./GeneratorForm'));
type Schema = { readonly [keyword: string]: unknown; properties?: Readonly<Record<string, Schema>>; items?: Schema };
function protectedPaths(schema: Schema, path: ResourceEditorPath): ResourceEditorPath[] {
  const result: ResourceEditorPath[] = [];
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    const next = [...path, key];
    if (/^(data|state|resource|body|headers|caBundle|parameters|tokenCode|password|token|clientSecret|url)$/i.test(key)) result.push(next);
    else result.push(...protectedPaths(child, next));
  }
  return result;
}

/** Optional External Secrets add-on contributions; discovery and admission remain authoritative. */
export const resourceEditors: readonly ResourceEditorContribution[] = generators.map(definition => ({
  contractVersion: 1,
  ownershipPolicy: definition.kind === 'GeneratorState' ? 'controller' : 'declarative',
  targets: [{ group: 'generators.external-secrets.io', version: definition.version, kind: definition.kind, resource: definition.file.slice('generators.external-secrets.io_'.length, -'.yaml'.length), scope: definition.scope }],
  intents: definition.kind === 'GeneratorState' ? ['inspect'] : ['create', 'edit', 'inspect'],
  label: `${definition.kind} · External Secrets`,
  sections: [{ id: 'configuration', label: definition.kind === 'GeneratorState' ? 'State inspection' : 'Generator configuration' }],
  ownedPaths: definition.kind === 'GeneratorState' ? [] : [['spec']],
  sensitivePaths: protectedPaths(definition.schema, ['spec']),
  component: GeneratorForm,
  readOnly: (_draft, context) => definition.kind === 'GeneratorState' || context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system',
  formUnavailable: draft => definition.kind === 'ClusterGenerator' ? clusterProblem(draft) : null,
  validate: draft => definition.kind === 'GeneratorState' ? [] : [
    ...requiredIssues(draft, definition.schema),
    ...(definition.kind === 'Password' ? passwordIssues(draft) : definition.kind === 'ClusterGenerator' && draft.get(['spec', 'kind']) === 'Password' ? passwordIssues(draft, ['spec', 'generator', clusterBranches.Password]) : []),
  ],
}));
