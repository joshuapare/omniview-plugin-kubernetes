import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CloudEventEditor from './CloudEventEditor';

afterEach(cleanup);
const endpoints = [
  ['http', 'uri', 'HTTP sink URL'],
  ['azureEventGridTopic', 'endpoint', 'Azure Event Grid endpoint'],
] as const;
function fixture(branch: string, key: string, value: unknown) {
  const sink: Record<string, unknown> = { [key]: value, private: { token: 'private-sibling' }, future: ['9007199254740993'] };
  const root = { spec: { destination: { [branch]: sink }, authenticationRef: { name: 'private-auth', future: true } } };
  const form: ResourceEditorFormProps = {
    context: { group: 'eventing.keda.sh', version: 'v1alpha1', kind: 'CloudEventSource', resource: 'cloudeventsources', scope: 'Namespaced', connectionID: 'fixture', intent: 'edit', ownership: { status: 'application' }, capabilities: { create: 'available', update: 'available', delete: 'available', list: 'available', get: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } },
    draft: { sessionID: 'events-test', revision: 0, get(path) { return path.reduce<unknown>((node, key) => {
      if (!node || typeof node !== 'object') return undefined;
      const record = node as Record<string | number, unknown>; // Only indexes locally constructed fixture objects.
      return record[key];
    }, root); }, has(path) { return this.get(path) !== undefined; } },
    section: 'destinations', disabled: false,
    patch: vi.fn(request => {
      for (const operation of request.operations) {
        if (operation.op !== 'set' || JSON.stringify(operation.path) !== JSON.stringify(['spec', 'destination', branch, key])) throw new Error('Expected endpoint leaf replacement');
        sink[key] = operation.value;
      }
      return { status: 'accepted' as const, revision: 1 };
    }),
    onValidityChange: vi.fn(), references: { list: async () => ({ status: 'ready', items: [] }) }, actions: { execute: async () => ({ status: 'unavailable', message: 'Fixture only' }) },
  };
  return { form, sink, root };
}

describe.each(endpoints)('%s public destination', (branch, key, label) => {
  it('shows public URL and changes only endpoint leaf through remount', () => {
    const { form, sink, root } = fixture(branch, key, 'https://events.invalid');
    const before = structuredClone(root);
    const view = render(<CloudEventEditor {...form} />);
    expect(screen.getByLabelText(label)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(label)).toHaveValue('https://events.invalid');
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'https://events.invalid/new' } });
    expect(form.patch).toHaveBeenCalledWith({ sessionID: 'events-test', expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'destination', branch, key], value: 'https://events.invalid/new' }] });
    expect(sink[key]).toBe('https://events.invalid/new');
    before.spec.destination[branch][key] = 'https://events.invalid/new';
    expect(root).toEqual(before);
    view.unmount();
    render(<CloudEventEditor {...form} />);
    expect(screen.getByLabelText(label)).toHaveValue('https://events.invalid/new');
  });

  it.each(['https://user:private-password@events.invalid', 'https://events.invalid?token=private-token', 'https://events.invalid#private-token', 'https://user%40events.invalid', { opaque: 'private-token' }])('keeps private canonical references hidden through remount/source switch: %j', value => {
    const { form, root } = fixture(branch, key, value);
    const before = structuredClone(root);
    const view = render(<CloudEventEditor {...form} />);
    expect(screen.getByLabelText(label)).toHaveValue('');
    expect(view.container.innerHTML).not.toContain('private-password');
    expect(view.container.innerHTML).not.toContain('private-token');
    view.unmount();
    const mounted = render(<CloudEventEditor {...form} />);
    expect(screen.getByLabelText(label)).toHaveValue('');
    expect(form.patch).not.toHaveBeenCalled();
    expect(root).toEqual(before);
    const next = fixture(branch, key, 'https://events.invalid/source');
    mounted.rerender(<CloudEventEditor {...next.form} draft={{ ...next.form.draft, sessionID: 'source-switch' }} />);
    expect(screen.getByLabelText(label)).toHaveValue('https://events.invalid/source');
    expect(root).toEqual(before);
  });

  it('requires explicit public replacement and preserves existing endpoint validation', () => {
    const { form, sink } = fixture(branch, key, 'https://events.invalid?token=private-token');
    const privateSibling = sink.private;
    render(<CloudEventEditor {...form} />);
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'https://user:password@events.invalid' } });
    expect(form.patch).not.toHaveBeenCalled();
    expect(sink[key]).toBe('https://events.invalid?token=private-token');
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'https://events.invalid/public' } });
    expect(sink[key]).toBe('https://events.invalid/public');
    expect(sink.private).toBe(privateSibling);
  });

  it.each(['inspect', 'boundary'] as const)('renders public endpoint without populated password controls in %s views', intent => {
    const { form } = fixture(branch, key, 'https://events.invalid');
    const context = intent === 'inspect' ? { ...form.context, intent: 'inspect' as const } : { ...form.context, ownership: undefined };
    render(<CloudEventEditor {...form} context={context} />);
    expect(screen.getByLabelText(label)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(label)).toHaveValue('https://events.invalid');
    expect(screen.getByLabelText(label)).toBeDisabled();
    expect(form.patch).not.toHaveBeenCalled();
  });
});
