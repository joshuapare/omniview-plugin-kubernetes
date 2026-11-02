/// <reference types="@welldone-software/why-did-you-render" />
import {
  PluginWindow,
  type DrawerContext,
  type DrawerComponent,
  type DrawerFactory,
  type ExtensionRegistration,
  type ExtensionPointSettings,
  type ResourceEditorContribution,
  type HomepageCardMeta,
  type SearchRouteHandleV1,
} from '@omniviewdev/runtime';
import React from 'react';
import { SiKubernetes } from 'react-icons/si';
import { RouteObject } from 'react-router';

import { PLUGIN_ID } from '@/pluginId';

import ChartSidebar from './components/helm/charts/ChartSidebar';
import HelmChartTable from './components/helm/charts/Table';
import ReleaseSidebar from './components/helm/releases/ReleaseSidebar';
import HelmReleaseTable from './components/helm/releases/Table';
import RepoSidebar from './components/helm/repos/RepoSidebar';
import HelmRepoTable from './components/helm/repos/Table';
import KubernetesHomepageCard from './components/homepage/KubernetesHomepageCard';
import { resourceDrawerActions } from './components/kubernetes/drawerActions';
import NodeSidebar from './components/kubernetes/sidebar/NodeSidebar';
import PodSidebar from './components/kubernetes/sidebar/Pod';
import SecretSidebar from './components/kubernetes/sidebar/SecretSidebar';
import MutatingWebhookConfigurationSidebar from './components/kubernetes/table/admissionregistrationv1/MutatingWebhookConfiguration/Sidebar';
import MutatingWebhookConfigurationTable from './components/kubernetes/table/admissionregistrationv1/MutatingWebhookConfiguration/Table';
import ValidatingAdmissionPolicySidebar from './components/kubernetes/table/admissionregistrationv1/ValidatingAdmissionPolicy/Sidebar';
import ValidatingAdmissionPolicyTable from './components/kubernetes/table/admissionregistrationv1/ValidatingAdmissionPolicy/Table';
import ValidatingAdmissionPolicyBindingSidebar from './components/kubernetes/table/admissionregistrationv1/ValidatingAdmissionPolicyBinding/Sidebar';
import ValidatingAdmissionPolicyBindingTable from './components/kubernetes/table/admissionregistrationv1/ValidatingAdmissionPolicyBinding/Table';
import ValidatingWebhookConfigurationSidebar from './components/kubernetes/table/admissionregistrationv1/ValidatingWebhookConfiguration/Sidebar';
import ValidatingWebhookConfigurationTable from './components/kubernetes/table/admissionregistrationv1/ValidatingWebhookConfiguration/Table';
import DaemonSetSidebar from './components/kubernetes/table/appsv1/DaemonSet/Sidebar';
import DaemonSetTable from './components/kubernetes/table/appsv1/DaemonSet/Table';
import DeploymentSidebar from './components/kubernetes/table/appsv1/Deployment/Sidebar';
import DeploymentTable from './components/kubernetes/table/appsv1/Deployment/Table';
import ReplicaSetSidebar from './components/kubernetes/table/appsv1/ReplicaSet/Sidebar';
import ReplicaSetTable from './components/kubernetes/table/appsv1/ReplicaSet/Table';
import StatefulSetSidebar from './components/kubernetes/table/appsv1/StatefulSet/Sidebar';
import StatefulSetTable from './components/kubernetes/table/appsv1/StatefulSet/Table';
import HorizontalPodAutoscalerSidebar from './components/kubernetes/table/autoscalingv1/HorizontalPodAutoscaler/Sidebar';
import HorizontalPodAutoscalerTable from './components/kubernetes/table/autoscalingv1/HorizontalPodAutoscaler/Table';
import CronJobSidebar from './components/kubernetes/table/batchv1/CronJob/Sidebar';
import CronJobTable from './components/kubernetes/table/batchv1/CronJob/Table';
import JobSidebar from './components/kubernetes/table/batchv1/Job/Sidebar';
import JobTable from './components/kubernetes/table/batchv1/Job/Table';
import LeaseSidebar from './components/kubernetes/table/coordinationv1/Lease/Sidebar';
import LeaseTable from './components/kubernetes/table/coordinationv1/Lease/Table';
import ComponentStatusSidebar from './components/kubernetes/table/corev1/ComponentStatus/Sidebar';
import ComponentStatusTable from './components/kubernetes/table/corev1/ComponentStatus/Table';
import ConfigMapSidebar from './components/kubernetes/table/corev1/ConfigMap/Sidebar';
import ConfigMapTable from './components/kubernetes/table/corev1/ConfigMap/Table';
import EndpointsSidebar from './components/kubernetes/table/corev1/Endpoints/Sidebar';
import EndpointsTable from './components/kubernetes/table/corev1/Endpoints/Table';
import EventSidebar from './components/kubernetes/table/corev1/Event/Sidebar';
import EventTable from './components/kubernetes/table/corev1/Event/Table';
import LimitRangeSidebar from './components/kubernetes/table/corev1/LimitRange/Sidebar';
import LimitRangeTable from './components/kubernetes/table/corev1/LimitRange/Table';
import NamespaceSidebar from './components/kubernetes/table/corev1/Namespace/Sidebar';
import NamespaceTable from './components/kubernetes/table/corev1/Namespace/Table';
import NodeTable from './components/kubernetes/table/corev1/Node/Table';
import PersistentVolumeSidebar from './components/kubernetes/table/corev1/PersistentVolume/Sidebar';
import PersistentVolumeTable from './components/kubernetes/table/corev1/PersistentVolume/Table';
import PersistentVolumeClaimSidebar from './components/kubernetes/table/corev1/PersistentVolumeClaim/Sidebar';
import PersistentVolumeClaimTable from './components/kubernetes/table/corev1/PersistentVolumeClaim/Table';
import PodTable from './components/kubernetes/table/corev1/Pod/Table';
import ReplicationControllerSidebar from './components/kubernetes/table/corev1/ReplicationController/Sidebar';
import ReplicationControllerTable from './components/kubernetes/table/corev1/ReplicationController/Table';
import ResourceQuotaSidebar from './components/kubernetes/table/corev1/ResourceQuota/Sidebar';
import ResourceQuotaTable from './components/kubernetes/table/corev1/ResourceQuota/Table';
import SecretTable from './components/kubernetes/table/corev1/Secret/Table';
import ServiceSidebar from './components/kubernetes/table/corev1/Service/Sidebar';
import ServiceTable from './components/kubernetes/table/corev1/Service/Table';
import ServiceAccountSidebar from './components/kubernetes/table/corev1/ServiceAccount/Sidebar';
import ServiceAccountTable from './components/kubernetes/table/corev1/ServiceAccount/Table';
import DefaultTable from './components/kubernetes/table/default/Table';
import EndpointSliceSidebar from './components/kubernetes/table/discoveryv1/EndpointSlice/Sidebar';
import EndpointSliceTable from './components/kubernetes/table/discoveryv1/EndpointSlice/Table';
import FlowSchemaSidebar from './components/kubernetes/table/flowcontrolv1/FlowSchema/Sidebar';
import FlowSchemaTable from './components/kubernetes/table/flowcontrolv1/FlowSchema/Table';
import PriorityLevelConfigurationSidebar from './components/kubernetes/table/flowcontrolv1/PriorityLevelConfiguration/Sidebar';
import PriorityLevelConfigurationTable from './components/kubernetes/table/flowcontrolv1/PriorityLevelConfiguration/Table';
import IngressSidebar from './components/kubernetes/table/networkingv1/Ingress/Sidebar';
import IngressTable from './components/kubernetes/table/networkingv1/Ingress/Table';
import IngressClassSidebar from './components/kubernetes/table/networkingv1/IngressClass/Sidebar';
import IngressClassTable from './components/kubernetes/table/networkingv1/IngressClass/Table';
import NetworkPolicySidebar from './components/kubernetes/table/networkingv1/NetworkPolicy/Sidebar';
import NetworkPolicyTable from './components/kubernetes/table/networkingv1/NetworkPolicy/Table';
import RuntimeClassSidebar from './components/kubernetes/table/nodev1/RuntimeClass/Sidebar';
import RuntimeClassTable from './components/kubernetes/table/nodev1/RuntimeClass/Table';
import PodDisruptionBudgetSidebar from './components/kubernetes/table/policyv1/PodDisruptionBudget/Sidebar';
import PodDisruptionBudgetTable from './components/kubernetes/table/policyv1/PodDisruptionBudget/Table';
import ClusterRoleSidebar from './components/kubernetes/table/rbacv1/ClusterRole/Sidebar';
import ClusterRoleTable from './components/kubernetes/table/rbacv1/ClusterRole/Table';
import ClusterRoleBindingSidebar from './components/kubernetes/table/rbacv1/ClusterRoleBinding/Sidebar';
import ClusterRoleBindingTable from './components/kubernetes/table/rbacv1/ClusterRoleBinding/Table';
import RoleSidebar from './components/kubernetes/table/rbacv1/Role/Sidebar';
import RoleTable from './components/kubernetes/table/rbacv1/Role/Table';
import RoleBindingSidebar from './components/kubernetes/table/rbacv1/RoleBinding/Sidebar';
import RoleBindingTable from './components/kubernetes/table/rbacv1/RoleBinding/Table';
import PriorityClassSidebar from './components/kubernetes/table/schedulingv1/PriorityClass/Sidebar';
import PriorityClassTable from './components/kubernetes/table/schedulingv1/PriorityClass/Table';
import CSIDriverSidebar from './components/kubernetes/table/storagev1/CSIDriver/Sidebar';
import CSIDriverTable from './components/kubernetes/table/storagev1/CSIDriver/Table';
import CSINodeSidebar from './components/kubernetes/table/storagev1/CSINode/Sidebar';
import CSINodeTable from './components/kubernetes/table/storagev1/CSINode/Table';
import CSIStorageCapacitySidebar from './components/kubernetes/table/storagev1/CSIStorageCapacity/Sidebar';
import CSIStorageCapacityTable from './components/kubernetes/table/storagev1/CSIStorageCapacity/Table';
import StorageClassSidebar from './components/kubernetes/table/storagev1/StorageClass/Sidebar';
import StorageClassTable from './components/kubernetes/table/storagev1/StorageClass/Table';
import VolumeAttachmentSidebar from './components/kubernetes/table/storagev1/VolumeAttachment/Sidebar';
import VolumeAttachmentTable from './components/kubernetes/table/storagev1/VolumeAttachment/Table';
import { createStandardViews } from './components/shared/sidebar/createDrawerViews';
import GenericResourceSidebar from './components/shared/sidebar/GenericResourceSidebar';
import { kubernetesResourceIconSet } from './icons/resourceIcons';
import ClusterEditPage from './pages/ClusterEditPage';
import ClusterResourcesRoute from './pages/ClusterResourcesRoute';
import ClustersPage from './pages/ClustersPage';
import ClusterDashboardPage from './pages/dashboard';
import ClusterDashboardBenchmarksPage from './pages/dashboard/benchmarks';
import ClusterDashboardExtensionPage from './pages/dashboard/extension';
import ClusterDashboardMetricsPage from './pages/dashboard/metrics';
import ClusterDashboardOverviewPage from './pages/dashboard/overview';
import ClusterExtensionPage, { CLUSTER_PAGE_EXTENSION_POINT_ID } from './pages/extension';
import { kubernetesSearchProvider } from './search/provider';
import { builtinResourceEditors, resourceEditorExtensionPoint } from './components/kubernetes/manifest/resourceEditors';
import { resourceEditors } from './components/kubernetes/manifest/providers';

