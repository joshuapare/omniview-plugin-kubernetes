import { Dialog } from '@omniviewdev/base-ui';
import { useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorReferenceResult } from '@omniviewdev/runtime';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditorField, EditorHelp, ExactValueField, KeyValueFields, ReferencePicker, parseExactInteger, renameDraftKey, setDraftField, useFieldValidity } from './index';

afterEach(cleanup);
function form(values: Record<string, unknown> = {}): ResourceEditorFormProps {
  const get = (path: readonly (string | number)[]) => path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string | number, unknown>)[key] : undefined, values);
  return {
    context: { group: '', version: 'v1', kind: 'ConfigMap', resource: 'configmaps', scope: 'Namespaced', connectionID: 'fixture', intent: 'edit', capabilities: { create: 'available', update: 'available', delete: 'available', get: 'available', list: 'available', actions: {} }, discovery: { status: 'available', features: {} }, schema: { status: 'available' } },
    draft: { sessionID: 'session', revision: 4, get, has: path => get(path) !== undefined }, section: 'test', disabled: false,
    patch: vi.fn(() => ({ status: 'accepted' as const, revision: 5 })), onValidityChange: vi.fn(),
    references: { list: vi.fn(async () => ({ status: 'ready' as const, items: [] })) },
    actions: { execute: vi.fn(async () => ({ status: 'unavailable' as const, message: 'Fixture only' })) },
  };
}

