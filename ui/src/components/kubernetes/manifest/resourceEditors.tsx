import { createContext, useContext } from 'react';
import { RESOURCE_EDITOR_EXTENSION_POINT, matchesResourceEditor, type ExtensionPointSettings, type ResourceEditorContribution, type ResourceEditorContext, type ResourceEditorFormProps } from '@omniviewdev/runtime';
import WorkloadForm, { type WorkloadSection } from './WorkloadForm';
import ServiceForm from './ServiceForm';
import IngressForm from './IngressForm';
import ConfigMapForm from './ConfigMapForm';
import SecretForm from './SecretForm';
import PersistentVolumeClaimForm from './PersistentVolumeClaimForm';
import type { ResourceFormProps } from './ResourceFormFields';
import { inspectManifest } from './manifestDraft';

/** Private adapters retain mature native form behavior without exposing source to plugins. */
export const NativeResourceEditorContext = createContext<ResourceFormProps | null>(null);
function NativeResourceEditor(props: ResourceEditorFormProps) {
  const native = useContext(NativeResourceEditorContext);
  if (!native) throw new Error('Native editor requires its host session.');
  const formProps = { ...native, section: props.section, disabled: props.disabled };
  switch (props.context.kind) {
    case 'Service': return <ServiceForm {...formProps} />;
    case 'Ingress': return <IngressForm {...formProps} />;
    case 'ConfigMap': return <ConfigMapForm {...formProps} />;
    case 'Secret': return <SecretForm {...formProps} />;
    case 'PersistentVolumeClaim': return <PersistentVolumeClaimForm {...formProps} />;
    default: return <WorkloadForm {...formProps} section={props.section as WorkloadSection} />;
  }
}
const nativeKinds = [
  ['', 'v1', 'Pod', 'pods', ['basics', 'containers']],
  ['apps', 'v1', 'Deployment', 'deployments', ['basics', 'containers']],
  ['apps', 'v1', 'StatefulSet', 'statefulsets', ['basics', 'containers', 'storage']],
  ['', 'v1', 'Service', 'services', ['basics', 'ports', 'selector']],
  ['networking.k8s.io', 'v1', 'Ingress', 'ingresses', ['basics', 'routes', 'tls']],
  ['', 'v1', 'ConfigMap', 'configmaps', ['basics', 'entries']],
  ['', 'v1', 'Secret', 'secrets', ['basics', 'credentials']],
  ['', 'v1', 'PersistentVolumeClaim', 'persistentvolumeclaims', ['basics', 'storage']],
] as const;
const labels: Record<string, string> = { basics: 'Basics', containers: 'Containers', storage: 'Storage', ports: 'Ports', selector: 'Workload selector', routes: 'Routes', tls: 'TLS', entries: 'Entries', credentials: 'Credentials' };
export const builtinResourceEditors: readonly ResourceEditorContribution[] = nativeKinds.map(([group, version, kind, resource, sections]) => ({
  contractVersion: 1,
  ownershipPolicy: 'declarative',
  targets: [{ group, version, kind, resource, scope: 'Namespaced' }],
  intents: ['create', 'edit', 'inspect'], label: kind,
  sections: sections.map((id) => ({ id, label: labels[id] })),
  ownedPaths: [['spec'], ['data'], ['binaryData'], ['stringData'], ['type'], ['immutable'], ['metadata', 'labels'], ['metadata', 'annotations']],
  sensitivePaths: kind === 'Secret' ? [['data'], ['stringData'], ['metadata', 'annotations']] : undefined,
  component: NativeResourceEditor,
}));
export const resourceEditorExtensionPoint: ExtensionPointSettings<ResourceEditorContext, ResourceEditorContribution> = {
  id: RESOURCE_EDITOR_EXTENSION_POINT, mode: 'multiple', matcher: (contribution, context) => !!context && matchesResourceEditor(contribution.value, context),
};
export function isNativeResourceEditor(contribution: ResourceEditorContribution) { return contribution.component === NativeResourceEditor; }
export function nativeFormUnavailable(source: string, resourceKey: string) {
  const draft = inspectManifest(source, resourceKey);
  return draft.error ?? draft.formError;
}
