import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { useCallback, useEffect, useState } from 'react';

import { patchError, patchFields } from '../../editor-controls';

import { schedulingReadOnly } from './model';

export function useSchedulingForm(form: ResourceEditorFormProps) {
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const locked = form.disabled || schedulingReadOnly(form.draft, form.context) || form.context.discovery.status !== 'available' || form.context.schema.status !== 'available' || form.context.capabilities[form.context.intent === 'create' ? 'create' : 'update'] !== 'available';
  const report = useCallback((key: string, message: string | null) => setErrors(current => current[key] === message ? current : { ...current, [key]: message }), []);
  const error = Object.values(errors).find(Boolean) ?? null;
  const { onValidityChange } = form;
  useEffect(() => { onValidityChange(error); }, [error, onValidityChange]);
  useEffect(() => () => onValidityChange(null), [onValidityChange]);
  return { locked, report, error, apply: (operations: readonly ResourceEditorPatch[]) => {
    const failure = locked ? 'Editing is unavailable for this resource.' : patchError(patchFields(form, operations));
    report('patch', failure);
    return failure;
  } };
}