const connectionSearchHandle: SearchRouteHandleV1 = {
  searchScope: ({ params }) => params.id
    ? { kind: 'connection', pluginId: PLUGIN_ID, connectionId: params.id, label: params.id }
    : undefined,
};

// @ts-expect-error Expose React to the plugin host window
window.PluginReact = React;

/**
 * Sidebar components keyed by opaque logical Type.
 * Canonical contributions give linked resources the same rich sidebar as tables.
 */
const sidebars: Record<string, React.FC<{ ctx: DrawerContext }>> = {
  // core.v1
  'k8s:/pods': PodSidebar,
  'k8s:/nodes': NodeSidebar,
  'k8s:/secrets': SecretSidebar,
  'k8s:/configmaps': ConfigMapSidebar,
  'k8s:/namespaces': NamespaceSidebar,
  'k8s:/services': ServiceSidebar,
  'k8s:/serviceaccounts': ServiceAccountSidebar,
  'k8s:/endpoints': EndpointsSidebar,
  'k8s:/replicationcontrollers': ReplicationControllerSidebar,
  'k8s:/persistentvolumes': PersistentVolumeSidebar,
  'k8s:/persistentvolumeclaims': PersistentVolumeClaimSidebar,
  'k8s:/limitranges': LimitRangeSidebar,
  'k8s:/resourcequotas': ResourceQuotaSidebar,
  'k8s:/componentstatuses': ComponentStatusSidebar,
  'k8s:/events': EventSidebar,
  // apps.v1
  'k8s:apps/replicasets': ReplicaSetSidebar,
  'k8s:apps/daemonsets': DaemonSetSidebar,
  'k8s:apps/deployments': DeploymentSidebar,
  'k8s:apps/statefulsets': StatefulSetSidebar,
  // batch.v1
  'k8s:batch/jobs': JobSidebar,
  'k8s:batch/cronjobs': CronJobSidebar,
  // autoscaling.v1
  'k8s:autoscaling/horizontalpodautoscalers': HorizontalPodAutoscalerSidebar,
  // policy.v1
  'k8s:policy/poddisruptionbudgets': PodDisruptionBudgetSidebar,
  // coordination.v1
  'k8s:coordination.k8s.io/leases': LeaseSidebar,
  // flowcontrol.v1
  'k8s:flowcontrol.apiserver.k8s.io/flowschemas': FlowSchemaSidebar,
  'k8s:flowcontrol.apiserver.k8s.io/prioritylevelconfigurations': PriorityLevelConfigurationSidebar,
  // rbac.v1
  'k8s:rbac.authorization.k8s.io/clusterroles': ClusterRoleSidebar,
  'k8s:rbac.authorization.k8s.io/clusterrolebindings': ClusterRoleBindingSidebar,
  'k8s:rbac.authorization.k8s.io/roles': RoleSidebar,
  'k8s:rbac.authorization.k8s.io/rolebindings': RoleBindingSidebar,
  // networking.v1
  'k8s:networking.k8s.io/networkpolicies': NetworkPolicySidebar,
  'k8s:networking.k8s.io/ingressclasses': IngressClassSidebar,
  'k8s:networking.k8s.io/ingresses': IngressSidebar,
  // discovery.v1
  'k8s:discovery.k8s.io/endpointslices': EndpointSliceSidebar,
  // scheduling.v1
  'k8s:scheduling.k8s.io/priorityclasses': PriorityClassSidebar,
  // node.v1
  'k8s:node.k8s.io/runtimeclasses': RuntimeClassSidebar,
  // storage.v1
  'k8s:storage.k8s.io/csidrivers': CSIDriverSidebar,
  'k8s:storage.k8s.io/csinodes': CSINodeSidebar,
  'k8s:storage.k8s.io/storageclasses': StorageClassSidebar,
  'k8s:storage.k8s.io/volumeattachments': VolumeAttachmentSidebar,
  'k8s:storage.k8s.io/csistoragecapacities': CSIStorageCapacitySidebar,
  // admissionregistration.v1
  'k8s:admissionregistration.k8s.io/mutatingwebhookconfigurations': MutatingWebhookConfigurationSidebar,
  'k8s:admissionregistration.k8s.io/validatingadmissionpolicies': ValidatingAdmissionPolicySidebar,
  'k8s:admissionregistration.k8s.io/validatingadmissionpolicybindings':
    ValidatingAdmissionPolicyBindingSidebar,
  'k8s:admissionregistration.k8s.io/validatingwebhookconfigurations':
    ValidatingWebhookConfigurationSidebar,
  // helm.v1
  'helm:releases': ReleaseSidebar,
  'helm:repositories': RepoSidebar,
  'helm:charts': ChartSidebar,
};

