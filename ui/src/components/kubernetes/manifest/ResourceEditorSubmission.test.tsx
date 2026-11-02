import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorContribution, ResourceEditorFormProps } from '@omniviewdev/runtime';
import ResourceManifestEditor from './ResourceManifestEditor';
import type { ResourceEditorSubmissionHandle } from './resourceEditorSubmission';
import { setManifestMode } from './useManifestMode';

vi.mock('../../shared/CodeEditor', () => ({ default: ({ value, onChange, readOnly }: { value: string; onChange?: (value: string) => void; readOnly?: boolean }) => <textarea aria-label="Canonical YAML" value={value} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} /> }));
const source = 'apiVersion: demo.example/v1\nkind: Demo\nmetadata: {name: demo, namespace: team}\nspec: {message: old, token: private-fixture-value}\n';
const context: ResourceEditorContext = { group: 'demo.example', version: 'v1', kind: 'Demo', resource: 'demos', scope: 'Namespaced', connectionID: 'fixture-only', intent: 'create', capabilities: { create: 'available', update: 'available', delete: 'absent', get: 'available', list: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } };
const references = { list: vi.fn(async () => ({ status: 'ready' as const, items: [] })) };
const actions = { execute: vi.fn(async () => ({ status: 'unavailable' as const, message: 'Fixture-only transport.' })) };
function Form(props: ResourceEditorFormProps) {
  return <input aria-label="Message" value={String(props.draft.get(['spec', 'message']) ?? '')} onChange={(event) => props.patch({ sessionID: props.draft.sessionID, expectedRevision: props.draft.revision, operations: [{ op: 'set', path: ['spec', 'message'], value: event.target.value }] })} />;
}
const contribution: ResourceEditorContribution = { contractVersion: 1, targets: [context], intents: ['create'], ownershipPolicy: 'declarative', label: 'Demo', sections: [{ id: 'configuration', label: 'Configuration' }], ownedPaths: [['spec']], sensitivePaths: [['spec', 'token']], component: Form };

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); act(() => setManifestMode('yaml')); });
afterEach(cleanup);

describe('canonical submission preparation', () => {
  it('runs redacted async admission in YAML mode without mounting a form or executing mutations', async () => {
    const admission = vi.fn<NonNullable<ResourceEditorContribution['validateSubmission']>>(async (draft, _context, services, signal) => {
      expect(draft.get(['spec', 'token'])).not.toBe('private-fixture-value');
      expect(() => JSON.stringify(draft.get(['spec', 'token']))).toThrow('Hidden values');
      const forbidden = await services.actions.execute({ protocol: 'kubernetes.pod-eviction.v1', input: {}, sessionID: draft.sessionID, generation: draft.revision, signal });
      expect(forbidden.status).toBe('invalid');
      return [{ path: ['spec', 'message'], message: 'Prerequisite denied.' }];
    });
    const submission = createRef<ResourceEditorSubmissionHandle>();
    render(<ResourceManifestEditor value={source} onChange={vi.fn()} resourceKey="k8s:demo.example/demos" editorContext={context} contribution={{ ...contribution, validateSubmission: admission }} references={references} actions={actions} submissionRef={submission} />);
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
    expect(admission).not.toHaveBeenCalled();
    const prepared = await submission.current!.prepare(new AbortController().signal);
    expect(prepared).toEqual({ status: 'invalid', message: 'Prerequisite denied.' });
    expect(admission).toHaveBeenCalledTimes(1);
    expect(actions.execute).not.toHaveBeenCalled();
  });

  it('rejects a changed canonical revision after deferred prerequisite checks', async () => {
    const gate = Promise.withResolvers<readonly []>();
    const admission = vi.fn(async () => gate.promise);
    const provider = { ...contribution, validateSubmission: admission };
    const submission = createRef<ResourceEditorSubmissionHandle>();
    const view = render(<ResourceManifestEditor value={source} onChange={vi.fn()} resourceKey="k8s:demo.example/demos" editorContext={context} contribution={provider} references={references} actions={actions} submissionRef={submission} />);
    const prepared = submission.current!.prepare(new AbortController().signal);
    view.rerender(<ResourceManifestEditor value={source.replace('message: old', 'message: newer')} onChange={vi.fn()} resourceKey="k8s:demo.example/demos" editorContext={context} contribution={provider} references={references} actions={actions} submissionRef={submission} />);
    gate.resolve([]);
    expect((await prepared).status).toBe('stale');
  });

  it('keeps ready preparations bound to their original source until the actual commit', async () => {
    const submission = createRef<ResourceEditorSubmissionHandle>();
    const view = render(<ResourceManifestEditor value={source} onChange={vi.fn()} resourceKey="k8s:demo.example/demos" editorContext={context} contribution={contribution} references={references} actions={actions} submissionRef={submission} />);
    const prepared = await submission.current!.prepare(new AbortController().signal);
    expect(prepared.status).toBe('ready');
    if (prepared.status !== 'ready') throw new Error('Expected ready source');
    expect(prepared.source).toBe(source);
    expect(prepared.isCurrent()).toBe(true);
    view.rerender(<ResourceManifestEditor value={source.replace('message: old', 'message: newer')} onChange={vi.fn()} resourceKey="k8s:demo.example/demos" editorContext={context} contribution={contribution} references={references} actions={actions} submissionRef={submission} />);
    expect(prepared.isCurrent()).toBe(false);
  });

  it('preserves dirty source and its required admission when a provider unloads', async () => {
    act(() => setManifestMode('form'));
    const submission = createRef<ResourceEditorSubmissionHandle>();
    const provider = { ...contribution, validateSubmission: async () => [] };
    const observe = vi.fn();
    function Harness({ loaded }: { loaded: boolean }) {
      const [value, setValue] = useState(source);
      return <ResourceManifestEditor value={value} onChange={(next) => { setValue(next); observe(next); }} resourceKey="k8s:demo.example/demos" editorContext={context} contribution={loaded ? provider : undefined} references={references} actions={actions} submissionRef={submission} />;
    }
    const view = render(<Harness loaded />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'dirty' } });
    expect(observe.mock.lastCall?.[0]).toContain('message: dirty');
    view.rerender(<Harness loaded={false} />);
    expect(screen.getByLabelText('Canonical YAML')).toHaveAttribute('readonly');
    expect((screen.getByLabelText('Canonical YAML') as HTMLTextAreaElement).value).not.toContain('private-fixture-value');
    expect(await submission.current!.prepare(new AbortController().signal)).toEqual({ status: 'invalid', message: 'The resource editor admission provider is unavailable.' });
    expect(observe).toHaveBeenCalledTimes(1);
  });
});
