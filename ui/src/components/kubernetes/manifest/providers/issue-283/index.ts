import { lazy } from 'react';
import type { ResourceEditorContribution, ResourceEditorContext, ResourceEditorDraft, ResourceEditorPath, ResourceEditorTarget } from '@omniviewdev/runtime';
import { celError, claimReadOnly, claimRoot, claimUnsupported, record, rows, text, validateClaims, validateTaint, versions } from './model';

const DeviceClassForm = lazy(() => import('./DeviceClassForm'));
const ClaimsForm = lazy(() => import('./ClaimsForm'));
const DeviceTaintRuleForm = lazy(() => import('./DeviceTaintRuleForm'));
const ResourceSliceForm = lazy(() => import('./ResourceSliceForm'));
const target = (kind: string, resource: string, scope: 'Namespaced' | 'Cluster'): readonly ResourceEditorTarget[] => versions.map(version => ({ group: 'resource.k8s.io', version, kind, resource, scope }));
const controlled = (_draft: ResourceEditorDraft, context: ResourceEditorContext) => context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system';
function selectorsUnavailable(draft: ResourceEditorDraft, path: ResourceEditorPath): string | null {
  for (let index = 1; index < path.length; index++) { const value = draft.get(path.slice(0, index)); if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) return 'Unsupported selector container. Source remains unchanged.'; }
  if (!draft.has(path)) return null;
  if (!Array.isArray(draft.get(path))) return 'Unsupported selector shape. Source remains unchanged.';
  for (const value of rows(draft.get(path))) {
    const selector = record(value);
    if (!selector.cel || typeof selector.cel !== 'object' || Array.isArray(selector.cel) || typeof record(selector.cel).expression !== 'string' || Object.keys(selector).some(key => key !== 'cel')) return 'Unknown device selector. Use YAML without rewriting it.';
  }
  return null;
}
function claimsUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  const unsupported = claimUnsupported(draft, context); if (unsupported) return unsupported;
  const path = [...claimRoot(context.kind), 'requests'];
  for (const request of rows(draft.get(path))) {
    const data = record(request); const alternatives = rows(data.firstAvailable);
    const bodies = alternatives.length ? alternatives : [context.version === 'v1beta1' ? data : data.exactly];
    for (const body of bodies) {
      const selectors = record(body).selectors;
      if (selectors !== undefined && (!Array.isArray(selectors) || rows(selectors).some(value => !record(value).cel || typeof record(record(value).cel).expression !== 'string' || Object.keys(record(value)).some(key => key !== 'cel')))) return 'Unknown request selector. Source remains unchanged.';
    }
  }
  return null;
}
export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1, targets: target('DeviceClass', 'deviceclasses', 'Cluster'), intents: ['create', 'edit', 'inspect'], label: 'Device class',
    ownershipPolicy: 'declarative',
    sections: [{ id: 'selection', label: 'Selection' }, { id: 'advanced', label: 'Advanced' }],
    ownedPaths: [['spec', 'selectors'], ['spec', 'extendedResourceName']], sensitivePaths: [['metadata', 'annotations', '*'], ['spec', 'config', '*', 'opaque', 'parameters']],
    component: DeviceClassForm, readOnly: controlled, formUnavailable: draft => {
      const extended = draft.get(['spec', 'extendedResourceName']);
      return extended !== undefined && typeof extended !== 'string' ? 'Unsupported extended resource name scalar. Source remains unchanged.' : selectorsUnavailable(draft, ['spec', 'selectors']);
    },
    validate: draft => rows(draft.get(['spec', 'selectors'])).flatMap((value, index) => { const message = celError(text(record(record(value).cel).expression)); return message ? [{ path: ['spec', 'selectors', index, 'cel', 'expression'], message }] : []; }),
  },
  {
    contractVersion: 1, targets: target('ResourceClaimTemplate', 'resourceclaimtemplates', 'Namespaced'), intents: ['create', 'edit', 'inspect'], label: 'Claim template',
    ownershipPolicy: 'declarative',
    sections: [{ id: 'requests', label: 'Device requests' }, { id: 'advanced', label: 'Copied metadata & advanced' }],
    ownedPaths: [['spec', 'spec', 'devices', 'requests'], ['spec', 'metadata', 'labels']],
    sensitivePaths: [['metadata', 'annotations', '*'], ['spec', 'metadata', 'annotations', '*'], ['spec', 'spec', 'devices', 'config', '*', 'opaque', 'parameters']],
    component: ClaimsForm, readOnly: (draft, context) => claimReadOnly(draft, context) || controlled(draft, context), formUnavailable: claimsUnavailable, validate: validateClaims,
  },
  {
    contractVersion: 1, targets: target('ResourceClaim', 'resourceclaims', 'Namespaced'), intents: ['create', 'edit', 'inspect'], label: 'Resource claim',
    ownershipPolicy: 'conditional',
    sections: [{ id: 'requests', label: 'Device requests' }, { id: 'allocation', label: 'Ownership & allocation' }, { id: 'advanced', label: 'Advanced' }],
    ownedPaths: [['spec', 'devices', 'requests']], sensitivePaths: [['metadata', 'annotations', '*'], ['spec', 'devices', 'config', '*', 'opaque', 'parameters'], ['status', 'devices', '*', 'data']],
    component: ClaimsForm, readOnly: (draft, context) => claimReadOnly(draft, context) || controlled(draft, context), formUnavailable: claimsUnavailable, validate: validateClaims,
  },
  {
    contractVersion: 1, targets: [{ group: 'resource.k8s.io', version: 'v1alpha3', kind: 'DeviceTaintRule', resource: 'devicetaintrules', scope: 'Cluster' }],
    intents: ['create', 'edit', 'inspect'], label: 'Device taint rule', sections: [{ id: 'policy', label: 'Target & taint' }, { id: 'status', label: 'Eviction status' }],
    ownershipPolicy: 'declarative',
    ownedPaths: [['spec', 'deviceSelector'], ['spec', 'taint', 'key'], ['spec', 'taint', 'value'], ['spec', 'taint', 'effect']],
    sensitivePaths: [['metadata', 'annotations', '*']],
    component: DeviceTaintRuleForm,
    readOnly: (draft, context) => controlled(draft, context) || context.discovery.features.DRADeviceTaints !== 'available' || context.discovery.features.DRADeviceTaintRules !== 'available',
    validate: validateTaint,
    formUnavailable: draft => {
      for (const path of [['spec'], ['spec', 'taint']]) { const value = draft.get(path); if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) return 'Unsupported taint container. Source remains unchanged.'; }
      for (const field of ['key', 'value', 'effect']) { const value = draft.get(['spec', 'taint', field]); if (value !== undefined && typeof value !== 'string') return 'Unsupported taint scalar type. Source remains unchanged.'; }
      if (draft.has(['spec', 'deviceSelector'])) { const selector = draft.get(['spec', 'deviceSelector']); if (!selector || typeof selector !== 'object' || Array.isArray(selector) || Object.keys(record(selector)).some(key => !['driver', 'pool', 'device'].includes(key)) || Object.values(record(selector)).some(value => typeof value !== 'string')) return 'Unknown taint selector. Source remains unchanged.'; }
      const effect = draft.get(['spec', 'taint', 'effect']);
      return effect !== undefined && !['None', 'NoSchedule', 'NoExecute'].includes(text(effect)) ? 'Unknown taint effect. Source remains unchanged.' : null;
    },
  },
  {
    contractVersion: 1, targets: target('ResourceSlice', 'resourceslices', 'Cluster'), intents: ['create', 'edit', 'inspect'], label: 'Driver resource inventory',
    ownershipPolicy: 'controller',
    sections: [{ id: 'inventory', label: 'Pool & devices' }, { id: 'advanced', label: 'Shared counters' }], ownedPaths: [], sensitivePaths: [['metadata', 'annotations', '*']], component: ResourceSliceForm, readOnly: () => true,
  },
];
