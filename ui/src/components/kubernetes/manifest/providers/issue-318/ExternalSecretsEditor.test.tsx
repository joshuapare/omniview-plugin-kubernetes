import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import ExternalSecretsEditor from './ExternalSecretsEditor';
import { generated, targets, validate } from './domain';

afterEach(cleanup);
function fixture(kind: string, source: Record<string, unknown>, section = 'connection'): ResourceEditorFormProps {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, source);
  return {
    context: { ...targets.find(target => target.kind === kind)!, connectionID: 'fixture', namespace: 'test', intent: 'edit', ownership: { status: 'application' }, capabilities: { create: 'available', update: 'available', delete: 'available', get: 'available', list: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } },
    draft: { sessionID: 'eso-test', revision: 3, get, has: path => get(path) !== undefined }, section, disabled: false,
    patch: vi.fn(() => ({ status: 'accepted', revision: 4 })), onValidityChange: vi.fn(),
    references: { list: vi.fn(async () => ({ status: 'ready', items: [] })) },
    actions: { execute: vi.fn(async () => ({ status: 'unavailable', message: 'Fixture only.' })) },
  };
}
describe('External Secrets domain behavior', () => {
  it('patches one remote property without copying opaque row siblings', () => {
    const form = fixture('ExternalSecret', { spec: { secretStoreRef: { name: 'store' }, data: [{ secretKey: 'key', remoteRef: { key: 'remote', property: 'old', version: '9007199254740993' }, sourceRef: { hidden: true } }] } });
    render(<ExternalSecretsEditor {...form} />);
    fireEvent.change(screen.getByLabelText('Remote property'), { target: { value: 'next' } });
    expect(form.patch).toHaveBeenCalledWith({ sessionID: 'eso-test', expectedRevision: 3, operations: [{ op: 'set', path: ['spec', 'data', 0, 'remoteRef', 'property'], value: 'next' }] });
  });
  it('retains an incomplete seconds field locally without altering canonical source', () => {
    const form = fixture('SecretStore', { spec: { refreshInterval: 60 } }, 'advanced');
    render(<ExternalSecretsEditor {...form} />);
    fireEvent.change(screen.getByLabelText('Store refresh (seconds)'), { target: { value: '-' } });
    expect(form.patch).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Store refresh (seconds)') as HTMLInputElement).value).toBe('-');
    expect(screen.getByRole('alert').textContent).toContain('whole number');
  });
  it('controller-owned children have no mutating controls or provider failure text', () => {
    const form = fixture('PushSecret', { metadata: { ownerReferences: [{ kind: 'ClusterPushSecret', name: 'parent', controller: true }] }, status: { conditions: [{ message: 'DO_NOT_RENDER' }] } });
    expect(generated(form.draft, form.context)).toBe(true);
    render(<ExternalSecretsEditor {...form} />);
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull();
    expect(screen.queryByText('DO_NOT_RENDER')).toBeNull();
    expect(form.patch).not.toHaveBeenCalled();
  });
  it('validates cluster credential namespaces and conflicting auth branches', () => {
    const form = fixture('ClusterSecretStore', { spec: { provider: { aws: { service: 'SecretsManager', region: 'region', auth: { jwt: { serviceAccountRef: { name: 'sa' } }, secretRef: { accessKeyIDSecretRef: { name: 'creds', key: 'id' }, secretAccessKeySecretRef: { name: 'creds', key: 'key' } } } } } } });
    const issues = validate(form.draft, form.context);
    expect(issues.some(issue => issue.message.includes('one authentication'))).toBe(true);
    expect(issues.filter(issue => issue.message.includes('namespace'))).toHaveLength(3);
  });
  it('allows a generator source without inventing a Secret and validates nested fan-out mappings', () => {
    const form = fixture('ClusterPushSecret', { spec: { pushSecretSpec: { selector: { generatorRef: { kind: 'Password', name: 'generator' } }, secretStoreRefs: [{ name: 'store' }], data: [{ match: { remoteRef: { remoteKey: '' } } }] } } });
    const issues = validate(form.draft, form.context);
    expect(issues.some(issue => issue.message.includes('source Secret'))).toBe(false);
    expect(issues).toContainEqual({ path: ['spec', 'pushSecretSpec', 'data', 0, 'match', 'remoteRef', 'remoteKey'], message: 'Enter a remote key.' });
  });
});
