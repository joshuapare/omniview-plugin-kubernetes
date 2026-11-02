import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawerContext } from '@omniviewdev/runtime';
import { parse, stringify } from 'yaml';
import type { KubernetesResourceObject } from '../../../../../types/resource';
import BaseEditorPage from './BaseEditorPage';
import type { ResourceManifestEditorProps } from '../../../../kubernetes/manifest/ResourceManifestEditor';
import { validateEditorSource, type ResourceEditorPreparedSubmission } from '../../../../kubernetes/manifest/resourceEditorSubmission';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  encode: vi.fn((value: unknown) => value),
  capabilities: [{ operation: 'mutationUpdate', scope: [{ dimension: 'namespace', match: 'oneOf', values: ['original'] }] }],
}));
vi.mock('@omniviewdev/runtime', () => ({
  useResourceMutations: () => ({ mutate: mocks.mutate }),
  useResourceEditorModelPath: () => undefined,
  useResourceTypes: () => ({ resourceTypes: { data: [{ type: 'k8s:/pods', capabilities: mocks.capabilities, identityDimensions: [{ name: 'namespace' }], representations: [{ id: 'kubernetes.object.v1/v1', schema: { state: 'absent' } }] }] } }),
  jsonToValue: mocks.encode,
  valueToJSON: (value: unknown) => value,
  parseAppError: (error: Error) => ({ detail: error.message }),
}));
vi.mock('@omniviewdev/base-ui', () => ({
  Stack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Button: ({ children, disabled, onClick }: React.PropsWithChildren<{ disabled?: boolean; onClick?: () => void }>) => <button disabled={disabled} onClick={onClick}>{children}</button>,
}));
vi.mock('../../../../kubernetes/manifest/ResourceManifestEditor', () => ({ default: function Editor({ value, baseline, disabled, onChange, submissionRef, editorContext }: ResourceManifestEditorProps) {
  const current = React.useRef(value); current.current = value;
  React.useImperativeHandle(submissionRef, () => ({ prepare: async (signal: AbortSignal): Promise<ResourceEditorPreparedSubmission> => {
    const error = validateEditorSource(value, editorContext!, baseline);
    return error ? { status: 'invalid', message: error } : { status: 'ready', source: value, sessionID: 'fixture', revision: 0, isCurrent: () => !signal.aborted && current.current === value };
  } }), [value, baseline, editorContext]);
  return <><textarea aria-label="Resource YAML" value={value} readOnly={disabled} onChange={(event) => onChange(event.target.value)} /><pre data-testid="baseline">{baseline}</pre></>;
} }));

const original = { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'pod', namespace: 'original', uid: 'native-uid' }, spec: { containers: [{ name: 'main', image: 'nginx:1.27' }], marker: 'original' } };
function context(connection = 'cluster', data: KubernetesResourceObject = original): DrawerContext<KubernetesResourceObject> {
  return {
    data,
    resource: {
      pluginID: 'kubernetes', targetId: 'host-target', key: 'host-key',
      route: { connection }, representation: 'native-v1',
      reference: { address: { provider: 'kubernetes', authority: 'host-authority', type: 'k8s:/pods', scope: [{ dimension: 'namespace', value: 'original' }], id: 'pod' }, incarnation: 'native-uid' },
      record: { record: { sourceRevision: 'revision-1' } },
    },
  } as unknown as DrawerContext<KubernetesResourceObject>;
}
const draft = () => screen.getByRole('textbox', { name: 'Resource YAML' }) as HTMLTextAreaElement;

beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.encode.mockClear();
  mocks.capabilities = [{ operation: 'mutationUpdate', scope: [{ dimension: 'namespace', match: 'oneOf', values: ['original'] }] }];
});

describe('contextual resource editor', () => {
  it('saves against the admitted identity and revision while preserving exact payload values', async () => {
    const ctx = context();
    const edited = { ...original, spec: { ...original.spec, count: 9007199254740993n } };
    const saved = { ...original, spec: { ...original.spec, marker: 'saved' } };
    const { promise, resolve } = Promise.withResolvers<unknown>();
    mocks.mutate.mockReturnValue(promise);
    render(<BaseEditorPage ctx={ctx} />);
    fireEvent.change(draft(), { target: { value: stringify(edited) } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(mocks.encode).toHaveBeenCalledWith(edited));
    expect(mocks.mutate).toHaveBeenCalledWith({
      route: ctx.resource!.route, reference: ctx.resource!.reference,
      operation: 'update', input: edited, expectedRevision: 'revision-1',
    });
    expect(draft().readOnly).toBe(true);
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
    await act(async () => { resolve({ body: saved, sourceRevision: 'revision-2' }); });
    expect(parse(draft().value)).toEqual(saved);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    fireEvent.change(draft(), { target: { value: stringify({ ...saved, spec: { ...saved.spec, marker: 'again' } }) } });
    mocks.mutate.mockResolvedValue({ body: saved, sourceRevision: 'revision-3' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: 'revision-2' })));
  });

  it('rejects identity changes without encoding or mutating and keeps the draft recoverable', async () => {
    render(<BaseEditorPage ctx={context()} />);
    const edited = stringify({ ...original, metadata: { ...original.metadata, name: 'other', namespace: 'elsewhere' } });
    fireEvent.change(draft(), { target: { value: edited } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Resource identity and revision cannot change');
    expect(mocks.encode).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(draft().value).toBe(edited);
  });

  it('preserves drafts during refetch, but resets drafts when contextual route changes', () => {
    const ctx = context();
    const view = render(<BaseEditorPage ctx={ctx} />);
    const edited = stringify({ ...original, spec: { ...original.spec, marker: 'unsaved' } });
    fireEvent.change(draft(), { target: { value: edited } });
    const refreshed = { ...original, spec: { ...original.spec, marker: 'refetched' } };
    view.rerender(<BaseEditorPage ctx={context('cluster', refreshed)} />);
    expect(draft().value).toBe(edited);
    expect(screen.getByTestId('baseline').textContent).toBe(stringify(original));
    view.rerender(<BaseEditorPage ctx={context('other-cluster', refreshed)} />);
    expect(parse(draft().value)).toEqual(refreshed);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('keeps failed saves recoverable and rejects malformed YAML before mutation', async () => {
    mocks.mutate.mockRejectedValue(new Error('Revision conflict'));
    render(<BaseEditorPage ctx={context()} />);
    fireEvent.change(draft(), { target: { value: 'spec: [' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
    const edited = stringify({ ...original, spec: { ...original.spec, marker: 'unsaved' } });
    fireEvent.change(draft(), { target: { value: edited } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText('Resource update failed. Check connection, permissions and server policy.');
    expect(draft().value).toBe(edited);
    expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(parse(draft().value)).toEqual(original);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not infer write support from watch updates', () => {
    mocks.capabilities = [{ operation: 'update', scope: [] }];
    render(<BaseEditorPage ctx={context()} />);
    fireEvent.change(draft(), { target: { value: stringify({ ...original, spec: {} }) } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('does not advertise update support');
  });
});
