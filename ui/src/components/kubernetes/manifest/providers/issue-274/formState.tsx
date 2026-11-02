import { useCallback, useEffect, useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorField, patchError, patchFields, type EditorFieldProps } from '../../editor-controls';
import { schedulingReadOnly } from './model';

export function useSchedulingForm(form: ResourceEditorFormProps) {
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const locked = form.disabled || schedulingReadOnly(form.draft, form.context) || form.context.discovery.status !== 'available' || form.context.schema.status !== 'available' || form.context.capabilities[form.context.intent === 'create' ? 'create' : 'update'] !== 'available';
  const report = useCallback((key: string, message: string | null) => setErrors(current => current[key] === message ? current : { ...current, [key]: message }), []);
  const error = Object.values(errors).find(Boolean) ?? null;
  useEffect(() => { form.onValidityChange(error); }, [error, form.onValidityChange]);
  useEffect(() => () => form.onValidityChange(null), [form.onValidityChange]);
  return { locked, report, error, apply: (operations: readonly ResourceEditorPatch[]) => {
    const failure = locked ? 'Editing is unavailable for this resource.' : patchError(patchFields(form, operations));
    report('patch', failure);
    return failure;
  } };
}

/** Local invalid text survives sibling changes; only canonical field changes reset it. */
export function BufferedField({ value, onCommit, validate, report, fieldKey, ...props }: Omit<EditorFieldProps, 'onChange'> & {
  fieldKey: string;
  validate(text: string): string | null;
  onCommit(text: string): string | null;
  report(key: string, error: string | null): void;
}) {
  const [buffer, setBuffer] = useState<{ canonical: string; text: string; error: string | null }>({ canonical: value, text: value, error: null });
  const current = buffer.canonical === value ? buffer : { canonical: value, text: value, error: null };
  useEffect(() => { if (buffer.canonical !== value) { setBuffer({ canonical: value, text: value, error: null }); report(fieldKey, null); } }, [value, buffer.canonical, fieldKey, report]);
  useEffect(() => () => report(fieldKey, null), [fieldKey, report]);
  return <EditorField {...props} value={current.text} error={current.error ?? props.error} onChange={text => {
    const error = validate(text) ?? onCommit(text);
    setBuffer({ canonical: error ? value : text, text, error });
    report(fieldKey, error);
  }} />;
}
