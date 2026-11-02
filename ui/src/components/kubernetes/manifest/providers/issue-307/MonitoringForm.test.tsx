import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MonitoringForm from './MonitoringForm';

afterEach(cleanup);
const cases: [string, ResourceEditorPath, string][] = [
  ['Prometheus', ['spec', 'remoteWrite', 0, 'url'], 'Destination URL'],
  ['PrometheusAgent', ['spec', 'remoteWrite', 0, 'url'], 'Destination URL'],
  ['ThanosRuler', ['spec', 'queryEndpoints', 0], 'URL'],
  ['ThanosRuler', ['spec', 'alertmanagersUrl', 0], 'URL'],
  ['Probe', ['spec', 'targets', 'staticConfig', 'static', 0], 'Target URL'],
  ['Probe', ['spec', 'prober', 'url'], 'Host:port'],
];
function fixture(kind: string, path: ResourceEditorPath, value: unknown) {
  const root: Record<string, unknown> = { spec: { private: { token: 'private-sibling' }, future: { exact: '9007199254740993' } } };
  let node = root as Record<string | number, unknown>;
  path.slice(0, -1).forEach((key, i) => {
    node[key] ??= typeof path[i + 1] === 'number' ? [] : {};
    node = node[key] as Record<string | number, unknown>;
  });
  node[path[path.length - 1]] = value;
  if (path[1] === 'remoteWrite') node.authorization = { credentials: { name: 'private-secret', key: 'token' } };
  const get = (keys: ResourceEditorPath) => keys.reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string | number, unknown>; // Fixture path traversal indexes locally built objects only.
    return record[key];
  }, root);
  const form: ResourceEditorFormProps = {
    context: { group: 'monitoring.coreos.com', version: 'v1', kind, resource: 'fixture', scope: 'Namespaced', connectionID: 'fixture', intent: 'edit', ownership: { status: 'application' }, capabilities: { create: 'available', update: 'available', delete: 'available', list: 'available', get: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } },
    draft: { sessionID: 'monitoring-test', revision: 0, get, has: keys => get(keys) !== undefined },
    section: 'configuration', disabled: false,
    patch: vi.fn(request => {
      for (const operation of request.operations) {
        if (operation.op !== 'set' || JSON.stringify(operation.path) !== JSON.stringify(path)) throw new Error('Expected exact URL leaf replacement');
        node[path[path.length - 1]] = operation.value;
      }
      return { status: 'accepted' as const, revision: 1 };
    }),
    onValidityChange: vi.fn(), references: { list: async () => ({ status: 'ready', items: [] }) }, actions: { execute: async () => ({ status: 'unavailable', message: 'Fixture only' }) },
  };
  return { root, form, get };
}

describe.each(cases)('%s public reference %j', (kind, path, label) => {
  it('edits only public URL leaf and retains private siblings through remount', () => {
    const { form, root, get } = fixture(kind, path, 'https://metrics.example/api');
    const expected = structuredClone(root);
    const view = render(<MonitoringForm {...form} />);
    const input = screen.getByLabelText(label);
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('https://metrics.example/api');
    fireEvent.change(input, { target: { value: 'https://metrics.example/replacement' } });
    expect(get(path)).toBe('https://metrics.example/replacement');
    expect(form.patch).toHaveBeenCalledWith({ sessionID: 'monitoring-test', expectedRevision: 0, operations: [{ op: 'set', path, value: 'https://metrics.example/replacement' }] });
    let expectedNode = expected as Record<string | number, unknown>;
    path.slice(0, -1).forEach(key => { expectedNode = expectedNode[key] as Record<string | number, unknown>; });
    expectedNode[path[path.length - 1]] = 'https://metrics.example/replacement';
    expect(root).toEqual(expected);
    view.unmount();
    render(<MonitoringForm {...form} />);
    expect(screen.getByLabelText(label)).toHaveValue('https://metrics.example/replacement');
  });

  it.each(['https://user:private-password@metrics.example/api', 'https://metrics.example/api?token=private-token', 'https://metrics.example/api#private-token', 'https://user%40metrics.example/api', { opaque: 'private-token' }])('hides private reference without mutating canonical source: %j', value => {
    const { form, root, get } = fixture(kind, path, value);
    const before = structuredClone(root);
    const view = render(<MonitoringForm {...form} />);
    expect(screen.getByLabelText(label)).toHaveValue('');
    expect(view.container.innerHTML).not.toContain('private-password');
    expect(view.container.innerHTML).not.toContain('private-token');
    view.unmount();
    const mounted = render(<MonitoringForm {...form} />);
    expect(screen.getByLabelText(label)).toHaveValue('');
    expect(root).toEqual(before);
    expect(form.patch).not.toHaveBeenCalled();
    const next = fixture(kind, path, 'https://metrics.example/from-source');
    mounted.rerender(<MonitoringForm {...next.form} draft={{ ...next.form.draft, sessionID: 'source-switch' }} />);
    expect(screen.getByLabelText(label)).toHaveValue('https://metrics.example/from-source');
    expect(get(path)).toBe(value);
    expect(root).toEqual(before);
  });

  it('replaces hidden reference only through explicit input', () => {
    const { form, get } = fixture(kind, path, 'https://metrics.example/api?token=private-token');
    render(<MonitoringForm {...form} />);
    expect(form.patch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'https://metrics.example/public' } });
    expect(get(path)).toBe('https://metrics.example/public');
  });
});

it('retains existing URL credential validation', () => {
  const [kind, path, label] = cases[0];
  const { form, get } = fixture(kind, path, 'https://metrics.example/public');
  render(<MonitoringForm {...form} />);
  fireEvent.change(screen.getByLabelText(label), { target: { value: 'https://user:password@metrics.example/api' } });
  expect(form.patch).not.toHaveBeenCalled();
  expect(get(path)).toBe('https://metrics.example/public');
});