/**
 * Creates a DrawerFactory for a resource that has a sidebar component.
 * Produces a DrawerComponent with the standard view set (Overview, Metrics,
 * Events, Editor) and the resource's shared actions. Used by the host's drawer
 * registry so ref chip clicks render the same drawer as table row clicks.
 */
function createResourceDrawerFactory(
  resourceKey: string,
  SidebarComponent: React.FC<{ ctx: DrawerContext }>,
): DrawerFactory {
  const shared = resourceDrawerActions[resourceKey];
  return (_closeDrawer: () => void): DrawerComponent => ({
    title: resourceKey,
    views: createStandardViews({ SidebarComponent }),
    actions: shared?.actions ?? [],
  });
}

/**
 * Drawer factories keyed by opaque logical Type, contributed alongside sidebars
 * so linked-resource clicks render the full standard view set.
 */
const drawers: Record<string, DrawerFactory> = Object.fromEntries(
  Object.entries(sidebars).map(([key, Component]) => [
    key,
    createResourceDrawerFactory(key, Component),
  ]),
);

/**
 * Default drawer factory for CRDs and dynamic resources that don't have
 * a dedicated sidebar. Uses GenericResourceSidebar which extracts key
 * fields from the resource definition's column defs.
 */
export const defaultDrawerFactory: DrawerFactory =
  createResourceDrawerFactory('__default__', GenericResourceSidebar);

