import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UpdateRequestForm } from './forms';

afterEach(cleanup);

function inspection(retryCount: unknown): ResourceEditorFormProps {
  const root = { spec: { policy: 'fixture-policy', rule: 'fixture-rule', requestType: 'mutate' }, status: { state: 'Failed', retryCount } };
  const get = (path: ResourceEditorPath): unknown => path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, root);
  return {
    context: { group: 'kyverno.io', version: 'v1beta1', kind: 'UpdateRequest', resource: 'updaterequests', scope: 'Namespaced', connectionID: 'fixture', intent: 'inspect', ownership: { status: 'controller' }, capabilities: { create: 'available', update: 'available', delete: 'available', list: 'available', get: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } },
    draft: { sessionID: 'retry-inspection', revision: 0, get, has: path => get(path) !== undefined },
    section: 'status', disabled: true,
    patch: () => { throw new Error('Read-only inspection must not patch.'); },
    onValidityChange: () => {},
    references: { list: async () => ({ status: 'ready', items: [] }) },
    actions: { execute: async () => ({ status: 'unavailable', message: 'Read-only fixture.' }) },
  };
}

describe('UpdateRequest retry inspection', () => {
  it.each([0n, 2n, 9007199254740993n])('shows canonical integer %s exactly', retryCount => {
    render(<UpdateRequestForm {...inspection(retryCount)} />);
    const row = screen.getByText('Retries').parentElement!;
    expect(within(row).getByRole('definition').textContent).toBe(String(retryCount));
  });

  it('does not stringify protected counter projections', () => {
    render(<UpdateRequestForm {...inspection({ toString() { throw new Error('Protected projection must not be coerced.'); } })} />);
    const row = screen.getByText('Retries').parentElement!;
    expect(within(row).getByRole('definition').textContent).toBe('Unavailable');
  });
});
