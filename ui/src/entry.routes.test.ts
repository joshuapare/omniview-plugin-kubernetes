import { matchRoutes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { plugin, routes } from './entry';
import PodTable from './components/kubernetes/table/corev1/Pod/Table';
import NodeTable from './components/kubernetes/table/corev1/Node/Table';
import DeploymentTable from './components/kubernetes/table/appsv1/Deployment/Table';
import HelmReleaseTable from './components/helm/releases/Table';
import HelmRepoTable from './components/helm/repos/Table';
import HelmChartTable from './components/helm/charts/Table';
import DefaultTable from './components/kubernetes/table/default/Table';
import ClusterResourcesRoute from './pages/ClusterResourcesRoute';

// Route matching must not initialize the unrelated browser-only Markdown worker.
// It is intentionally not a renderer fallback: mounting it fails this test.
vi.mock('./components/helm/charts/ChartSidebar/ChartReadmeTab', () => ({
  default: () => { throw new Error('Markdown rendering is outside the route-matching contract'); },
}));

describe('native specialized route registrations', () => {
  it.each([
    ['core::v1::Pod', 'k8s:/pods'],
    ['events_v1_Event', 'k8s:events.k8s.io/events'],
    ['events::v1::Event', 'k8s:events.k8s.io/events'],
  ])('migrates restored built-in %s through the registered provider hook', (legacy, canonical) => {
    expect(plugin.migratePagePath(`/_plugin/kubernetes/cluster/prod/resources/${legacy}`))
      .toEqual({ kind: 'migrated', path: `/_plugin/kubernetes/cluster/prod/resources/${encodeURIComponent(canonical)}` });
  });

  it.each([
    ['k8s:/pods', PodTable],
    ['k8s:/nodes', NodeTable],
    ['k8s:apps/deployments', DeploymentTable],
    ['helm:releases', HelmReleaseTable],
    ['helm:repositories', HelmRepoTable],
    ['helm:charts', HelmChartTable],
    ['k8s:events.k8s.io/events', DefaultTable],
  ] as const)('matches encoded canonical Type %s using installed React Router', (type, component) => {
    const matches = matchRoutes(routes, `/cluster/prod/resources/${encodeURIComponent(type)}`);
    expect(matches?.at(-1)?.route.Component).toBe(component);
    expect(matches?.at(-1)?.params.id).toBe('prod');
  });

  it.each([
    '/cluster/prod/resources',
    '/cluster/prod/resources/metrics',
    '/cluster/prod/resources/page/contributed/details',
    `/cluster/prod/resources/${encodeURIComponent('k8s:/pods')}`,
  ])('keeps connection recovery around plugin-owned resource route %s', (path) => {
    const matches = matchRoutes(routes, path);
    expect(matches?.some(({ route }) => route.Component === ClusterResourcesRoute)).toBe(true);
  });

  it('requires Type slash encoding instead of changing route structure', () => {
    expect(matchRoutes(routes, '/cluster/prod/resources/k8s:/pods')).toBeNull();
    expect(matchRoutes(routes, '/cluster/prod/resources/k8s:%2Fpods')?.at(-1)?.route.Component).toBe(PodTable);
  });

  it('leaves unknown opaque encoded Types to the actual generic route', () => {
    const type = 'k8s:example.io/widgets';
    const matches = matchRoutes(routes, `/cluster/prod/resources/${encodeURIComponent(type)}`);
    expect(matches?.at(-1)?.route.Component).toBe(DefaultTable);
    expect(matches?.at(-1)?.params.resourceKey).toBe(type);
  });
});
