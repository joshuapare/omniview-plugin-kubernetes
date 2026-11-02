import { Chip, type ComponentColor } from '@omniviewdev/base-ui';
import { useRightDrawer, useSnackbar, parseAppError, useResourceTypes } from '@omniviewdev/runtime';
import type { GraphNode } from '@omniviewdev/runtime/models';
import { ResourceClient } from '@omniviewdev/runtime/api';
import { resolveKubernetesReference } from '../../utils/kubernetesReference';
import { templateIdentity } from '../kubernetes/actions/create/templates';
import type { OwnerReference } from 'kubernetes-types/meta/v1';
import React from 'react';
import { LuCopy, LuLayers, LuDatabase, LuPlay, LuClock, LuServer, LuUser } from 'react-icons/lu';

import { PLUGIN_ID } from '@/pluginId';

type KindConfig = {
  color: ComponentColor;
  icon: React.ReactElement;
};

/** Map Kubernetes resource kinds to chip color + icon */
const kindConfigMap: Record<string, KindConfig> = {
  Deployment: { color: 'brand', icon: <LuLayers size={10} /> },
  ReplicaSet: { color: 'brand', icon: <LuCopy size={10} /> },
  ReplicationController: { color: 'brand', icon: <LuCopy size={10} /> },
  StatefulSet: { color: 'info', icon: <LuDatabase size={10} /> },
  DaemonSet: { color: 'secondary', icon: <LuLayers size={10} /> },
  Job: { color: 'secondary', icon: <LuPlay size={10} /> },
  CronJob: { color: 'secondary', icon: <LuClock size={10} /> },
  Node: { color: 'success', icon: <LuServer size={10} /> },
  ServiceAccount: { color: 'neutral', icon: <LuUser size={10} /> },
};

const defaultConfig: KindConfig = { color: 'neutral', icon: <LuCopy size={10} /> };

const chipStyle: React.CSSProperties = { borderRadius: 4, maxWidth: '100%' };

type NativeLinkProps = {
  /** ID of the plugin this resource belongs to */
  pluginID?: string;
  /** ID of the connection */
  connectionID: string;
  /** Namespace of the resource being referenced */
  namespace?: string;
  /** ID of the resource being referenced */
  resourceID: string;
  /** Opaque canonical resource Type. */
  resourceKey: string;
  /** The readable name of the resource (e.g. Node) */
  resourceName?: string;
  incarnation?: string;
};

type Props = NativeLinkProps | {
  connectionID: string;
  namespace?: string;
  ownerReference: Pick<OwnerReference, 'apiVersion' | 'kind' | 'name'> & Partial<Pick<OwnerReference, 'uid'>>;
  resourceName?: string;
} | { target: GraphNode; resourceName?: string };

/**
 * A clickable chip that opens the referenced resource's sidebar.
 * Shared between table cells and sidebar sections.
 */
const ResourceLinkChip: React.FC<Props> = (props) => {
  const { showResourceSidebar } = useRightDrawer();
  const snackbar = useSnackbar();
  const canonical = 'target' in props ? props.target : undefined;
  const native = 'resourceKey' in props ? props : undefined;
  const owner = 'ownerReference' in props ? props.ownerReference : undefined;
  const resourceKey = canonical?.reference.address.type ?? native?.resourceKey;
  const resourceID = canonical?.reference.address.id ?? native?.resourceID ?? owner?.name;
  const resourceName = props.resourceName;
  const pluginID = canonical?.pluginId ?? native?.pluginID ?? PLUGIN_ID;
  const route = canonical?.route ?? { connection: 'connectionID' in props ? props.connectionID : '' };
  const { resourceTypes } = useResourceTypes({ pluginID, route });

  if (!resourceName || !resourceID || (!resourceKey && !owner)) return null;

  const handleClick = async () => {
    try {
      let ownerType: string | undefined;
      if (owner) {
        // Native owner metadata selects a catalog Type; only the host assigns reference authority and keys.
        const catalog = await ResourceClient.Catalog(pluginID, { route });
        const matches: string[] = [];
        for (const descriptor of catalog.types) {
          for (const representation of descriptor.representations) {
            const binding = representation.schema;
            const document = binding.document ?? (binding.documentRef
              ? (await ResourceClient.GetSchemaDocument(pluginID, route, binding.documentRef)).document
              : undefined);
            const identity = templateIdentity(document, binding.root, false);
            // API version is representation metadata; the native group and kind identify the owner type.
            const ownerGroup = owner.apiVersion.includes('/') ? owner.apiVersion.slice(0, owner.apiVersion.lastIndexOf('/')) : '';
            const schemaGroup = identity?.apiVersion.includes('/') ? identity.apiVersion.slice(0, identity.apiVersion.lastIndexOf('/')) : '';
            if (identity?.kind === owner.kind && schemaGroup === ownerGroup) {
              matches.push(descriptor.type);
              break;
            }
          }
        }
        if (matches.length !== 1) throw new Error(`Owner resource type is unavailable or ambiguous: ${owner.kind}`);
        ownerType = matches[0];
      }
      const resolved = canonical
        ? await ResourceClient.ResolveReference(pluginID, {
          route: canonical.route, type: canonical.reference.address.type,
          scope: canonical.reference.address.scope, id: canonical.reference.address.id,
          incarnation: canonical.reference.incarnation,
        })
        : await resolveKubernetesReference({
          connectionID: 'connectionID' in props ? props.connectionID : '',
          resourceType: ownerType ?? resourceKey!, name: resourceID,
          namespace: 'namespace' in props ? props.namespace : undefined,
          incarnation: owner?.uid || native?.incarnation || undefined,
        });
      await showResourceSidebar({
        pluginID,
        reference: resolved.reference,
        route: resolved.route,
        representation: resolved.representation,
        targetId: resolved.targetId,
        resourceName: resourceID,
      });
    } catch (error) {
      snackbar.showSnackbar(parseAppError(error).detail, 'error');
    }
  };

  const kind = owner?.kind ?? resourceTypes.data?.find((entry) => entry.type === resourceKey)?.displayName ?? '';
  const config = kindConfigMap[kind] ?? defaultConfig;

  return (
    <Chip
      size="xs"
      variant="outline"
      color={config.color}
      startDecorator={config.icon}
      clickable
      onClick={() => { void handleClick(); }}
      style={chipStyle}
    >
      {resourceName}
    </Chip>
  );
};

export default ResourceLinkChip;
