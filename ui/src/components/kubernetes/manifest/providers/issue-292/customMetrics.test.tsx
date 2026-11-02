import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import CustomMetricsForm from './CustomMetricsForm';
import { resourceEditors } from './index';
import { buildMetricInput, discoveredMetrics, GROUP, inspectMetricResponse, parseQueryText, queryIssues, queryPath, queryUnavailable } from './model';
import { fixtureDiscoveryResources, fixtureMetricsTransport, metricContext, metricResponse, populatedQuerySource } from './fixtures';

afterEach(cleanup);
const actions = fixtureMetricsTransport();
const references = { list: async () => ({ status: 'ready' as const, items: [] }) };
function FormHarness({ controller, validity = vi.fn(), result, section = 'query', inspection = false }: { controller: ResourceEditorController; validity?: (error: string | null) => void; result?: ResourceEditorFormProps['requestResult']; section?: string; inspection?: boolean }) {
  const [, rerender] = useState(0);
  const context = metricContext('v1beta2', inspection ? 'inspect' : 'action');
  const contribution = resourceEditors[inspection ? 1 : 0];
  return <CustomMetricsForm context={context} draft={controller.draft(contribution.sensitivePaths)} section={section} disabled={false} requestResult={result} references={references} actions={actions} onValidityChange={validity} patch={request => {
    const response = controller.patch(request, contribution, context);
    if (response.status === 'accepted') rerender(value => value + 1);
    return response;
  }} />;
}

