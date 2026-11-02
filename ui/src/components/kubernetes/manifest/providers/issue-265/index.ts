import { lazy } from 'react';
import type { ResourceEditorContribution, ResourceEditorPath } from '@omniviewdev/runtime';
import { alternativePVSources, coreReadOnly, coreUnavailable, validateCore, validateEndpointsSubmission } from './domain';

const NamespaceForm = lazy(() => import('./NamespaceForm'));
const ServiceAccountForm = lazy(() => import('./ServiceAccountForm'));
const ResourceQuotaForm = lazy(() => import('./ResourceQuotaForm'));
const LimitRangeForm = lazy(() => import('./LimitRangeForm'));
const PodTemplateForm = lazy(() => import('./WorkloadFields').then(module => ({ default: module.PodTemplateForm })));
const PersistentVolumeForm = lazy(() => import('./PersistentVolumeForm'));
const ReplicationControllerForm = lazy(() => import('./WorkloadFields').then(module => ({ default: module.ReplicationControllerForm })));
const EndpointsForm = lazy(() => import('./EndpointsForm'));
const NodeForm = lazy(() => import('./InspectionForms').then(module => ({ default: module.NodeForm })));
const EventForm = lazy(() => import('./InspectionForms').then(module => ({ default: module.EventForm })));
const ComponentStatusForm = lazy(() => import('./InspectionForms').then(module => ({ default: module.ComponentStatusForm })));

const target = (kind: string, resource: string, scope: 'Cluster' | 'Namespaced') => [{ group: '', version: 'v1', kind, resource, scope }] as const;
const sections = [{ id: 'configuration', label: 'Configuration' }];
const authoring = ['create', 'edit', 'inspect'] as const;
const base = { contractVersion: 1 as const, sections, intents: authoring, ownershipPolicy: 'declarative' as const, validate: validateCore, readOnly: coreReadOnly, formUnavailable: coreUnavailable, sensitivePaths: [['metadata','annotations','*']] };
const templatePaths = (root: ResourceEditorPath): readonly ResourceEditorPath[] => [[...root, 'metadata', 'labels'], [...root, 'spec', 'containers'], [...root, 'spec', 'serviceAccountName'], [...root, 'spec', 'nodeSelector'], [...root, 'spec', 'automountServiceAccountToken']];
const templateSensitive = (root: ResourceEditorPath): readonly ResourceEditorPath[] => [['metadata','annotations','*'], [...root, 'spec', 'containers', '*', 'env', '*', 'value'], [...root, 'spec', 'containers', '*', 'command'], [...root, 'spec', 'containers', '*', 'args'], [...root, 'spec', 'initContainers', '*', 'env', '*', 'value'], [...root, 'metadata', 'annotations','*']];

/** Exact native v1 targets only. Existing Pod/Service/ConfigMap/Secret/PVC forms stay untouched. */
export const resourceEditors: readonly ResourceEditorContribution[] = [
  { ...base, label: 'Namespace', targets: target('Namespace', 'namespaces', 'Cluster'), component: NamespaceForm,
    ownedPaths: ['enforce','warn','audit'].flatMap(mode => [['metadata','labels',`pod-security.kubernetes.io/${mode}`], ['metadata','labels',`pod-security.kubernetes.io/${mode}-version`]]).concat([['metadata','labels','environment']]) },
  { ...base, label: 'Service account', targets: target('ServiceAccount','serviceaccounts','Namespaced'), component: ServiceAccountForm,
    ownedPaths: [['automountServiceAccountToken'],['imagePullSecrets']] },
  { ...base, label: 'Resource quota', targets: target('ResourceQuota','resourcequotas','Namespaced'), component: ResourceQuotaForm,
    ownedPaths: [['spec','hard'],['spec','scopes'],['spec','scopeSelector']] },
  { ...base, label: 'Limit range', targets: target('LimitRange','limitranges','Namespaced'), component: LimitRangeForm,
    ownedPaths: [['spec','limits']] },
  { ...base, label: 'Pod template', targets: target('PodTemplate','podtemplates','Namespaced'), component: PodTemplateForm,
    ownedPaths: templatePaths(['template']), sensitivePaths: templateSensitive(['template']) },
  { ...base, ownershipPolicy: 'conditional', label: 'Static NFS persistent volume', targets: target('PersistentVolume','persistentvolumes','Cluster'), component: PersistentVolumeForm,
    ownedPaths: [['spec','capacity','storage'],['spec','storageClassName'],['spec','accessModes'],['spec','volumeMode'],['spec','persistentVolumeReclaimPolicy'],['spec','nfs'],['spec','mountOptions']],
    sensitivePaths: [['metadata','annotations','*'],['spec','csi','volumeAttributes'],['spec','flexVolume','options'],['spec','mountOptions','*']],
    formUnavailable: (draft, context) => {
      const unsupported = coreUnavailable(draft, context);
      if (unsupported) return unsupported;
      return alternativePVSources.some(key => draft.has(['spec',key])) || context.intent !== 'create' && !draft.has(['spec','nfs']) ? 'This guided form supports static NFS only. The existing volume source stays unchanged in YAML.' : null;
    } },
  { ...base, ownershipPolicy: 'conditional', label: 'Legacy replication controller', targets: target('ReplicationController','replicationcontrollers','Namespaced'), component: ReplicationControllerForm,
    ownedPaths: [['spec','replicas'],['spec','selector'],...templatePaths(['spec','template'])], sensitivePaths: templateSensitive(['spec','template']) },
  { ...base, ownershipPolicy: 'conditional', label: 'Manual endpoints', targets: target('Endpoints','endpoints','Namespaced'), component: EndpointsForm, validateSubmission: validateEndpointsSubmission,
    ownedPaths: [['subsets']] },
  { contractVersion: 1, ownershipPolicy: 'system', label: 'Node inspection', targets: target('Node','nodes','Cluster'), intents: ['inspect'], sections, ownedPaths: [], readOnly: () => true, component: NodeForm,
    sensitivePaths: [['status','conditions','*','message'],['spec','configSource']] },
  { contractVersion: 1, ownershipPolicy: 'controller', label: 'Event inspection', targets: target('Event','events','Namespaced'), intents: ['inspect'], sections, ownedPaths: [], readOnly: () => true, component: EventForm,
    sensitivePaths: [['message']] },
  { contractVersion: 1, ownershipPolicy: 'system', label: 'Component status inspection', targets: target('ComponentStatus','componentstatuses','Cluster'), intents: ['inspect'], sections, ownedPaths: [], readOnly: () => true, component: ComponentStatusForm,
    sensitivePaths: [['conditions','*','message'],['conditions','*','error']] },
];
