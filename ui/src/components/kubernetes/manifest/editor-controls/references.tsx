import { useEffect, useId, useRef, useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorReferenceRequest, ResourceEditorReferenceResult } from '@omniviewdev/runtime';
import { EditorField, type EditorFieldProps } from './fields';

export type ReferenceQuery = Pick<ResourceEditorReferenceRequest, 'group' | 'version' | 'resource' | 'namespace' | 'projection'>;
export type ReferenceState = ResourceEditorReferenceResult | { status: 'loading' };

/** Revision, service identity and query changes cancel prior lookup generations. */
export function useEditorReferences(form: ResourceEditorFormProps, query: ReferenceQuery): ReferenceState {
  const [state, setState] = useState<ReferenceState>({ status: 'loading' });
  const generation = useRef(0);
  const { group, version, resource, namespace, projection } = query;
  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setState({ status: 'loading' });
    void form.references.list({ group, version, resource, namespace, projection, sessionID: form.draft.sessionID, generation: current, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted && current === generation.current) setState(result);
    }, () => {
      if (!controller.signal.aborted && current === generation.current) setState({ status: 'unavailable', message: 'Reference lookup unavailable.' });
    });
    return () => controller.abort();
  }, [form.references, form.draft.sessionID, form.draft.revision, form.patch, group, version, resource, namespace, projection]);
  return state;
}

export interface ReferencePickerProps extends Omit<EditorFieldProps, 'list'> {
  form: ResourceEditorFormProps;
  query: ReferenceQuery;
}
/** Suggestions never constrain manual names or erase unresolved existing values. */
export function ReferencePicker({ form, query, ...field }: ReferencePickerProps) {
  const state = useEditorReferences(form, query);
  const list = useId();
  let message: string;
  if (state.status === 'loading') message = 'Loading references…';
  else if (state.status === 'ready') message = state.items.length === 0 ? 'No references found. Enter a name manually.' : field.value && !state.items.some(item => item.name === field.value) ? 'Name is unresolved. Manual value retained.' : `${state.items.length} references available.`;
  else message = state.status === 'denied' ? 'Reference access denied. Enter a name manually.' : state.status === 'absent' ? 'Reference API is absent. Manual value retained.' : 'Reference lookup unavailable. Enter a name manually.';
  return <div><EditorField {...field} disabled={field.disabled || form.disabled} list={list} /><datalist id={list}>{state.status === 'ready' && state.items.map(item => <option key={`${item.namespace ?? ''}/${item.name}`} value={item.name} />)}</datalist><div role="status" className="resource-editor-reference-state" data-state={state.status === 'ready' && !state.items.length ? 'empty' : state.status}>{message}</div></div>;
}