// React Router decodes incoming segments before matching, except encoded slashes.
// Static logical Types therefore retain ':' while protecting '/' as '%2F'.
export const routes: Array<RouteObject> = [
  {
    path: '/',
    Component: ClustersPage,
  },
  {
    path: '/clusters',
    Component: ClustersPage,
  },
  {
    path: '/cluster/:id',
    children: [
      {
        path: 'edit',
        Component: ClusterEditPage,
        handle: connectionSearchHandle,
      },
      {
        path: 'resources',
        Component: ClusterResourcesRoute,
        handle: connectionSearchHandle,
        children: [
          {
            path: '',
            Component: ClusterDashboardPage,
            children: [
              { path: '', index: true, Component: ClusterDashboardOverviewPage },
              { path: 'metrics', Component: ClusterDashboardMetricsPage },
              { path: 'benchmarks', Component: ClusterDashboardBenchmarksPage },
              { path: 'ext/:tabPath', Component: ClusterDashboardExtensionPage },
            ],
          },
          // Pages contributed by other plugins
          { path: 'page/:pagePath', Component: ClusterExtensionPage },
          { path: 'page/:pagePath/:subPath', Component: ClusterExtensionPage },
          // admissionregistration.v1
          {
            path: 'k8s:admissionregistration.k8s.io/mutatingwebhookconfigurations'.replaceAll('/', '%2F'),
            Component: MutatingWebhookConfigurationTable,
          },
          {
            path: 'k8s:admissionregistration.k8s.io/validatingadmissionpolicies'.replaceAll('/', '%2F'),
            Component: ValidatingAdmissionPolicyTable,
          },
          {
            path: 'k8s:admissionregistration.k8s.io/validatingadmissionpolicybindings'.replaceAll('/', '%2F'),
            Component: ValidatingAdmissionPolicyBindingTable,
          },
          {
            path: 'k8s:admissionregistration.k8s.io/validatingwebhookconfigurations'.replaceAll('/', '%2F'),
            Component: ValidatingWebhookConfigurationTable,
          },

          // apps.v1
          { path: 'k8s:apps/daemonsets'.replaceAll('/', '%2F'), Component: DaemonSetTable },
          { path: 'k8s:apps/deployments'.replaceAll('/', '%2F'), Component: DeploymentTable },
          { path: 'k8s:apps/replicasets'.replaceAll('/', '%2F'), Component: ReplicaSetTable },
          { path: 'k8s:apps/statefulsets'.replaceAll('/', '%2F'), Component: StatefulSetTable },

          // autoscaling.v1
          {
            path: 'k8s:autoscaling/horizontalpodautoscalers'.replaceAll('/', '%2F'),
            Component: HorizontalPodAutoscalerTable,
          },


          // batch.v1
          { path: 'k8s:batch/cronjobs'.replaceAll('/', '%2F'), Component: CronJobTable },
          { path: 'k8s:batch/jobs'.replaceAll('/', '%2F'), Component: JobTable },

          // core.v1
          { path: 'k8s:/componentstatuses'.replaceAll('/', '%2F'), Component: ComponentStatusTable },
          { path: 'k8s:/configmaps'.replaceAll('/', '%2F'), Component: ConfigMapTable },
          { path: 'k8s:/endpoints'.replaceAll('/', '%2F'), Component: EndpointsTable },
          { path: 'k8s:/events'.replaceAll('/', '%2F'), Component: EventTable },
          { path: 'k8s:/limitranges'.replaceAll('/', '%2F'), Component: LimitRangeTable },
          { path: 'k8s:/namespaces'.replaceAll('/', '%2F'), Component: NamespaceTable },
          { path: 'k8s:/nodes'.replaceAll('/', '%2F'), Component: NodeTable },
          { path: 'k8s:/persistentvolumes'.replaceAll('/', '%2F'), Component: PersistentVolumeTable },
          { path: 'k8s:/persistentvolumeclaims'.replaceAll('/', '%2F'), Component: PersistentVolumeClaimTable },
          { path: 'k8s:/pods'.replaceAll('/', '%2F'), Component: PodTable },
          { path: 'k8s:/resourcequotas'.replaceAll('/', '%2F'), Component: ResourceQuotaTable },
          { path: 'k8s:/secrets'.replaceAll('/', '%2F'), Component: SecretTable },
          { path: 'k8s:/services'.replaceAll('/', '%2F'), Component: ServiceTable },
          { path: 'k8s:/serviceaccounts'.replaceAll('/', '%2F'), Component: ServiceAccountTable },
          { path: 'k8s:/replicationcontrollers'.replaceAll('/', '%2F'), Component: ReplicationControllerTable },

          // coordination.v1
          { path: 'k8s:coordination.k8s.io/leases'.replaceAll('/', '%2F'), Component: LeaseTable },

          // discovery.v1
          { path: 'k8s:discovery.k8s.io/endpointslices'.replaceAll('/', '%2F'), Component: EndpointSliceTable },

          // flowcontrol.v1
          {
            path: 'k8s:flowcontrol.apiserver.k8s.io/prioritylevelconfigurations'.replaceAll('/', '%2F'),
            Component: PriorityLevelConfigurationTable,
          },
          { path: 'k8s:flowcontrol.apiserver.k8s.io/flowschemas'.replaceAll('/', '%2F'), Component: FlowSchemaTable },

          // networking.v1
          { path: 'k8s:networking.k8s.io/ingresses'.replaceAll('/', '%2F'), Component: IngressTable },
          { path: 'k8s:networking.k8s.io/ingressclasses'.replaceAll('/', '%2F'), Component: IngressClassTable },
          { path: 'k8s:networking.k8s.io/networkpolicies'.replaceAll('/', '%2F'), Component: NetworkPolicyTable },

          // node.v1
          { path: 'k8s:node.k8s.io/runtimeclasses'.replaceAll('/', '%2F'), Component: RuntimeClassTable },

          // policy.v1
          { path: 'k8s:policy/poddisruptionbudgets'.replaceAll('/', '%2F'), Component: PodDisruptionBudgetTable },

          // rbac.v1
          { path: 'k8s:rbac.authorization.k8s.io/clusterroles'.replaceAll('/', '%2F'), Component: ClusterRoleTable },
          { path: 'k8s:rbac.authorization.k8s.io/clusterrolebindings'.replaceAll('/', '%2F'), Component: ClusterRoleBindingTable },
          { path: 'k8s:rbac.authorization.k8s.io/roles'.replaceAll('/', '%2F'), Component: RoleTable },
          { path: 'k8s:rbac.authorization.k8s.io/rolebindings'.replaceAll('/', '%2F'), Component: RoleBindingTable },

          // scheduling.v1
          { path: 'k8s:scheduling.k8s.io/priorityclasses'.replaceAll('/', '%2F'), Component: PriorityClassTable },

          // storage.v1
          { path: 'k8s:storage.k8s.io/csidrivers'.replaceAll('/', '%2F'), Component: CSIDriverTable },
          { path: 'k8s:storage.k8s.io/csinodes'.replaceAll('/', '%2F'), Component: CSINodeTable },
          { path: 'k8s:storage.k8s.io/csistoragecapacities'.replaceAll('/', '%2F'), Component: CSIStorageCapacityTable },
          { path: 'k8s:storage.k8s.io/storageclasses'.replaceAll('/', '%2F'), Component: StorageClassTable },
          { path: 'k8s:storage.k8s.io/volumeattachments'.replaceAll('/', '%2F'), Component: VolumeAttachmentTable },

          // helm.v1
          { path: 'helm:releases'.replaceAll('/', '%2F'), Component: HelmReleaseTable },
          { path: 'helm:repositories'.replaceAll('/', '%2F'), Component: HelmRepoTable },
          { path: 'helm:charts'.replaceAll('/', '%2F'), Component: HelmChartTable },

          // Custom Resource Definitions / breaking api versions
          { path: ':resourceKey', Component: DefaultTable },
        ],
      },
    ],
  },
];

