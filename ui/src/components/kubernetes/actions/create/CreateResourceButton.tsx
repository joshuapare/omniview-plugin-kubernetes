import { Button } from '@omniviewdev/base-ui';
import { jsonToValue, useResourceMutations, useResourceTypes, useExtensionPointSnapshot, RESOURCE_EDITOR_EXTENSION_POINT, type ResourceEditorContribution, type ResourceEditorContext } from '@omniviewdev/runtime';
import { ResourceClient } from '@omniviewdev/runtime/api';
import React from 'react';
import { LuPlus } from 'react-icons/lu';
import { parse } from 'yaml';

import { PLUGIN_ID } from '@/pluginId';
import { resolveKubernetesReference } from '../../../../utils/kubernetesReference';
import { inspectManifest, patchManifest, type ManifestChange } from '../../manifest/manifestDraft';
import { catalogEditorContext } from '../../manifest/resourceEditorContext';
import { useCatalogEditorContext } from '../../manifest/useCatalogEditorContext';
import CreateResourceModal from './CreateResourceModal';
import { getTemplate, templateIdentity } from './templates';
import { validateEditorSource } from '../../manifest/resourceEditorSubmission';

interface Props {
  connectionID: string;
  resourceKey: string;
  selectedNamespaces?: string[];
}

