import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorPath } from '@omniviewdev/runtime';
import { useState } from 'react';
import { EditorChoice, EditorField, EditorHelp } from '../../editor-controls';
import { AppendButton, NetworkField, RemoveButton, type NetworkingForm } from './fields';
import { labelKey, labelValue, list, record, text } from './model';

const operators = ['In', 'NotIn', 'Exists', 'DoesNotExist'].map(value => ({ value, label: value }));
export default function Selector({ editor, path, label }: { editor: NetworkingForm; path: ResourceEditorPath; label: string }) {
  const selected = record(editor.form.draft.get(path));
  const labels = record(selected.matchLabels), expressions = list(selected.matchExpressions);
  const [key, setKey] = useState(''), [value, setValue] = useState('');
  const [expressionKey, setExpressionKey] = useState(''), [operator, setOperator] = useState('Exists'), [values, setValues] = useState('');
  const parsedValues = values.split(',').map(value => value.trim());
  const needsValues = operator === 'In' || operator === 'NotIn';
  const validExpression = labelKey(expressionKey) && (!needsValues || values !== '' && parsedValues.every(labelValue));
  return <fieldset className="networking-selector"><legend>{label} <EditorHelp label={label}>Labels and expressions in one selector are ANDed. An empty selector matches every object in its scope.</EditorHelp></legend>
    {!Object.keys(labels).length && !expressions.length && <span className="networking-muted">All {label.toLowerCase()}</span>}
    {Object.keys(labels).map(key => <div className="networking-row" key={key}>
      <span className="networking-muted" aria-label={`${label} label key`}>{key}</span>
      <NetworkField editor={editor} path={[...path, 'matchLabels', key]} label={`${label} label value ${key}`} parse={next => labelValue(next) ? { value: next } : { error: 'Use a label value up to 63 characters.' }} />
      <RemoveButton editor={editor} path={[...path, 'matchLabels', key]} label={`Remove ${label} label ${key}`} />
    </div>)}
    <div className="networking-row">
      <EditorField label={`New ${label} label key`} value={key} onChange={setKey} disabled={editor.form.disabled} error={key && !labelKey(key) ? 'Enter a valid label key.' : undefined} />
      <EditorField label={`New ${label} label value`} value={value} onChange={setValue} disabled={editor.form.disabled} error={!labelValue(value) ? 'Use a label value up to 63 characters.' : undefined} />
      <Button size="sm" variant="outline" disabled={editor.form.disabled || !labelKey(key) || !labelValue(value) || Object.hasOwn(labels, key)} onClick={() => { if (!editor.commit([{ op: 'set', path: [...path, 'matchLabels', key], value }])) { setKey(''); setValue(''); } }}>Add label</Button>
    </div>
    <details className="networking-advanced"><summary>Selector expressions ({expressions.length})</summary>
      {expressions.map((value, index) => {
        const row = record(value), base = [...path, 'matchExpressions', index];
        const needsValues = row.operator === 'In' || row.operator === 'NotIn';
        return <div className="networking-card" key={index}><div className="networking-row">
          <NetworkField editor={editor} path={[...base, 'key']} label={`${label} expression ${index + 1} key`} parse={value => labelKey(value) ? { value } : { error: 'Enter a valid label key.' }} />
          <EditorChoice label={`${label} expression ${index + 1} operator`} value={text(row.operator)} options={operators} disabled={editor.form.disabled} onChange={value => {
            const wantsValues = value === 'In' || value === 'NotIn';
            editor.commit([{ op: 'set', path: [...base, 'operator'], value }, ...(wantsValues ? list(row.values).length ? [] : [{ op: 'set' as const, path: [...base, 'values'], value: [''] }] : [{ op: 'remove' as const, path: [...base, 'values'] }])]);
          }} />
          <RemoveButton editor={editor} path={base} label={`Remove ${label} expression ${index + 1}`} />
        </div>{needsValues && <NetworkField editor={editor} path={[...base, 'values']} label={`${label} expression ${index + 1} values`} help="Comma-separated label values. All expression values remain strings." format={value => list(value).map(text).join(', ')} parse={value => { const values = value.split(',').map(value => value.trim()); return values.every(labelValue) ? { value: values } : { error: 'Enter valid comma-separated label values.' }; }} />}</div>;
      })}
      <div className="networking-row"><EditorField label={`New ${label} expression key`} value={expressionKey} onChange={setExpressionKey} disabled={editor.form.disabled} />
        <EditorChoice label={`New ${label} expression operator`} value={operator} onChange={setOperator} options={operators} disabled={editor.form.disabled} />
        {needsValues && <EditorField label={`New ${label} expression values`} value={values} onChange={setValues} disabled={editor.form.disabled} />}
      </div>
      {validExpression ? <AppendButton editor={editor} path={[...path, 'matchExpressions']} label="Add expression" value={{ key: expressionKey, operator, ...(needsValues ? { values: parsedValues } : {}) }} /> : <Button size="sm" variant="outline" disabled>Add expression</Button>}
    </details>
  </fieldset>;
}
