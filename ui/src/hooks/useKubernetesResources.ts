import { useMemo } from 'react';
import { useResourceTypes, useResolvedResourceTarget, useResources, valueToJSON } from '@omniviewdev/runtime';

import { PLUGIN_ID } from '@/pluginId';
/** Kubernetes presentation adapter. Only the host resolves authority and membership. */
export function useKubernetesResources<T>({
  pluginID = PLUGIN_ID, connectionID, resourceType, namespaces = [], enabled = true,
}: {
  pluginID?: string;
  connectionID: string;
  resourceType: string;
  namespaces?: string[];
  enabled?: boolean;
}) {
  const route = { connection: connectionID };
  const { resourceTypes } = useResourceTypes({ pluginID, route });
  const descriptor = resourceTypes.data?.find((entry) => entry.type === resourceType);
  const representation = descriptor?.defaultRepresentation;
  const scope = descriptor?.queryDimensions.map(({ name }) =>
    name === 'namespace' && namespaces.length
      ? { dimension: name, match: 'oneOf' as const, values: namespaces }
      : { dimension: name, match: 'any' as const });
  const target = useResolvedResourceTarget({
    pluginID, route, type: resourceType, representation, scope,
    enabled: enabled && !!descriptor,
  });
  const result = useResources({
    pluginID,
    collection: true,
    request: target.data && {
      targetId: target.data.targetId,
      request: { target: target.data.target, pageSize: 200 },
    },
    enabled: enabled && !!target.data,
    live: descriptor?.capabilities.some(({ operation }) => operation === 'sourceUpdates') ?? false,
  });
  const records = result.acquired?.page.records;
  const bodies = useMemo(() => (records ?? []).map(({ record }) => valueToJSON(record.body) as T), [records]);
  return {
    ...result,
    retry: () => {
      if (resourceTypes.error) void resourceTypes.refetch();
      else if (target.error) void target.refetch();
      else void result.resources.refetch();
    },
    records: records ?? [],
    bodies,
    isLoading: enabled && (resourceTypes.isLoading || target.isLoading || (result.resources.isLoading && !result.acquired)),
    error: resourceTypes.error ?? target.error ?? result.resources.error,
  };
}