const CreateResourceButton: React.FC<Props> = ({ connectionID, resourceKey, selectedNamespaces = [] }) => {
  const [open, setOpen] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isPreparing, setIsPreparing] = React.useState(false);
  const [template, setTemplate] = React.useState(getTemplate());
  const route = { connection: connectionID };
  const { resourceTypes } = useResourceTypes({ pluginID: PLUGIN_ID, route });
  const descriptor = resourceTypes.data?.find((entry) => entry.type === resourceKey);
  const label = descriptor?.displayName ?? resourceKey;
  const { mutate } = useResourceMutations({ pluginID: PLUGIN_ID });
  const editors = useExtensionPointSnapshot<ResourceEditorContribution, ResourceEditorContext>(RESOURCE_EDITOR_EXTENSION_POINT);
  const matches = editors.contributions.filter((entry) => entry.value.targets.some((target) => `k8s:${target.group}/${target.resource}` === resourceKey));
  const authorable = !matches.length || matches.some((entry) => entry.value.intents.includes('create') && entry.value.ownershipPolicy !== 'controller' && entry.value.ownershipPolicy !== 'system');
  const editorContext = useCatalogEditorContext(template, resourceKey, connectionID, 'create', descriptor);
  const preparation = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => preparation.current?.abort(), [connectionID, resourceKey]);

  const handleOpen = async () => {
    setIsPreparing(true);
    let nextTemplate = getTemplate();
    try {
      const representation = descriptor?.representations.find((entry) => entry.id === descriptor.defaultRepresentation);
      const binding = representation?.schema;
      if (binding?.documentRef) {
        const schema = await ResourceClient.GetSchemaDocument(PLUGIN_ID, route, binding.documentRef);
        const identity = templateIdentity(schema.document, binding.root,
          descriptor?.identityDimensions.some(({ name }) => name === 'namespace') ?? false);
        nextTemplate = getTemplate(identity);
        const draft = inspectManifest(nextTemplate, resourceKey);
        const changes: ManifestChange[] = [];
        if (identity?.namespaced) {
          changes.push({ path: ['metadata', 'namespace'], value: selectedNamespaces.length === 1 ? selectedNamespaces[0] : '' });
        }
        if (identity) changes.push({ path: ['metadata', 'name'], value: '' });
        if (draft.kind === 'Pod' || draft.kind === 'Deployment' || draft.kind === 'StatefulSet') {
          changes.push({ path: ['metadata', 'labels', 'app'], value: '' });
          const podPath = draft.kind === 'Pod' ? ['spec'] : ['spec', 'template', 'spec'];
          changes.push(
            { path: [...podPath, 'containers', 0, 'image'], value: '' },
            { path: [...podPath, 'containers', 0, 'ports'], remove: true },
          );
          if (draft.kind !== 'Pod') {
            changes.push(
              { path: ['spec', 'selector', 'matchLabels', 'app'], value: '' },
              { path: ['spec', 'template', 'metadata', 'labels', 'app'], value: '' },
            );
          }
          if (draft.kind === 'StatefulSet') changes.push({ path: ['spec', 'serviceName'], value: '' });
        }
        if (draft.kind === 'Service') changes.push({ path: ['spec', 'selector'], remove: true });
        if (draft.kind === 'Ingress') changes.push({ path: ['spec', 'rules'], remove: true });
        if (draft.kind === 'ConfigMap') changes.push({ path: ['data'], remove: true });
        if (draft.kind === 'Secret') changes.push(
          { path: ['data'], remove: true }, { path: ['stringData'], remove: true },
        );
        if (draft.kind === 'PersistentVolumeClaim') changes.push({ path: ['spec', 'resources', 'requests', 'storage'], remove: true });
        if (changes.length) nextTemplate = patchManifest(nextTemplate, changes);
      }
    } catch {
      // Schema discovery is optional. Full native manifests remain creatable.
    } finally {
      setTemplate(nextTemplate);
      setIsPreparing(false);
      setOpen(true);
    }
  };

  const handleCreate = async (yaml: string, isCurrent: () => boolean) => {
    setIsCreating(true);
    preparation.current?.abort();
    const preparing = new AbortController(); preparation.current = preparing;
    try {
      const parsed = parse(yaml, { intAsBigInt: true }) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('YAML must be a Kubernetes resource object');
      const sourceContext = catalogEditorContext(yaml, resourceKey, connectionID, 'create', descriptor);
      const admission = inspectManifest(template).document ? { ...sourceContext, group: editorContext.group, version: editorContext.version, kind: editorContext.kind } : sourceContext;
      const admissionError = validateEditorSource(yaml, admission);
      if (admissionError) throw new Error(admissionError);
      const metadata = parsed.metadata as Record<string, unknown> | undefined;
      if (typeof metadata?.name !== 'string' || !metadata.name) throw new Error('metadata.name is required');
      if (metadata.namespace !== undefined && typeof metadata.namespace !== 'string') throw new Error('metadata.namespace must be a string');
      const resolved = await resolveKubernetesReference({
        connectionID, resourceType: resourceKey, name: metadata.name,
        namespace: metadata.namespace,
      });
      if (preparing.signal.aborted || !isCurrent()) throw new Error('Creation cancelled because the editor changed.');
      await mutate({
        route: resolved.route,
        reference: resolved.reference,
        operation: 'create',
        input: jsonToValue(parsed),
      });
    } finally {
      setIsCreating(false);
    }
  };
  if (!authorable) return null;

  return (
    <>
      <CreateResourceTrigger label={label} preparing={isPreparing} onOpen={() => void handleOpen()} />
      <CreateResourceModal key={JSON.stringify([connectionID, resourceKey])} open={open} onClose={() => { preparation.current?.abort(); setOpen(false); }} resourceKey={resourceKey}
        resourceName={label} template={template} onCreate={handleCreate} isCreating={isCreating} context={connectionID} connectionID={connectionID}
        editorContext={inspectManifest(template).document ? editorContext : undefined}
        resolveContext={(source) => {
          const actual = catalogEditorContext(source, resourceKey, connectionID, 'create', descriptor);
          return inspectManifest(template).document ? { ...actual, group: editorContext.group, version: editorContext.version, kind: editorContext.kind } : actual;
        }} />
    </>
  );
};

export function CreateResourceTrigger({ label, preparing = false, disabled = false, onOpen }: { label: string; preparing?: boolean; disabled?: boolean; onOpen: () => void }) {
  return <Button size="sm" variant="outline" color="neutral" startDecorator={<LuPlus size={13} />} disabled={disabled || preparing} onClick={onOpen}>{preparing ? 'Preparing...' : `Create ${label}`}</Button>;
}

export default CreateResourceButton;
