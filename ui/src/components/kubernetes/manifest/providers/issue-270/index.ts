import { lazy } from 'react';
import type { ResourceEditorContribution, ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { controllerOwned, DEFAULT_CLASS, unsupportedShape, validateNetworking } from './model';

const IngressClassForm = lazy(() => import('./IngressClassForm'));
const NetworkPolicyForm = lazy(() => import('./NetworkPolicyForm'));
const ServiceCIDRForm = lazy(() => import('./ServiceCIDRForm'));
const IPAddressForm = lazy(() => import('./IPAddressForm'));

function managedReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext) {
  const verb = context.intent === 'create' ? context.capabilities.create : context.capabilities.update;
  return context.intent === 'inspect' || verb !== 'available' || controllerOwned(draft) || context.intent !== 'create' && context.ownership?.status !== 'application';
}
const authoring = { contractVersion: 1 as const, intents: ['create', 'edit', 'inspect'] as const, validate: validateNetworking, formUnavailable: unsupportedShape, readOnly: managedReadOnly };
export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    ...authoring,
    targets: [{ group: 'networking.k8s.io', version: 'v1', kind: 'IngressClass', resource: 'ingressclasses', scope: 'Cluster' }],
    label: 'Ingress class',
    ownershipPolicy: 'declarative',
    sections: [{ id: 'controller', label: 'Controller' }, { id: 'parameters', label: 'Parameters' }],
    ownedPaths: [['spec', 'controller'], ['spec', 'parameters'], ['metadata', 'annotations', DEFAULT_CLASS]],
    component: IngressClassForm,
  },
  {
    ...authoring,
    targets: [{ group: 'networking.k8s.io', version: 'v1', kind: 'NetworkPolicy', resource: 'networkpolicies', scope: 'Namespaced' }],
    label: 'Network policy',
    ownershipPolicy: 'declarative',
    sections: [{ id: 'selection', label: 'Pod selection' }, { id: 'ingress', label: 'Incoming' }, { id: 'egress', label: 'Outgoing' }],
    ownedPaths: [['spec', 'podSelector'], ['spec', 'policyTypes'], ['spec', 'ingress'], ['spec', 'egress']],
    component: NetworkPolicyForm,
  },
  {
    ...authoring,
    targets: [
      { group: 'networking.k8s.io', version: 'v1', kind: 'ServiceCIDR', resource: 'servicecidrs', scope: 'Cluster' },
      { group: 'networking.k8s.io', version: 'v1beta1', kind: 'ServiceCIDR', resource: 'servicecidrs', scope: 'Cluster' },
    ],
    label: 'Service address ranges (administrator)',
    ownershipPolicy: 'conditional',
    sections: [{ id: 'ranges', label: 'Address ranges' }, { id: 'status', label: 'Status' }],
    ownedPaths: [['spec', 'cidrs']],
    component: ServiceCIDRForm,
  },
  {
    contractVersion: 1,
    targets: [
      { group: 'networking.k8s.io', version: 'v1', kind: 'IPAddress', resource: 'ipaddresses', scope: 'Cluster' },
      { group: 'networking.k8s.io', version: 'v1beta1', kind: 'IPAddress', resource: 'ipaddresses', scope: 'Cluster' },
    ],
    intents: ['inspect', 'edit'],
    label: 'IP allocation',
    ownershipPolicy: 'controller',
    sections: [{ id: 'allocation', label: 'Allocation and parent' }],
    ownedPaths: [],
    readOnly: () => true,
    component: IPAddressForm,
  },
];