describe('exact local drafts', () => {
  it('retains partial input, uses bigint and preserves partials across sibling revisions', () => {
    const commit = vi.fn(() => null);
    const validity = vi.fn();
    const props = { label: 'Count', value: '2', identity: 'session:count', parse: parseExactInteger, onCommit: commit, onValidityChange: validity };
    const view = render(<ExactValueField {...props} />);
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '-' } });
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('whole number');
    view.rerender(<ExactValueField {...props} onCommit={commit} />);
    expect((screen.getByLabelText('Count') as HTMLInputElement).value).toBe('-');
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '900719925474099312345' } });
    expect(commit).toHaveBeenCalledWith(900719925474099312345n);
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('lets quantity adapters preserve exact text and retain incomplete units', () => {
    const commit = vi.fn(() => null);
    render(<ExactValueField label="Storage" identity="session:storage" value="1Gi" parse={text => /^\d+Gi$/.test(text) ? { valid: true, value: text } : { valid: false, error: 'Complete the quantity.' }} onCommit={commit} onValidityChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Storage'), { target: { value: '9007199254740993G' } });
    expect(commit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Storage'), { target: { value: '9007199254740993Gi' } });
    expect(commit).toHaveBeenCalledWith('9007199254740993Gi');
  });
  it('resets local input for another session and links visible errors', () => {
    const props = { label: 'Count', value: '2', identity: 'first', parse: parseExactInteger, onCommit: () => null, onValidityChange: vi.fn() };
    const view = render(<ExactValueField {...props} />);
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '-' } });
    expect(screen.getByLabelText('Count').getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    view.rerender(<ExactValueField {...props} identity="second" value="7" />);
    expect((screen.getByLabelText('Count') as HTMLInputElement).value).toBe('7');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('leaf map operations', () => {
  it('renames atomically and never replaces a projected map or opaque sibling', () => {
    const props = form({ labels: { app: 'api', unrelated: 'keep', hidden: Object.freeze({ opaque: true }) } });
    render(<KeyValueFields form={props} path={['labels']} label="Label" />);
    fireEvent.change(screen.getByLabelText('Key app'), { target: { value: 'component' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0]);
    expect(props.patch).toHaveBeenCalledWith({ sessionID: 'session', expectedRevision: 4, operations: [{ op: 'set', path: ['labels', 'component'], value: 'api' }, { op: 'remove', path: ['labels', 'app'] }] });
    expect(screen.queryByLabelText('Value hidden')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove unrelated' }));
    expect(props.patch).toHaveBeenLastCalledWith({ sessionID: 'session', expectedRevision: 4, operations: [{ op: 'remove', path: ['labels', 'unrelated'] }] });
    expect(document.activeElement).toBe(screen.getByLabelText('New Label key'));
  });
  it('blocks duplicate adds and invalid values without changing source', () => {
    const props = form({ labels: { app: 'api' } });
    render(<KeyValueFields form={props} path={['labels']} label="Label" validateValue={value => value.includes(' ') ? 'No spaces.' : null} />);
    fireEvent.change(screen.getByLabelText('New Label key'), { target: { value: 'app' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Label' }));
    expect(props.patch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Value app'), { target: { value: 'invalid value' } });
    expect(props.patch).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Value app') as HTMLInputElement).value).toBe('invalid value');
  });
  it('rejects disabled, opaque, unsafe numeric and duplicate renames', () => {
    const props = form({ labels: { app: 'api', other: 'keep' } });
    expect(renameDraftKey(props, ['labels'], 'app', 'other').status).toBe('invalid');
    expect(setDraftField(props, ['n'], Number.MAX_SAFE_INTEGER + 1).status).toBe('unsafe');
    expect(setDraftField(props, ['n'], { opaque: true } as never).status).toBe('unsafe');
    expect(setDraftField({ ...props, disabled: true }, ['n'], 'new').status).toBe('forbidden');
    expect(props.patch).not.toHaveBeenCalled();
  });
});

describe('reference lookup state and cancellation', () => {
  it.each(['denied', 'absent', 'unavailable'] as const)('keeps manual names during %s', async status => {
    const props = form();
    props.references.list = vi.fn(async () => ({ status, message: 'safe' }));
    const onChange = vi.fn();
    render(<ReferencePicker form={props} query={{ group: '', version: 'v1', resource: 'services' }} label="Service" value="unresolved" onChange={onChange} />);
    await screen.findByText(status === 'denied' ? /access denied/ : status === 'absent' ? /API is absent/ : /lookup unavailable/);
    expect((screen.getByLabelText('Service') as HTMLInputElement).value).toBe('unresolved');
    fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'manual' } });
    expect(onChange).toHaveBeenCalledWith('manual');
  });
  it('distinguishes loading, empty and unresolved; aborts obsolete query results', async () => {
    const props = form();
    const { promise: first, resolve } = Promise.withResolvers<ResourceEditorReferenceResult>();
    const list = vi.fn().mockReturnValueOnce(first).mockResolvedValue({ status: 'ready', items: [] });
    props.references.list = list;
    const field = { form: props, label: 'Reference', value: 'manual', onChange: vi.fn() };
    const view = render(<ReferencePicker {...field} query={{ group: '', version: 'v1', resource: 'services' }} />);
    expect(screen.getByRole('status').textContent).toContain('Loading');
    view.rerender(<ReferencePicker {...field} query={{ group: '', version: 'v1', resource: 'secrets' }} />);
    await screen.findByText(/No references found/);
    expect(list.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => { resolve({ status: 'ready', items: [{ name: 'obsolete' }] }); await first; });
    expect(screen.queryByDisplayValue('obsolete')).toBeNull();
    expect(screen.getByRole('status').getAttribute('data-state')).toBe('empty');
  });
});

it('does not let valid sibling fields clear another field error', () => {
  const props = form();
  function Fields() {
    const validity = useFieldValidity(props);
    return <><EditorField label="First" value="" onChange={() => validity('first', 'First invalid')} /><EditorField label="Second" value="" onChange={() => validity('second', null)} /></>;
  }
  render(<Fields />);
  fireEvent.change(screen.getByLabelText('First'), { target: { value: 'x' } });
  fireEvent.change(screen.getByLabelText('Second'), { target: { value: 'x' } });
  expect(props.onValidityChange).toHaveBeenLastCalledWith('First invalid');
});

it('composes hover/focus help and pinned click help with Escape focus return', async () => {
  const user = userEvent.setup();
  render(<EditorHelp label="Budget">Budget semantics</EditorHelp>);
  const trigger = screen.getByRole('button', { name: 'Help: Budget' });
  await user.hover(trigger);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Budget semantics');
  await user.unhover(trigger);
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  await user.tab();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Budget semantics');
  await user.click(trigger);
  expect(await screen.findByRole('dialog', { name: 'Help: Budget' })).toHaveTextContent('Budget semantics');
  const outerEscape = vi.fn();
  window.addEventListener('keydown', outerEscape);
  try {
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(outerEscape).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('keydown', outerEscape);
  }
});

it('dismisses help before the real create dialog and preserves the draft until the next Escape', async () => {
  const user = userEvent.setup();
  function CreateDialog() {
    const [open, setOpen] = useState(true);
    const [draft, setDraft] = useState('keep this draft');
    return <Dialog open={open} onClose={() => setOpen(false)}>
      <Dialog.Title>Create resource</Dialog.Title>
      <EditorField label="Name" value={draft} onChange={setDraft} help="Name semantics" />
    </Dialog>;
  }
  render(<CreateDialog />);
  const trigger = screen.getByRole('button', { name: 'Help: Name' });
  await user.click(trigger);
  expect(await screen.findByRole('dialog', { name: 'Help: Name' })).toBeVisible();
  trigger.focus();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Help: Name' })).toBeNull());
  expect(screen.getByRole('dialog', { name: 'Create resource' })).toBeVisible();
  expect(screen.getByLabelText('Name')).toHaveValue('keep this draft');
  expect(document.activeElement).toBe(trigger);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create resource' })).toBeNull());
});

it('aggregates independent child hooks and removes only the unmounted child bucket', () => {
  const props = form();
  function Child({ name }: { name: string }) {
    const validity = useFieldValidity(props);
    return <EditorField label={name} value="" onChange={value => validity(name, value === 'valid' ? null : `${name} invalid`)} />;
  }
  const view = render(<><Child name="First" /><Child name="Second" /></>);
  fireEvent.change(screen.getByLabelText('First'), { target: { value: 'bad' } });
  fireEvent.change(screen.getByLabelText('Second'), { target: { value: 'valid' } });
  expect(props.onValidityChange).toHaveBeenLastCalledWith('First invalid');
  fireEvent.change(screen.getByLabelText('Second'), { target: { value: 'bad' } });
  view.rerender(<><Child name="First" /></>);
  expect(props.onValidityChange).toHaveBeenLastCalledWith('First invalid');
  fireEvent.change(screen.getByLabelText('First'), { target: { value: 'valid' } });
  expect(props.onValidityChange).toHaveBeenLastCalledWith(null);
});

it('does not share validity between distinct host callbacks', () => {
  const first = form();
  const second = form();
  function Child({ props, label }: { props: ResourceEditorFormProps; label: string }) {
    const validity = useFieldValidity(props);
    return <EditorField label={label} value="" onChange={() => validity('same-path', `${label} invalid`)} />;
  }
  render(<><Child props={first} label="First editor" /><Child props={second} label="Second editor" /></>);
  fireEvent.change(screen.getByLabelText('First editor'), { target: { value: 'bad' } });
  expect(first.onValidityChange).toHaveBeenLastCalledWith('First editor invalid');
  expect(second.onValidityChange).toHaveBeenLastCalledWith(null);
});

it('keeps pending new entries and key renames blocking across sibling edits and row deletion', () => {
  const props = form({ labels: { app: 'api', side: 'keep' } });
  const validateValue = (value: string) => value.includes(' ') ? 'No spaces.' : null;
  const view = render(<KeyValueFields form={props} path={['labels']} label="Label" validateValue={validateValue} />);
  fireEvent.change(screen.getByLabelText('Value app'), { target: { value: 'invalid value' } });
  fireEvent.change(screen.getByLabelText('Key side'), { target: { value: 'renamed' } });
  expect(props.patch).not.toHaveBeenCalled();
  const next = { ...form({ labels: { side: 'keep' } }), onValidityChange: props.onValidityChange };
  view.rerender(<KeyValueFields form={next} path={['labels']} label="Label" validateValue={validateValue} />);
  expect(props.onValidityChange).toHaveBeenLastCalledWith('Rename or restore the pending key.');
  fireEvent.change(screen.getByLabelText('Key side'), { target: { value: 'side' } });
  expect(props.onValidityChange).toHaveBeenLastCalledWith(null);
  fireEvent.change(screen.getByLabelText('New Label key'), { target: { value: 'pending' } });
  fireEvent.change(screen.getByLabelText('Value side'), { target: { value: 'valid' } });
  expect(props.onValidityChange).toHaveBeenLastCalledWith('Add or clear the pending entry.');
  fireEvent.change(screen.getByLabelText('New Label key'), { target: { value: '' } });
  expect(props.onValidityChange).toHaveBeenLastCalledWith(null);
});

it('discards a partial exact draft when that field canonical value changes', () => {
  const validity = vi.fn();
  const props = { label: 'Count', value: '2', identity: 'same-session:count', parse: parseExactInteger, onCommit: () => null, onValidityChange: validity };
  const view = render(<ExactValueField {...props} />);
  fireEvent.change(screen.getByLabelText('Count'), { target: { value: '-' } });
  view.rerender(<ExactValueField {...props} value="7" />);
  expect((screen.getByLabelText('Count') as HTMLInputElement).value).toBe('7');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(validity).toHaveBeenLastCalledWith(null);
});

it('does not show previous reference results while a new revision is loading', async () => {
  const props = form();
  const { promise, resolve } = Promise.withResolvers<ResourceEditorReferenceResult>();
  props.references.list = vi.fn().mockResolvedValueOnce({ status: 'ready', items: [{ name: 'old' }] }).mockReturnValueOnce(promise);
  const field = { label: 'Service', value: 'manual', onChange: vi.fn(), query: { group: '', version: 'v1', resource: 'services' } };
  const view = render(<ReferencePicker {...field} form={props} />);
  await screen.findByText(/Name is unresolved/);
  view.rerender(<ReferencePicker {...field} form={{ ...props, draft: { ...props.draft, revision: 5 } }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  expect(screen.queryByDisplayValue('old')).toBeNull();
  await act(async () => { resolve({ status: 'ready', items: [] }); await promise; });
  expect(screen.getByRole('status').getAttribute('data-state')).toBe('empty');
});

it('keeps completed references ready when submission locks rotate only the write callback', async () => {
  const props = form();
  const list = vi.fn(async (_request: Parameters<ResourceEditorFormProps['references']['list']>[0]) => ({ status: 'ready' as const, items: [{ name: 'selected' }] }));
  props.references = { list };
  const field = { label: 'Service', value: 'selected', onChange: vi.fn(), query: { group: '', version: 'v1', resource: 'services' } };
  const view = render(<ReferencePicker {...field} form={props} />);
  await waitFor(() => expect(screen.getByRole('status')).toHaveAttribute('data-state', 'ready'));
  const signal = list.mock.calls[0][0].signal;
  const pendingPatch = vi.fn(() => ({ status: 'forbidden' as const, message: 'Submission is pending.' }));
  view.rerender(<ReferencePicker {...field} form={{ ...props, disabled: true, patch: pendingPatch }} />);
  expect(screen.getByRole('status')).toHaveAttribute('data-state', 'ready');
  expect(screen.getByLabelText('Service')).toBeDisabled();
  expect(list).toHaveBeenCalledTimes(1);
  expect(signal.aborted).toBe(false);
  const unlockedPatch = vi.fn((request: Parameters<ResourceEditorFormProps['patch']>[0]) => props.patch(request));
  view.rerender(<ReferencePicker {...field} form={{ ...props, patch: unlockedPatch }} />);
  expect(screen.getByRole('status')).toHaveAttribute('data-state', 'ready');
  expect(list).toHaveBeenCalledTimes(1);
  expect(pendingPatch).not.toHaveBeenCalled();
});

it('still aborts stale reads when the actual reference service changes', async () => {
  const props = form();
  const { promise, resolve } = Promise.withResolvers<ResourceEditorReferenceResult>();
  const first = vi.fn((_request: Parameters<ResourceEditorFormProps['references']['list']>[0]) => promise);
  const replacement = vi.fn(async (_request: Parameters<ResourceEditorFormProps['references']['list']>[0]) => ({ status: 'ready' as const, items: [] }));
  props.references = { list: first };
  const field = { label: 'Reference', value: 'manual', onChange: vi.fn(), query: { group: '', version: 'v1', resource: 'services' } };
  const view = render(<ReferencePicker {...field} form={props} />);
  view.rerender(<ReferencePicker {...field} form={{ ...props, references: { list: replacement } }} />);
  expect(first.mock.calls[0][0].signal.aborted).toBe(true);
  await waitFor(() => expect(screen.getByRole('status')).toHaveAttribute('data-state', 'empty'));
  await act(async () => { resolve({ status: 'ready', items: [{ name: 'obsolete' }] }); await promise; });
  expect(screen.getByRole('status')).toHaveAttribute('data-state', 'empty');
  expect(replacement).toHaveBeenCalledTimes(1);
});
