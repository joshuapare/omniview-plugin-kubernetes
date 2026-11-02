import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { controlled, object, rows, validateCRD } from './model';

const CustomResourceDefinitionEditor = lazy(() => import('./CustomResourceDefinitionEditor'));

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  ownershipPolicy: 'declarative',
  targets: [{ group: 'apiextensions.k8s.io', version: 'v1', kind: 'CustomResourceDefinition', resource: 'customresourcedefinitions', scope: 'Cluster' }],
  intents: ['create', 'edit', 'inspect'],
  label: 'Custom resource definition',
  sections: [
    { id: 'names', label: 'Names & scope' },
    { id: 'versions', label: 'Versions & schema' },
    { id: 'conversion', label: 'Conversion' },
    { id: 'subresources', label: 'Status & scale' },
    { id: 'columns', label: 'Columns & selectors' },
    { id: 'status', label: 'Status & ownership' },
    { id: 'review', label: 'Review' },
  ],
  ownedPaths: [
    ['spec', 'group'], ['spec', 'names'], ['spec', 'scope'],
    ['spec', 'versions'], ['spec', 'conversion'],
  ],
  sensitivePaths: [['spec', 'conversion', 'webhook', 'clientConfig', 'caBundle'], ['metadata', 'annotations']],
  component: CustomResourceDefinitionEditor,
  validate: validateCRD,
  readOnly: (draft, context) => controlled(draft) || context.ownership?.status === 'controller' || context.ownership?.status === 'system'
    || context.intent === 'create' && context.capabilities.create !== 'available'
    || context.intent === 'edit' && context.capabilities.update !== 'available',
  formUnavailable: (draft, context) => {
    if (context.group !== 'apiextensions.k8s.io' || context.version !== 'v1' || context.kind !== 'CustomResourceDefinition' || context.resource !== 'customresourcedefinitions' || context.scope !== 'Cluster') return 'This form supports only cluster-scoped apiextensions.k8s.io/v1 CustomResourceDefinition.';
    if (context.discovery.status !== 'available') return 'CRD discovery is not available.';
    if (context.schema.status !== 'available') return 'Installed CRD schema is not available. Source remains intact.';
    if (draft.has(['spec']) && !object(draft.get(['spec']))) return 'Unsupported CRD spec shape. Source remains intact.';
    if (draft.has(['spec', 'names']) && !object(draft.get(['spec', 'names']))) return 'Unsupported discovery names. Source remains intact.';
    for (const field of ['group', 'scope']) if (draft.has(['spec', field]) && typeof draft.get(['spec', field]) !== 'string') return 'Unsupported CRD field type. Source remains intact.';
    for (const field of ['plural', 'kind', 'singular', 'listKind']) if (draft.has(['spec', 'names', field]) && typeof draft.get(['spec', 'names', field]) !== 'string') return 'Unsupported discovery name type. Source remains intact.';
    for (const field of ['shortNames', 'categories']) {
      const value = draft.get(['spec', 'names', field]);
      if (value !== undefined && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) return 'Unsupported discovery name list. Source remains intact.';
    }
    if (draft.get(['spec', 'preserveUnknownFields']) === true) return 'Legacy preserveUnknownFields requires source review; v1 structural schemas use per-schema preservation.';
    if (draft.has(['spec', 'versions']) && !Array.isArray(draft.get(['spec', 'versions']))) return 'Versions require a sequence. Source remains intact.';
    if (rows(draft.get(['spec', 'versions'])).some(version => !object(version))) return 'Unsupported version entry. Source remains intact.';
    for (const version of rows(draft.get(['spec', 'versions']))) {
      const row = object(version)!;
      for (const field of ['name', 'deprecationWarning']) if (row[field] !== undefined && typeof row[field] !== 'string') return 'Unsupported version field type. Source remains intact.';
      for (const field of ['served', 'storage', 'deprecated']) if (row[field] !== undefined && typeof row[field] !== 'boolean') return 'Unsupported version flag. Source remains intact.';
      for (const field of ['schema', 'subresources']) if (row[field] !== undefined && !object(row[field])) return 'Unsupported version configuration. Source remains intact.';
      for (const field of ['additionalPrinterColumns', 'selectableFields']) if (row[field] !== undefined && (!Array.isArray(row[field]) || rows(row[field]).some(item => !object(item)))) return 'Unsupported version table. Source remains intact.';
    }
    const strategy = draft.get(['spec', 'conversion', 'strategy']);
    if (strategy !== undefined && strategy !== 'None' && strategy !== 'Webhook') return 'Unsupported conversion strategy. Source remains intact.';
    return null;
  },
}];
