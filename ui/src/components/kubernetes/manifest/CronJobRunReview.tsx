import { jsonToValue, useResourceMutations, useResourceTypes } from '@omniviewdev/runtime';
import { parse } from 'yaml';
import { PLUGIN_ID } from '@/pluginId';
import { resolveKubernetesReference } from '../../../utils/kubernetesReference';
import CreateResourceModal from '../actions/create/CreateResourceModal';
import { catalogEditorContext } from './resourceEditorContext';

/** The fresh saved template stays host-private until reviewed through ordinary Job create. */
export default function CronJobRunReview({ source, connectionID, onClose }: { source: string; connectionID: string; onClose: () => void }) {
  const { mutate } = useResourceMutations({ pluginID: PLUGIN_ID });
  const { resourceTypes } = useResourceTypes({ pluginID: PLUGIN_ID, route: { connection: connectionID } });
  const descriptor = resourceTypes.data?.find((entry) => entry.type === 'k8s:batch/jobs');
  return <CreateResourceModal open onClose={onClose} resourceKey="k8s:batch/jobs" resourceName="Job from saved CronJob" template={source} connectionID={connectionID} context={connectionID}
    editorContext={catalogEditorContext(source, 'k8s:batch/jobs', connectionID, 'create', descriptor)}
    onCreate={async (value, isCurrent) => {
      const body = parse(value, { intAsBigInt: true }) as { apiVersion?: string; kind?: string; metadata?: { name?: string; namespace?: string; ownerReferences?: unknown } };
      if (body.apiVersion !== 'batch/v1' || body.kind !== 'Job' || !body.metadata?.name || !body.metadata.namespace || body.metadata.ownerReferences !== undefined) throw new Error('Review a named Job and namespace without an owner reference.');
      if (!descriptor?.capabilities.some((entry) => entry.operation === 'create' && entry.scope.every((scope) => scope.match === 'any' || scope.dimension === 'namespace' && scope.values.includes(body.metadata!.namespace!)))) throw new Error('Job creation is not advertised for this namespace.');
      const target = await resolveKubernetesReference({ connectionID, resourceType: 'k8s:batch/jobs', name: body.metadata.name, namespace: body.metadata.namespace });
      if (!isCurrent()) throw new Error('Job review changed before creation.');
      await mutate({ route: target.route, reference: target.reference, operation: 'create', input: jsonToValue(body) });
    }} />;
}
