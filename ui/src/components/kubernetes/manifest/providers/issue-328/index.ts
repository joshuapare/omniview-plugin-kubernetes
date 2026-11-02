import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { layout, resources, validatePolicy, validateMutationBranches } from './domain';
const PolicyEditor = lazy(() => import('./PolicyEditor'));
export const resourceEditors: readonly ResourceEditorContribution[] = resources.map(([kind, resource]) => ({
  contractVersion: 1,
  targets: [{ group: 'policies.kyverno.io', version: 'v1alpha1', kind, resource, scope: kind === 'PolicyException' ? 'Namespaced' : 'Cluster' }],
  intents: ['create', 'edit', 'inspect'],
  label: `Kyverno ${kind}`,
  ownershipPolicy: 'conditional',
  sections: [{ id: 'policy', label: 'Policy' }],
  ownedPaths: [...layout(kind).fields.map(field => field.path), ...layout(kind).rows.map(row => row.path)],
  sensitivePaths: kind === 'ImageValidatingPolicy' ? [['spec', 'credentials'], ['spec', 'attestors', '*', 'cosign', 'key'], ['spec', 'attestors', '*', 'cosign', 'certificate'], ['spec', 'attestors', '*', 'notary']] : [],
  component: PolicyEditor,
  validate: draft => [...validatePolicy(draft, kind), ...(kind === 'MutatingPolicy' ? validateMutationBranches(draft) : [])],
  formUnavailable: draft => {
    for (const row of layout(kind).rows) {
      const value = draft.get(row.path);
      if (value !== undefined && !Array.isArray(value)) return `${row.label} has an unsupported source shape. Use source mode.`;
    }
    if (kind === 'ImageValidatingPolicy') {
      const attestors = draft.get(['spec', 'attestors']);
      if (Array.isArray(attestors) && attestors.some((_, index) => ['key', 'certificate', 'notary'].some(branch => draft.has(['spec', 'attestors', index, ...(branch === 'notary' ? [branch] : ['cosign', branch])])))) return 'This trust branch requires source mode; keyless controls cannot replace it.';
    }
    return null;
  },
}));
