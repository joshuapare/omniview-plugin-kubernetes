import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { protectionReadOnly, validateProtection } from './policy';
const ProtectionForm = lazy(() => import('./ProtectionForm'));
export const resourceEditors: readonly ResourceEditorContribution[] = [
  { kind: 'Usage', resource: 'usages', scope: 'Namespaced' as const },
  { kind: 'ClusterUsage', resource: 'clusterusages', scope: 'Cluster' as const },
].map<ResourceEditorContribution>(target => ({
  contractVersion: 1,
  targets: [{ group: 'protection.crossplane.io', version: 'v1beta1', ...target }],
  intents: ['create', 'edit', 'inspect'],
  ownershipPolicy: 'conditional',
  label: `Crossplane ${target.kind}`,
  sections: [{ id: 'protection', label: 'Deletion protection' }],
  ownedPaths: [['spec', 'of'], ['spec', 'by'], ['spec', 'reason'], ['spec', 'replayDeletion']],
  component: ProtectionForm,
  readOnly: protectionReadOnly,
  validate: validateProtection,
  formUnavailable: draft => {
    const reason = draft.get(['spec', 'reason']);
    const replay = draft.get(['spec', 'replayDeletion']);
    if ((reason !== undefined && typeof reason !== 'string') || (replay !== undefined && typeof replay !== 'boolean')) return 'Unsupported protection scalar types require source.';
    for (const side of ['of', 'by']) {
      const node = draft.get(['spec', side]);
      if (node && typeof node === 'object' && Object.keys(node).some(key => !['apiVersion', 'kind', 'resourceRef', 'resourceSelector'].includes(key))) return 'Extended relationship shape requires source to preserve unknown fields.';
      for (const key of ['apiVersion', 'kind']) {
        const value = draft.get(['spec', side, key]);
        if (value !== undefined && typeof value !== 'string') return 'Non-text resource identity requires source.';
      }
      if (node !== undefined && (!node || typeof node !== 'object' || Array.isArray(node))) return 'Unsupported relationship shape. Use source without replacing it.';
      for (const branch of ['resourceRef', 'resourceSelector']) {
        const value = draft.get(['spec', side, branch]);
        if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) return 'Unsupported target shape. Use source without replacing it.';
        for (const key of ['name', 'namespace']) {
          const scalar = draft.get(['spec', side, branch, key]);
          if (scalar !== undefined && typeof scalar !== 'string') return 'Non-text reference fields require source.';
        }
        const labels = draft.get(['spec', side, branch, 'matchLabels']);
        if (labels !== undefined && (!labels || typeof labels !== 'object' || Array.isArray(labels) || Object.values(labels).some(value => typeof value !== 'string'))) return 'Unsupported selector labels require source.';
        const match = draft.get(['spec', side, branch, 'matchControllerRef']);
        if (match !== undefined && typeof match !== 'boolean') return 'Non-boolean controller matching requires source.';
        if (value && typeof value === 'object' && Object.keys(value).some(key => !(branch === 'resourceRef' ? ['name', 'namespace'] : ['matchLabels', 'matchControllerRef', 'namespace']).includes(key))) return 'Extended target shape requires source to preserve unknown fields.';
      }
    }
    return null;
  },
}));
