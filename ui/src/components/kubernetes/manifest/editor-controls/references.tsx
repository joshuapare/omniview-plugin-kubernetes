import type { ResourceEditorFormProps, ResourceEditorReferenceRequest, ResourceEditorReferenceResult } from '@omniviewdev/runtime';
import { useEffect, useId, useMemo, useState } from 'react';

import { EditorField, type EditorFieldProps } from './fields';

export type ReferenceQuery = Pick<ResourceEditorReferenceRequest, 'group' | 'version' | 'resource' | 'namespace' | 'projection'>;
export type ReferenceState = ResourceEditorReferenceResult | { status: 'loading' };

let nextGeneration = 0;

/**
 * Session/revision, service and query changes cancel reads. Write admission changes
 * (including submission locks rotating patch) do not invalidate read-only metadata.
 */
export function useEditorReferences(form: ResourceEditorFormProps, query: ReferenceQuery): ReferenceState {
  const { group, version, resource, namespace, projection } = query;
  const { references, draft } = form;
  const request = useMemo(() => ({ group, version, resource, namespace, projection, sessionID: draft.sessionID, revision: draft.revision, references }),
    [group, version, resource, namespace, projection, draft.sessionID, draft.revision, references]);
  const [completed, setCompleted] = useState<{ request: typeof request; result: ResourceEditorReferenceResult } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const generation = ++nextGeneration;
    void request.references.list({ group: request.group, version: request.version, resource: request.resource, namespace: request.namespace, projection: request.projection, sessionID: request.sessionID, generation, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setCompleted({ request, result });
    }, () => {
      if (!controller.signal.aborted) setCompleted({ request, result: { status: 'unavailable', message: 'Reference lookup unavailable.' } });
    });
    return () => controller.abort();
  }, [request]);
  return completed?.request === request ? completed.result : { status: 'loading' };
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
