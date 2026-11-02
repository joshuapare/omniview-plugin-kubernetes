import { useEffect, useState } from 'react';

import { EditorField, type EditorFieldProps } from '../../editor-controls';

/** Local invalid text survives sibling changes; only canonical field changes reset it. */
export function BufferedField({ value, onCommit, validate, report, fieldKey, ...props }: Omit<EditorFieldProps, 'onChange'> & {
  fieldKey: string;
  validate: (text: string) => string | null;
  onCommit: (text: string) => string | null;
  report: (key: string, error: string | null) => void;
}) {
  const [buffer, setBuffer] = useState<{ canonical: string; text: string; error: string | null }>({ canonical: value, text: value, error: null });
  if (buffer.canonical !== value) setBuffer({ canonical: value, text: value, error: null });
  const current = buffer.canonical === value ? buffer : { canonical: value, text: value, error: null };
  useEffect(() => { report(fieldKey, current.error); }, [current.error, fieldKey, report]);
  useEffect(() => () => report(fieldKey, null), [fieldKey, report]);
  return <EditorField {...props} value={current.text} error={current.error ?? props.error} onChange={text => {
    const error = validate(text) ?? onCommit(text);
    setBuffer({ canonical: value, text, error });
  }} />;
}
