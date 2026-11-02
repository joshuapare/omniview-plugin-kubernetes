import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WasmPluginForm from './WasmPluginForm';

afterEach(cleanup);

function fixture(url: unknown): { form: ResourceEditorFormProps; spec: Record<string, unknown> } {
  const spec: Record<string, unknown> = { url, pluginConfig: { token: 'private-config' }, vmConfig: { env: [{ name: 'TOKEN', value: 'private-env' }] }, future: { exact: '9007199254740993' } };
  const root = { spec };
  const form: ResourceEditorFormProps = {
    context: { group: 'extensions.istio.io', version: 'v1alpha1', kind: 'WasmPlugin', resource: 'wasmplugins', scope: 'Namespaced', connectionID: 'fixture', intent: 'edit', ownership: { status: 'application' }, capabilities: { create: 'available', update: 'available', delete: 'available', list: 'available', get: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } },
    draft: { sessionID: 'wasm-test', revision: 0, get(path) { return path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, root); }, has(path) { return this.get(path) !== undefined; } },
    section: 'module', disabled: false,
    patch: vi.fn(request => {
      for (const operation of request.operations) {
        if (operation.op !== 'set' || operation.path.length !== 2 || operation.path[0] !== 'spec') throw new Error('Unexpected non-leaf patch');
        spec[String(operation.path[1])] = operation.value;
      }
      return { status: 'accepted' as const, revision: 1 };
    }),
    onValidityChange: vi.fn(), references: { list: async () => ({ status: 'ready', items: [] }) }, actions: { execute: async () => ({ status: 'unavailable', message: 'Fixture only' }) },
  };
  return { form, spec };
}

describe('Wasm public module reference', () => {
  it('shows public OCI references and edits only the canonical URL leaf', () => {
    const { form, spec } = fixture('oci://registry.example/module:v1');
    const siblings = { pluginConfig: spec.pluginConfig, vmConfig: spec.vmConfig, future: spec.future };
    const view = render(<WasmPluginForm {...form} />);
    const input = screen.getByLabelText('Module reference');
    expect(input).not.toHaveAttribute('type', 'password');
    expect(input).toHaveValue('oci://registry.example/module:v1');
    fireEvent.change(input, { target: { value: 'oci://registry.example/module:v2' } });
    expect(spec.url).toBe('oci://registry.example/module:v2');
    expect(form.patch).toHaveBeenCalledWith({ sessionID: 'wasm-test', expectedRevision: 0, operations: [{ op: 'set', path: ['spec', 'url'], value: 'oci://registry.example/module:v2' }] });
    for (const [key, value] of Object.entries(siblings)) expect(spec[key]).toBe(value);
    view.unmount();
    render(<WasmPluginForm {...form} />);
    expect(screen.getByLabelText('Module reference')).toHaveValue('oci://registry.example/module:v2');
  });

  it.each([
    'https://user:private-password@registry.example/module.wasm',
    'oci://user:private-password@registry.example/module:v1',
    'https://registry.example/module.wasm?token=private-token',
    'https://registry.example/module.wasm#private-token',
    'https://user%40registry.example/module.wasm',
    { toString() { throw new Error('Opaque projection must not be coerced'); } },
  ])('keeps private or opaque references unchanged through remount and source switch', url => {
    const { form, spec } = fixture(url);
    const view = render(<WasmPluginForm {...form} />);
    expect(screen.getByLabelText('Module reference')).toHaveValue('');
    expect(view.container.innerHTML).not.toContain('private-password');
    expect(view.container.innerHTML).not.toContain('private-token');
    expect(form.patch).not.toHaveBeenCalled();
    view.unmount();
    const remount = render(<WasmPluginForm {...form} />);
    expect(screen.getByLabelText('Module reference')).toHaveValue('');
    expect(spec.url).toBe(url);
    const next = fixture('https://registry.example/public.wasm');
    remount.rerender(<WasmPluginForm {...next.form} draft={{ ...next.form.draft, sessionID: 'source-switch' }} />);
    expect(screen.getByLabelText('Module reference')).toHaveValue('https://registry.example/public.wasm');
    expect(form.patch).not.toHaveBeenCalled();
    expect(spec.url).toBe(url);
  });

  it('rejects credential-bearing replacements without changing canonical data', () => {
    const { form, spec } = fixture('oci://registry.example/module:v1');
    render(<WasmPluginForm {...form} />);
    fireEvent.change(screen.getByLabelText('Module reference'), { target: { value: 'oci://user:secret@registry.example/module:v2' } });
    expect(form.patch).not.toHaveBeenCalled();
    expect(spec.url).toBe('oci://registry.example/module:v1');
  });

  it('replaces a hidden reference only after explicit public input, retaining opaque siblings', () => {
    const { form, spec } = fixture('https://user:private-password@registry.example/module.wasm');
    const config = spec.pluginConfig;
    const environment = spec.vmConfig;
    const future = spec.future;
    render(<WasmPluginForm {...form} />);
    expect(screen.getByLabelText('Module reference')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Module reference'), { target: { value: 'oci://registry.example/replacement:v1' } });
    expect(spec.url).toBe('oci://registry.example/replacement:v1');
    expect(spec.pluginConfig).toBe(config);
    expect(spec.vmConfig).toBe(environment);
    expect(spec.future).toBe(future);
  });
});
