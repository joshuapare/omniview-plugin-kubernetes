import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import APIGroupDiscoveryForm from './APIGroupDiscoveryForm';
import { discoveryQuery, validateDiscoveryQuery } from './request';

const inventory = {
  apiVersion: 'apidiscovery.k8s.io/v2', kind: 'APIGroupDiscoveryList',
  items: [
    { metadata: { name: 'apps' }, versions: [{ version: 'v1', freshness: 'Current', resources: [{ resource: 'deployments', scope: 'Namespaced', verbs: ['get'], shortNames: ['deploy'], subresources: [{ subresource: 'scale', responseKind: null, acceptedTypes: [{ group: 'autoscaling', version: 'v1', kind: 'Scale' }], verbs: ['get'] }] }] }] },
    { metadata: { name: 'example.test' }, versions: [{ version: 'v2', freshness: 'Current', resources: [] }, { version: 'v1', freshness: 'Stale', resources: [{ resource: 'widgets', scope: 'Cluster', responseKind: null, verbs: [] }] }] },
  ],
};
function props(source: unknown = inventory, overrides: Partial<ResourceEditorFormProps> = {}): ResourceEditorFormProps {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((value, segment) => value && typeof value === 'object' ? (value as Record<string | number, unknown>)[segment] : undefined, source);
  return {
    context: { group: 'apidiscovery.k8s.io', version: 'v2', kind: 'APIGroupDiscoveryList', resource: '', scope: 'Cluster', connectionID: 'fixture-only', intent: 'inspect',
      capabilities: { create: 'absent', update: 'absent', delete: 'absent', list: 'absent', get: 'absent', actions: { 'kubernetes.discovery.v1': 'available' } }, discovery: { status: 'available', features: {} }, schema: { status: 'unknown' } },
    draft: { sessionID: 'discovery-fixture', revision: 3, get, has: path => get(path) !== undefined },
    section: 'capabilities', disabled: false, patch: vi.fn(() => ({ status: 'forbidden', message: 'Read-only response.' })), onValidityChange: vi.fn(),
    actions: { execute: vi.fn() }, references: { list: vi.fn() }, ...overrides,
  };
}

describe('discovery inspector behavior', () => {
  it('filters using typed input and expands real subresource detail without patching response', () => {
    const form = props();
    render(<APIGroupDiscoveryForm {...form} />);
    fireEvent.change(screen.getByLabelText('Filter resources'), { target: { value: 'deploy' } });
    expect(screen.queryByText('widgets')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('deployments'));
    expect(screen.getByText('/scale')).toBeVisible();
    expect(screen.getByText('autoscaling/v1 · Scale')).toBeVisible();
    expect(form.patch).not.toHaveBeenCalled();
    expect(form.actions.execute).not.toHaveBeenCalled();
  });
  it('does not promote a filtered nonpreferred version and warns on stale capabilities', () => {
    render(<APIGroupDiscoveryForm {...props()} />);
    fireEvent.change(screen.getByLabelText('Filter resources'), { target: { value: 'widgets' } });
    expect(screen.queryByText('Preferred')).not.toBeInTheDocument();
    expect(screen.getByText('Stale response. Refresh before relying on these capabilities.')).toBeInTheDocument();
  });
  it('keeps previous response on denied query and never mistakes denial for an empty result', () => {
    const form = props({ ...inventory, items: [] });
    const { rerender } = render(<APIGroupDiscoveryForm {...form} requestResult={{ status: 'ready', output: inventory }} />);
    rerender(<APIGroupDiscoveryForm {...form} requestResult={{ status: 'denied', message: 'untrusted-private-material' }} />);
    expect(screen.getByText('deployments')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Discovery request' })).toHaveTextContent('denied');
    expect(screen.queryByText('No API groups returned.')).not.toBeInTheDocument();
    expect(screen.queryByText('untrusted-private-material')).not.toBeInTheDocument();
    expect(form.patch).not.toHaveBeenCalled();
  });
  it('never displays sensitive action output', () => {
    render(<APIGroupDiscoveryForm {...props(inventory, { requestResult: { status: 'ready', sensitive: true, output: { private: 'must-not-render' } } })} />);
    expect(screen.getByText('deployments')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sensitive response hidden');
    expect(screen.queryByText('must-not-render')).not.toBeInTheDocument();
  });
  it('shows successful empty response separately from failed requests', () => {
    render(<APIGroupDiscoveryForm {...props(inventory, { requestResult: { status: 'ready', output: { apiVersion: 'apidiscovery.k8s.io/v2', kind: 'APIGroupDiscoveryList', items: [] } } })} />);
    expect(screen.getByRole('status')).toHaveTextContent('No API groups returned');
    expect(screen.queryByText('deployments')).not.toBeInTheDocument();
  });
  it('reports null successful output as malformed instead of silently displaying old capabilities', () => {
    render(<APIGroupDiscoveryForm {...props(inventory, { requestResult: { status: 'ready', output: null } })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Returned discovery response has an unsupported shape');
    expect(screen.queryByText('deployments')).not.toBeInTheDocument();
  });
  it('discards previous response and filter when the host changes draft session', () => {
    const form = props({ ...inventory, items: [] });
    const { rerender } = render(<APIGroupDiscoveryForm {...form} requestResult={{ status: 'ready', output: inventory }} />);
    fireEvent.change(screen.getByLabelText('Filter resources'), { target: { value: 'deploy' } });
    rerender(<APIGroupDiscoveryForm {...form} draft={{ ...form.draft, sessionID: 'different-connection-session' }} requestResult={{ status: 'denied', message: 'Denied' }} />);
    expect(screen.queryByText('deployments')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Filter resources')).toHaveValue('');
    expect(screen.getByRole('status', { name: 'Discovery request' })).toHaveTextContent('denied');
  });
  it('builds bounded query input without forwarding response or unknown sensitive fields', () => {
    const form = props({ ...inventory, query: { endpoint: '/api', version: 'v2beta1' }, private: 'not-forwarded' });
    expect(discoveryQuery(form.draft, form.context)).toEqual({ endpoint: '/api', version: 'v2beta1' });
    expect(validateDiscoveryQuery(form.draft)).toEqual([]);
    const invalid = props({ ...inventory, query: { endpoint: 'https://untrusted.test', version: 'v99' } });
    expect(validateDiscoveryQuery(invalid.draft)).toHaveLength(2);
  });
});
