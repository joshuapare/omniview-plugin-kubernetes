import { Button } from '@omniviewdev/base-ui';
import { useRef, useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorField, ExactValueField } from './fields';
import { patchError, removeDraftField, renameDraftKey, setDraftField } from './draft';
import { useFieldValidity } from './validity';

export interface KeyValueFieldsProps {
  form: ResourceEditorFormProps;
  path: ResourceEditorPath;
  label: string;
  validateKey?(key: string): string | null;
  validateValue?(value: string): string | null;
}
/** Text maps only. Opaque/non-text entries remain untouched, never rendered or serialized. */
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
  function report(message: string | null, field = 'new') { setError(message); validity(field, message); }
  return <div className="resource-editor-map" role="group" aria-label={label}>
    {keys.map(name => <KeyValueRow key={name} label={label} form={form} path={path} name={name} validateKey={validateKey} validateValue={validateValue} report={message => report(message, name)} focusNew={() => newKey.current?.focus()} />)}
    <div className="resource-editor-map-row"><EditorField inputRef={newKey} label={`New ${label} key`} value={key} onChange={setKey} disabled={form.disabled} /><EditorField label={`New ${label} value`} value={value} onChange={setValue} disabled={form.disabled} />
      <Button size="sm" disabled={form.disabled} onClick={() => {
        const invalid = !key ? 'Enter a key.' : validateKey?.(key) ?? validateValue?.(value) ?? (form.draft.has([...path, key]) ? 'Key already exists.' : null);
        if (invalid) { report(invalid); return; }
        const failure = patchError(setDraftField(form, [...path, key], value));
        report(failure);
        if (!failure) { setKey(''); setValue(''); newKey.current?.focus(); }
      }}>Add {label}</Button></div>
    {error && <span role="alert" className="resource-editor-error">{error}</span>}
  </div>;
}
function KeyValueRow({ form, path, name, validateKey, validateValue, report, focusNew }: KeyValueFieldsProps & { name: string; report(error: string | null): void; focusNew(): void }) {
  const [nextName, setNextName] = useState(name);
  return <div className="resource-editor-map-row"><div><EditorField label={`Key ${name}`} value={nextName} disabled={form.disabled} onChange={setNextName} /><Button size="sm" disabled={form.disabled || nextName === name} onClick={() => { const failure = validateKey?.(nextName) ?? patchError(renameDraftKey(form, path, name, nextName)); report(failure); if (!failure) focusNew(); }}>Rename</Button></div>
    <ExactValueField label={`Value ${name}`} value={String(form.draft.get([...path, name]))} identity={`${form.draft.sessionID}:${JSON.stringify([...path, name])}`} disabled={form.disabled} parse={value => { const error = validateValue?.(value); return error ? { valid: false, error } : { valid: true, value }; }} onCommit={value => patchError(setDraftField(form, [...path, name], value))} onValidityChange={report} />
    <Button size="sm" variant="ghost" disabled={form.disabled} aria-label={`Remove ${name}`} onClick={() => { const failure = patchError(removeDraftField(form, [...path, name])); report(failure); if (!failure) focusNew(); }}>Remove</Button>
  </div>;
}
