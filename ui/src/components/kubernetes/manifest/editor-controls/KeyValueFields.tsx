import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { useRef, useState } from 'react';

import { patchError, removeDraftField, renameDraftKey, scalarText, setDraftField } from './draft';
import { EditorField, ExactValueField } from './fields';
import { useFieldValidity } from './validity';

export interface KeyValueFieldsProps {
  form: ResourceEditorFormProps;
  path: ResourceEditorPath;
  label: string;
  validateKey?: (key: string) => string | null;
  validateValue?: (value: string) => string | null;
}
/** Text maps only. Opaque/non-text entries remain untouched and never serialize. */
export function KeyValueFields(props: KeyValueFieldsProps) {
  return <KeyValueSession key={`${props.form.draft.sessionID}:${JSON.stringify(props.path)}`} {...props} />;
}
function KeyValueSession({ form, path, label, validateKey, validateValue }: KeyValueFieldsProps) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const validity = useFieldValidity(form);
  const newKey = useRef<HTMLInputElement>(null);
  const map = form.draft.get(path);
  const keys = map && typeof map === 'object' && !Array.isArray(map) ? Object.keys(map).filter(key => typeof form.draft.get([...path, key]) === 'string') : [];
  function pending(nextKey: string, nextValue: string) {
    const message = nextKey || nextValue ? 'Add or clear the pending entry.' : null;
    setError(message);
    validity('new', message);
  }
  return <div className="resource-editor-map" role="group" aria-label={label}>
    {keys.map(name => <KeyValueRow key={name} label={label} form={form} path={path} name={name} validateKey={validateKey} validateValue={validateValue} focusNew={() => newKey.current?.focus()} />)}
    <div className="resource-editor-map-row"><EditorField inputRef={newKey} label={`New ${label} key`} value={key} onChange={next => { setKey(next); pending(next, value); }} disabled={form.disabled} /><EditorField label={`New ${label} value`} value={value} onChange={next => { setValue(next); pending(key, next); }} disabled={form.disabled} />
      <Button size="sm" disabled={form.disabled} onClick={() => {
        const invalid = !key ? 'Enter a key.' : validateKey?.(key) ?? validateValue?.(value) ?? (form.draft.has([...path, key]) ? 'Key already exists.' : null);
        const failure = invalid ?? patchError(setDraftField(form, [...path, key], value));
        setError(failure);
        validity('new', failure);
        if (!failure) { setKey(''); setValue(''); newKey.current?.focus(); }
      }}>Add {label}</Button></div>
    {error && <span role="alert" className="resource-editor-error">{error}</span>}
  </div>;
}
function KeyValueRow({ form, path, name, validateKey, validateValue, focusNew }: KeyValueFieldsProps & { name: string; focusNew: () => void }) {
  const [nextName, setNextName] = useState(name);
  const [keyError, setKeyError] = useState<string | null>(null);
  const validity = useFieldValidity(form);
  return <div className="resource-editor-map-row"><div>
    <EditorField label={`Key ${name}`} value={nextName} error={keyError} disabled={form.disabled} onChange={next => {
      setNextName(next);
      const error = next === name ? null : validateKey?.(next) ?? 'Rename or restore the pending key.';
      setKeyError(error);
      validity('key', error);
    }} />
    <Button size="sm" disabled={form.disabled || nextName === name} onClick={() => {
      const failure = validateKey?.(nextName) ?? patchError(renameDraftKey(form, path, name, nextName));
      setKeyError(failure);
      validity('key', failure);
      if (!failure) focusNew();
    }}>Rename</Button></div>
    <ExactValueField label={`Value ${name}`} value={scalarText(form.draft.get([...path, name]))} identity={`${form.draft.sessionID}:${JSON.stringify([...path, name])}`} disabled={form.disabled} parse={value => { const error = validateValue?.(value); return error ? { valid: false, error } : { valid: true, value }; }} onCommit={value => patchError(setDraftField(form, [...path, name], value))} onValidityChange={error => validity('value', error)} />
    <Button size="sm" variant="ghost" disabled={form.disabled} aria-label={`Remove ${name}`} onClick={() => {
      const failure = patchError(removeDraftField(form, [...path, name]));
      setKeyError(failure);
      validity('action', failure);
      if (!failure) focusNew();
    }}>Remove</Button>
  </div>;
}
