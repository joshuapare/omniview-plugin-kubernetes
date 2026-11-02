import { Spinner } from '@omniviewdev/base-ui';
import { useConnections, usePluginRouter } from '@omniviewdev/runtime';
import { useParams } from 'react-router';

import ClusterConnectionBoundary from '../components/connections/ClusterConnectionBoundary';
import { useLegacyColumnMigration } from '../hooks/useLegacyColumnMigration';
import { PLUGIN_ID } from '../pluginId';

import ClusterResourcesPage from './ClusterResourcesPage';

export default function ClusterResourcesRoute() {
  const { id = '' } = useParams<{ id: string }>();
  const { navigate } = usePluginRouter();
  const { connections } = useConnections({ plugin: PLUGIN_ID });
  const migrationReady = useLegacyColumnMigration(connections.data?.map(connection => connection.id));
  return (
    <ClusterConnectionBoundary
      connectionID={id}
      onEditConnection={() => navigate(`/cluster/${encodeURIComponent(id)}/edit`)}
      onBack={() => navigate('/clusters')}
    >
      {migrationReady
        ? <ClusterResourcesPage />
        : <div role="status"><Spinner size="sm" />Restoring column preferences...</div>}
    </ClusterConnectionBoundary>
  );
}
