import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorDraft, ResourceEditorFormProps } from '@omniviewdev/runtime';
import NodeMetricsInspector from './NodeMetricsInspector';
import PodMetricsInspector from './PodMetricsInspector';
import { metricsFixtureContext, nodeMetricsFixture, nodeMetricsListFixture, podMetricsFixture, podMetricsListFixture } from './fixtures';
import { metricsQueryAccess, readMetricsResponse } from './metricsModel';

function draftOf(value: unknown): ResourceEditorDraft {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((current, key) => current !== null && typeof current === 'object' ? (current as Record<string | number, unknown>)[key] : undefined, value);
  return { sessionID: 'fixture-session', revision: 1, get, has: path => get(path) !== undefined };
}
function props(value: unknown = nodeMetricsFixture): ResourceEditorFormProps {
  return {
    context: metricsFixtureContext, draft: draftOf(value), section: 'usage', disabled: true,
    patch: vi.fn(() => ({ status: 'forbidden' as const, message: 'Read-only' })), onValidityChange: vi.fn(),
    references: { list: vi.fn(async () => ({ status: 'ready' as const, items: [] })) },
    actions: { execute: vi.fn(async () => ({ status: 'ready' as const, output: nodeMetricsListFixture })) },
  };
}
afterEach(cleanup);

describe('metrics read-only inspection', () => {
  it('keeps exact quantities without percentages, numeric conversion, or mutation controls', () => {
    const form = props();
    render(<NodeMetricsInspector {...form} />);
    expect(screen.getByText('9007199254740993Ki')).toBeInTheDocument();
    expect(screen.getByText('123456789n')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save|create|delete|apply/i })).not.toBeInTheDocument();
    expect(form.patch).not.toHaveBeenCalled();
  });
  it('filters container rows locally even when host source is read-only', () => {
    const form = props(podMetricsFixture);
    const original = JSON.stringify(podMetricsFixture);
    render(<PodMetricsInspector {...form} context={{ ...metricsFixtureContext, kind: 'PodMetrics', resource: 'pods', scope: 'Namespaced', namespace: 'preview' }} />);
    fireEvent.change(screen.getByLabelText('Filter pods or containers'), { target: { value: 'sidecar' } });
    expect(screen.getByRole('rowheader', { name: 'sidecar' })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'frontend' })).not.toBeInTheDocument();
    expect(JSON.stringify(podMetricsFixture)).toBe(original);
    expect(form.patch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Filter pods or containers'), { target: { value: '' } });
    expect(screen.getByRole('rowheader', { name: 'frontend' })).toBeInTheDocument();
  });
  it('distinguishes empty measurements from zero usage', () => {
    render(<NodeMetricsInspector {...props()} requestResult={{ status: 'ready', output: { ...nodeMetricsListFixture, items: [] } }} />);
    expect(screen.getByRole('status')).toHaveTextContent('No measurements returned. This does not mean zero usage.');
    expect(screen.queryByText('123456789n')).not.toBeInTheDocument();
  });
  it.each([
    ['denied', 'not authorized'], ['absent', 'not available'], ['unavailable', 'unavailable'], ['cancelled', 'cancelled'],
  ] as const)('shows safe %s result, not stale measurements or untrusted error details', (status, message) => {
    render(<NodeMetricsInspector {...props()} requestResult={{ status, message: 'UNTRUSTED_RESPONSE_DETAIL' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('UNTRUSTED_RESPONSE_DETAIL')).not.toBeInTheDocument();
    expect(screen.queryByText('123456789n')).not.toBeInTheDocument();
  });
  it('withholds sensitive action output completely', () => {
    render(<PodMetricsInspector {...props(podMetricsFixture)} requestResult={{ status: 'ready', sensitive: true, output: podMetricsListFixture }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sensitive response withheld');
    expect(screen.queryByText('120m')).not.toBeInTheDocument();
  });
  it('reports unsupported shapes without coercing them or exposing unknown data', () => {
    render(<NodeMetricsInspector {...props({ ...nodeMetricsFixture, usage: { cpu: { opaque: 'UNTRUSTED_VALUE' }, memory: '2Mi' } })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Unsupported metrics shape');
    expect(screen.queryByText('UNTRUSTED_VALUE')).not.toBeInTheDocument();
  });
  it('preserves missing quantities as not reported rather than zero', () => {
    render(<NodeMetricsInspector {...props({ ...nodeMetricsFixture, usage: { cpu: '0' } })} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Not reported')).toBeInTheDocument();
  });
  it('does not infer permission from discovery', () => {
    expect(metricsQueryAccess({ ...metricsFixtureContext, capabilities: { ...metricsFixtureContext.capabilities, actions: {} } })).toBe('Metrics query permission is unknown.');
  });
  it('supports list item TypeMeta omission while rejecting conflicting item types', () => {
    const { apiVersion: _version, kind: _kind, ...item } = nodeMetricsFixture;
    expect(readMetricsResponse({ ...nodeMetricsListFixture, items: [item] }, 'NodeMetrics', metricsFixtureContext).status).toBe('ready');
    expect(readMetricsResponse({ ...nodeMetricsListFixture, items: [{ ...item, kind: 'Secret' }] }, 'NodeMetrics', metricsFixtureContext).status).toBe('unsupported');
  });
  it('keeps named query results scoped to exact namespace and name', () => {
    const context = { ...metricsFixtureContext, kind: 'PodMetrics', resource: 'pods', scope: 'Namespaced' as const, namespace: 'other', name: 'preview-pod' };
    expect(readMetricsResponse(podMetricsListFixture, 'PodMetrics', context)).toEqual({ status: 'ready', samples: [] });
  });
});
