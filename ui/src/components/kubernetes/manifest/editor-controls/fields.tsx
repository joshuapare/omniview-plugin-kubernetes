import { Input, Popover, Tooltip } from '@omniviewdev/base-ui';
import { useContext, useEffect, useEffectEvent, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';

import { ResourcePortalContext } from '../ResourcePortalContext';

import './controls.css';

/** Existing primitives own positioning, focus, dismissal and hover timing. */
export function EditorHelp({ label, children }: { label: string; children: ReactNode }) {
  const container = useContext(ResourcePortalContext);
  const previewID = useId();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const suppressPreview = useRef(false);
  function closeOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !open && !preview) return;
    event.preventDefault();
    event.stopPropagation();
    suppressPreview.current = true;
    setPreview(false);
    setOpen(false);
  }
  return <Popover.Root open={open} onOpenChange={(next, details) => {
    setOpen(next);
    setPreview(false);
    suppressPreview.current = !next;
    if (details.reason === 'escape-key') details.event.stopPropagation();
  }}>
    <Tooltip.Root open={preview && !open} onOpenChange={(next, details) => {
      if (next && suppressPreview.current) return;
      setPreview(next);
      if (details.reason === 'escape-key') details.event.stopPropagation();
    }}>
      <Tooltip.Trigger aria-describedby={preview && !open ? previewID : undefined} render={<Popover.Trigger type="button" className="resource-editor-help" aria-label={`Help: ${label}`} onKeyDown={closeOnEscape} onPointerEnter={() => { suppressPreview.current = false; }} onBlur={() => { suppressPreview.current = false; }} />}>?</Tooltip.Trigger>
      <Tooltip.Portal container={container}><Tooltip.Positioner sideOffset={6}><Tooltip.Popup id={previewID} role="tooltip" className="resource-editor-help-popup">{children}</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal>
    </Tooltip.Root>
    <Popover.Portal container={container}><Popover.Positioner sideOffset={6}><Popover.Popup className="resource-editor-help-popup" aria-label={`Help: ${label}`} initialFocus={false} onKeyDown={closeOnEscape}>{children}</Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}

export interface EditorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: ReactNode;
  error?: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  type?: 'text' | 'password';
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  list?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function EditorField({ label, value, onChange, help, error, disabled, readOnly, placeholder, inputMode, list, inputRef, type = 'text' }: EditorFieldProps) {
  const id = useId();
  return <div className="resource-editor-field"><div className="resource-editor-label"><label htmlFor={id}>{label}</label>{help && <EditorHelp label={label}>{help}</EditorHelp>}</div>
    <Input.Root size="sm" invalid={!!error}><Input.Control ref={inputRef} id={id} value={value} type={type} onChange={event => onChange(event.target.value)} disabled={disabled} readOnly={readOnly} placeholder={placeholder} inputMode={inputMode} list={list} autoComplete={type === 'password' ? 'new-password' : 'off'} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} /></Input.Root>
    {error && <span id={`${id}-error`} role="alert" className="resource-editor-error">{error}</span>}
  </div>;
}

export type ExactParseResult = { valid: true; value: string | bigint | number } | { valid: false; error: string };

/** No Number conversion: wide integers remain exact. Domain bounds belong to callers. */
export function parseExactInteger(text: string): ExactParseResult {
  return /^[+-]?\d+$/.test(text) ? { valid: true, value: BigInt(text) } : { valid: false, error: 'Enter a whole number.' };
}

export interface ExactValueFieldProps extends Omit<EditorFieldProps, 'value' | 'onChange' | 'error'> {
  value: string;
  identity: string;
  parse: (text: string) => ExactParseResult;
  onCommit: (value: string | bigint | number) => string | null;
  onValidityChange: (error: string | null) => void;
}
/** Source value and session/path identity reset a field; sibling revisions do not. */
export function ExactValueField(props: ExactValueFieldProps) {
  return <ExactValueSession key={JSON.stringify([props.identity, props.value])} {...props} />;
}
function ExactValueSession({ value, parse, onCommit, onValidityChange, identity: _identity, ...field }: ExactValueFieldProps) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const report = useEffectEvent(onValidityChange);
  useEffect(() => {
    report(error);
    return () => report(null);
  }, [error]);
  return <EditorField {...field} value={text} error={error} onChange={next => {
    setText(next);
    const result = parse(next);
    const failure = result.valid ? onCommit(result.value) : result.error;
    setError(failure);
    onValidityChange(failure);
  }} />;
}

export function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="resource-editor-section"><h3>{title}</h3>{children}</section>;
}
