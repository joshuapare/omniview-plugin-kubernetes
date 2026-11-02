import { Input } from '@omniviewdev/base-ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Ref } from 'react';
import './controls.css';

/** Hover/focus previews help; clicking pins it. Escape closes before the editor. */
export function EditorHelp({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  return <details className="resource-editor-help" open={open}
    onPointerEnter={() => setOpen(true)}
    onPointerLeave={event => { if (!pinned.current && !event.currentTarget.contains(document.activeElement)) setOpen(false); }}
    onFocus={() => setOpen(true)}
    onBlur={event => { if (!pinned.current && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key !== 'Escape' || !event.currentTarget.open) return;
      event.preventDefault();
      event.stopPropagation();
      pinned.current = false;
      event.currentTarget.querySelector('summary')?.focus();
      setOpen(false);
    }}><summary aria-label={`Help: ${label}`} onClick={event => {
      event.preventDefault();
      pinned.current = !pinned.current;
      setOpen(pinned.current);
    }}>?</summary><div>{children}</div></details>;
}

export interface EditorFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
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
  parse(text: string): ExactParseResult;
  onCommit(value: string | bigint | number): string | null;
  onValidityChange(error: string | null): void;
}
/** Identity is session plus field path. Sibling revisions must not discard partial text. */
export function ExactValueField(props: ExactValueFieldProps) {
  return <ExactValueSession key={props.identity} {...props} />;
}
function ExactValueSession({ value, parse, onCommit, onValidityChange, identity: _identity, ...field }: ExactValueFieldProps) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const report = useRef(onValidityChange);
  report.current = onValidityChange;
  useEffect(() => {
    setText(value);
    setError(null);
    report.current(null);
    return () => report.current(null);
  }, [value]);
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
