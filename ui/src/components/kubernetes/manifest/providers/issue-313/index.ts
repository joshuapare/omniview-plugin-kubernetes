import { lazy } from 'react';
import type { ResourceEditorContribution, ResourceEditorDraft, ResourceEditorContext } from '@omniviewdev/runtime';
import { readOnly, validate } from './model';
const component = lazy(() => import('./FluxImageForms'));
const paths: Record<string, string[][]> = {
  ImageRepository: ['image', 'interval', 'timeout', 'provider', 'serviceAccountName', 'suspend', 'insecure', 'exclusionList'].map(key => ['spec', key]).concat(['secretRef', 'certSecretRef', 'proxySecretRef'].map(key => ['spec', key, 'name'])),
  ImagePolicy: [['spec', 'imageRepositoryRef', 'name'], ['spec', 'imageRepositoryRef', 'namespace'], ...['semver', 'numerical', 'alphabetical'].map(key => ['spec', 'policy', key]), ...['pattern', 'extract'].map(key => ['spec', 'filterTags', key]), ...['digestReflectionPolicy', 'interval', 'suspend'].map(key => ['spec', key])],
  ImageUpdateAutomation: [...['name', 'namespace', 'kind', 'apiVersion'].map(key => ['spec', 'sourceRef', key]), ...['path', 'strategy'].map(key => ['spec', 'update', key]), ...['name', 'email'].map(key => ['spec', 'git', 'commit', 'author', key]), ['spec', 'git', 'commit', 'signingKey', 'secretRef', 'name'], ...['messageTemplate', 'messageTemplateValues'].map(key => ['spec', 'git', 'commit', key]), ...['branch', 'tag', 'semver', 'commit', 'name'].map(key => ['spec', 'git', 'checkout', 'ref', key]), ...['branch', 'refspec', 'options'].map(key => ['spec', 'git', 'push', key]), ['spec', 'policySelector', 'matchLabels'], ['spec', 'interval'], ['spec', 'suspend']],
};
function formUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.kind === 'ImageRepository') {
    const selectors = draft.get(['spec', 'accessFrom', 'namespaceSelectors']);
    if (selectors !== undefined && (!Array.isArray(selectors) || selectors.length > 1 || draft.has(['spec', 'accessFrom', 'namespaceSelectors', 0, 'matchExpressions']))) return 'Use YAML for advanced namespace selectors.';
    const exclusions = draft.get(['spec', 'exclusionList']);
    if (exclusions !== undefined && (!Array.isArray(exclusions) || exclusions.some(value => typeof value !== 'string'))) return 'Use YAML for unsupported tag exclusions.';
  }
  if (context.kind === 'ImageUpdateAutomation') {
    const kind = draft.get(['spec', 'sourceRef', 'kind']);
    if (kind !== undefined && kind !== 'GitRepository') return 'This editor supports GitRepository sources only.';
    if (draft.has(['spec', 'policySelector', 'matchExpressions'])) return 'Use YAML for policy selector expressions.';
    if (['branch', 'tag', 'semver', 'commit', 'name'].filter(key => draft.has(['spec', 'git', 'checkout', 'ref', key])).length > 1) return 'Use YAML to preserve combined checkout reference precedence.';
  }
  return null;
}
export const resourceEditors: readonly ResourceEditorContribution[] = [
  ['ImageRepository', 'imagerepositories'], ['ImagePolicy', 'imagepolicies'], ['ImageUpdateAutomation', 'imageupdateautomations'],
].map(([kind, resource]): ResourceEditorContribution => ({ contractVersion: 1, ownershipPolicy: 'declarative', targets: [{ group: 'image.toolkit.fluxcd.io', version: 'v1', kind, resource, scope: 'Namespaced' }], intents: ['create', 'edit', 'inspect'], label: `Flux ${kind}`, sections: [{ id: 'configuration', label: 'Configuration' }], ownedPaths: kind === 'ImageRepository' ? [...paths[kind], ['spec', 'accessFrom', 'namespaceSelectors', 0, 'matchLabels']] : paths[kind], component, readOnly, validate, formUnavailable }));
