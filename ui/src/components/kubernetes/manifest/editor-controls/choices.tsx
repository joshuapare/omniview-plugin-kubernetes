import { useContext, useId } from 'react';
import { Select } from '@omniviewdev/base-ui';
import { EditorHelp, type EditorFieldProps } from './fields';
import { ResourcePortalContext } from '../ResourcePortalContext';

export interface EditorChoiceProps extends Omit<EditorFieldProps, 'inputMode' | 'list' | 'placeholder' | 'type'> {
  options: readonly { value: string; label: string }[];
}
export function EditorChoice({ label, value, options, onChange, disabled, readOnly, help, error }: EditorChoiceProps) {
  const id = useId();
  const container = useContext(ResourcePortalContext);
  const items = options.some(option => option.value === value) || !value ? options : [{ value, label: `${value} (current)` }, ...options];
  return <div className="resource-editor-field"><div className="resource-editor-label"><label id={id}>{label}</label>{help && <EditorHelp label={label}>{help}</EditorHelp>}</div>
    <Select.Root value={value} items={items} disabled={disabled || readOnly} size="sm" onValueChange={next => { if (next !== null) onChange(next); }}>
      <Select.Trigger aria-labelledby={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}><Select.Value /></Select.Trigger>
      <Select.Portal container={container}><Select.Positioner sideOffset={4}><Select.Popup><Select.List>{items.map(option => <Select.Item key={option.value} value={option.value}><Select.ItemText>{option.label}</Select.ItemText></Select.Item>)}</Select.List></Select.Popup></Select.Positioner></Select.Portal>
    </Select.Root>{error && <span id={`${id}-error`} role="alert" className="resource-editor-error">{error}</span>}
  </div>;
}