describe('custom metrics query and response behavior', () => {
  it('uses exact discovered group-qualified resources, scope and GET capability', () => {
    const items = discoveredMetrics({ groupVersion: `${GROUP}/v1beta2`, resources: [...fixtureDiscoveryResources, { name: 'pods/write_only', namespaced: true, kind: 'MetricValueList', verbs: ['create'] }] }, 'v1beta2');
    expect(items?.find(item => item.name === 'deployments.apps/work_items')).toEqual({ name: 'deployments.apps/work_items', resource: 'deployments.apps', metric: 'work_items', namespaced: true });
    expect(items?.some(item => item.metric === 'write_only')).toBe(false);
    expect(discoveredMetrics({ groupVersion: 'unknown/v1', resources: [] }, 'v1beta2')).toBeNull();
  });
  it('keeps native metric selectors distinct from object selectors and encodes review URL', () => {
    const controller = new ResourceEditorController(populatedQuerySource.replace('name: fixture-worker', 'name: "*"\n  labelSelector: app in (worker,batch)'));
    const input = buildMetricInput(controller.draft(), metricContext());
    expect(input.metricLabelSelector).toBe('lane=fast,region in (west,east)');
    expect(input.labelSelector).toBe('app in (worker,batch)');
    const path = queryPath(input);
    expect(path).toContain('/namespaces/fixture-team/pods/*/work_items?');
    expect(new URL(path, 'https://fixture.invalid').searchParams.get('metricLabelSelector')).toBe('lane=fast,region in (west,east)');
  });
  it('uses Namespace special route and rejects Namespace wildcard', () => {
    const controller = new ResourceEditorController(populatedQuerySource.replace('resource: pods', 'resource: namespaces').replace('namespaced: true', 'namespaced: false'));
    expect(queryPath(buildMetricInput(controller.draft(), metricContext()))).toContain('/namespaces/fixture-worker/metrics/work_items');
    controller.syncSource(controller.getSource().replace('name: fixture-worker', 'name: "*"'));
    expect(queryIssues(controller.draft(), metricContext()).some(issue => issue.message.includes('require one namespace'))).toBe(true);
  });
  it('retains invalid partial text locally and keeps prior canonical source and sibling edits', async () => {
    const controller = new ResourceEditorController(populatedQuerySource);
    const validity = vi.fn();
    render(<FormHarness controller={controller} validity={validity} />);
    await waitFor(() => expect(screen.queryByText('Discovering adapter metrics…')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Object name'), { target: { value: '' } });
    expect(controller.draft().get(['query', 'name'])).toBe('fixture-worker');
    fireEvent.change(screen.getByLabelText('Namespace'), { target: { value: 'other-team' } });
    expect(screen.getByLabelText('Object name')).toHaveValue('');
    expect(controller.draft().get(['query', 'namespace'])).toBe('other-team');
    expect(controller.draft().get(['query', 'futureOption'])).toBe(9007199254740993n);
    expect(controller.getSource()).toContain('# retain exact future option');
    expect(validity).toHaveBeenLastCalledWith('Enter a value.');
  });
  it('adds and removes one metric label without replacing unknown query siblings', async () => {
    const controller = new ResourceEditorController(populatedQuerySource);
    render(<FormHarness controller={controller} />);
    await waitFor(() => expect(screen.queryByText('Discovering adapter metrics…')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('New Metric label filters key'), { target: { value: 'queue' } });
    fireEvent.change(screen.getByLabelText('New Metric label filters value'), { target: { value: 'worker' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Metric label filters' }));
    expect(controller.draft().get(['query', 'metricLabels', 'queue'])).toBe('worker');
    fireEvent.click(screen.getByRole('button', { name: 'Remove lane' }));
    expect(controller.draft().has(['query', 'metricLabels', 'lane'])).toBe(false);
    expect(controller.draft().get(['query', 'metricLabelSelector'])).toBe('region in (west,east)');
    expect(controller.draft().get(['query', 'futureOption'])).toBe(9007199254740993n);
  });
  it.each(['v1beta1', 'v1beta2'] as const)('retains exact quantity, returned selector and zero window for %s', version => {
    const response = inspectMetricResponse(metricResponse(version, 0), version);
    expect(response.status).toBe('ready');
    if (response.status !== 'ready') throw new Error('Unexpected fixture representation');
    expect(response.samples[0]).toMatchObject({ value: '9007199254740993m', window: '0 s', selector: 'lane=returned' });
  });
  it('does not round wide windows or mistake unsafe numeric windows for exact values', () => {
    expect(inspectMetricResponse(metricResponse('v1beta2', '9223372036854775807'), 'v1beta2')).toMatchObject({ status: 'ready', samples: [{ window: '9223372036854775807 s' }] });
    expect(inspectMetricResponse(metricResponse('v1beta2', 9007199254740992), 'v1beta2').status).toBe('unsupported');
    const noWindow = metricResponse('v1beta2');
    expect(inspectMetricResponse(noWindow, 'v1beta2')).toMatchObject({ status: 'ready', samples: [{ window: 'Not reported' }] });
  });
  it('does not expose annotations or sensitive action bodies when showing request output', () => {
    const controller = new ResourceEditorController('apiVersion: custom.metrics.k8s.io/v1beta2\nkind: MetricValue\n');
    const { rerender, container } = render(<FormHarness controller={controller} section="results" result={{ status: 'ready', sensitive: true, output: { private: 'never-render-this' } }} />);
    expect(screen.getByText('Sensitive response withheld.')).toBeInTheDocument();
    expect(container.textContent).not.toContain('never-render-this');
    const output = { ...metricResponse(), metadata: { annotations: { credential: 'never-render-this' } } };
    rerender(<FormHarness controller={controller} section="results" result={{ status: 'ready', output }} />);
    expect(container.textContent).not.toContain('never-render-this');
    expect(screen.getByText('9007199254740993m')).toBeInTheDocument();
    expect(controller.revision).toBe(0);
  });
  it('keeps empty, rejected and unsupported responses distinct', () => {
    expect(inspectMetricResponse({ apiVersion: `${GROUP}/v1beta2`, kind: 'MetricValueList', items: [] }, 'v1beta2')).toEqual({ status: 'ready', samples: [] });
    expect(inspectMetricResponse({ apiVersion: `${GROUP}/v1beta2`, kind: 'MetricValueList', items: [{ value: false }] }, 'v1beta2').status).toBe('unsupported');
    expect(queryUnavailable(new ResourceEditorController('query: {name: 9007199254740993}').draft(), metricContext())).toContain('Unsupported query field type');
    expect(parseQueryText('name', '', true).valid).toBe(false);
    expect(parseQueryText('namespace', 'invalid/namespace', true).valid).toBe(false);
  });
  it('renders adapter-owned inspection with no query controls and rejects response mutation', () => {
    const source = JSON.stringify(metricResponse());
    const controller = new ResourceEditorController(source);
    render(<FormHarness controller={controller} inspection section="results" />);
    expect(screen.getByText('9007199254740993m')).toBeInTheDocument();
    expect(screen.queryByLabelText('Object name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh metrics' })).not.toBeInTheDocument();
    expect(controller.patch({ sessionID: controller.sessionID, expectedRevision: 0, operations: [{ op: 'set', path: ['items', 0, 'value'], value: '0' }] }, resourceEditors[1], metricContext('v1beta2', 'inspect')).status).toBe('forbidden');
    expect(controller.getSource()).toBe(source);
  });
});