const resourceEditorRegistrations: ExtensionRegistration<ResourceEditorContribution>[] = [
  ...builtinResourceEditors,
  ...resourceEditors,
].map((editor) => {
  const target = editor.targets[0];
  return {
    extensionPointId: resourceEditorExtensionPoint.id,
    registration: {
      id: `resource-editor/${encodeURIComponent(target?.group ?? '')}/${target?.version}/${target?.kind}/${encodeURIComponent(target?.resource ?? '')}/${target?.scope}/${[...editor.intents].sort().join('+')}`,
      label: editor.label,
      value: editor,
    },
  };
});

export const extensionRegistrations: ExtensionRegistration[] = [
  ...resourceEditorRegistrations,
  ...Object.entries(sidebars).map(([resourceKey, Component]): ExtensionRegistration => ({
    extensionPointId: 'omniview/resource/sidebar/infopanel',
    registration: {
      id: `sidebar/${resourceKey}`,
      plugin: PLUGIN_ID,
      label: `Kubernetes sidebar for ${resourceKey}`,
      value: Component,
      meta: { pluginId: PLUGIN_ID, resourceKey },
    },
  })),
  ...Object.entries(drawers).map(([resourceKey, factory]): ExtensionRegistration => ({
    extensionPointId: 'omniview/resource/drawer',
    registration: {
      id: `drawer/${resourceKey}`,
      plugin: PLUGIN_ID,
      label: `Kubernetes drawer for ${resourceKey}`,
      value: factory,
      meta: { pluginId: PLUGIN_ID, resourceKey },
    },
  })),
  {
    extensionPointId: 'omniview/resource/icons',
    registration: {
      id: 'resource-icons',
      plugin: PLUGIN_ID,
      label: 'Kubernetes resource icons',
      value: kubernetesResourceIconSet,
    },
  },
  {
    extensionPointId: 'omniview/global-search',
    registration: {
      id: `${PLUGIN_ID}/global-search`,
      plugin: PLUGIN_ID,
      label: 'Kubernetes',
      value: kubernetesSearchProvider,
    },
  },
  {
    extensionPointId: 'omniview/home/card',
    registration: {
      id: `${PLUGIN_ID}/home/card`,
      plugin: PLUGIN_ID,
      label: 'Kubernetes',
      value: KubernetesHomepageCard,
      meta: {
        label: 'Kubernetes',
        description: 'Recent clusters, favorites, and folders',
        defaultConfig: { sections: ['connected', 'recent', 'favorites', 'folders'], maxItems: 5 },
        defaultWidth: 'medium',
        icon: SiKubernetes,
      } satisfies HomepageCardMeta,
    },
  },
];

export const plugin = new PluginWindow()
  .registerExtensionPoints([
    { id: CLUSTER_PAGE_EXTENSION_POINT_ID, mode: 'multiple' },
    // PluginWindow stores heterogeneous extension-point contexts through an erased collection.
    resourceEditorExtensionPoint as unknown as ExtensionPointSettings,
  ])
  .setRootPage(ClustersPage)
  .withRoutes(routes);
