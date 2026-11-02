import { Button } from '@omniviewdev/base-ui';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection, useFieldValidity } from '../../editor-controls';
import { layout, type Field } from './domain';
const Validity = createContext<(field: string, error: string | null) => void>(() => {});

function Value({ field, path, props }: { field: Field; path: ResourceEditorPath; props: ResourceEditorFormProps }) {
  const value = props.draft.get(path);
  const items: readonly unknown[] = Array.isArray(value) ? value : [];
  const source = Array.isArray(value) ? items.every(item => typeof item === 'string') ? items.join(',') : '' : typeof value === 'string' ? value : '';
  return <ValueSession key={`${props.draft.sessionID}/${JSON.stringify(path)}/${source}`} field={field} path={path} props={props} source={source} />;
}
function ValueSession({ field, path, props, source }: { field: Field; path: ResourceEditorPath; props: ResourceEditorFormProps; source: string }) {
  const report = useContext(Validity);
  const fieldID = JSON.stringify(path);
  useEffect(() => () => report(fieldID, null), [report, fieldID]);
  const value = props.draft.get(path);
  const [text, setText] = useState(source);
  const [error, setError] = useState<string | null>(null);
  const commit = (next: unknown) => {
    const operations: ResourceEditorPatch[] = [{ op: 'set', path, value: next }];
    if (path.at(-1) === 'patchType') {
      const other = [...path.slice(0, -1), next === 'JSONPatch' ? 'applyConfiguration' : 'jsonPatch'];
      if (props.draft.has(other)) operations.push({ op: 'remove', path: other });
    }
    const result = props.patch({ sessionID: props.draft.sessionID, expectedRevision: props.draft.revision, operations });
    const message = result.status === 'accepted' ? null : 'Change could not be applied. Refresh the field and try again.';
    setError(message); report(JSON.stringify(path), message);
  };
  const list = ['apiGroups', 'apiVersions', 'resources', 'operations', 'validationActions'].includes(String(path.at(-1)));
  if (field.boolean) return <label><input type="checkbox" checked={value === true} disabled={props.disabled} onChange={e => commit(e.target.checked)} /> {field.label}</label>;
  if (field.choices) return <EditorChoice label={field.label} value={source} disabled={props.disabled} onChange={commit} options={[{value:'',label:'Not specified'},...field.choices.map(choice=>({value:choice,label:choice}))]} help={field.help} error={error} />;
  return <EditorField label={field.label} value={text} disabled={props.disabled} help={field.help ?? (field.label.includes('CEL') ? 'CEL runs on the controller. object, oldObject and request availability depends on policy evaluation context.' : undefined)} error={error} onChange={next => {
    setText(next);
    if (field.required && !next.trim()) { setError('Required.'); report(JSON.stringify(path), 'Complete the required field.'); return; }
    if (list && (path.at(-1) === 'validationActions' || path.at(-1) === 'operations')) {
      const allowed = path.at(-1) === 'validationActions' ? ['Audit', 'Warn', 'Deny'] : ['CREATE', 'UPDATE', 'DELETE', 'CONNECT', '*'];
      if (next.split(',').some(part => !allowed.includes(part.trim()))) {
        setError('Choose a supported comma-separated value.');
        report(JSON.stringify(path), 'Complete the action or operation list.');
        return;
      }
    }
    commit(list ? next.split(',').map(part => part.trim()) : next);
  }} />;
}
export default function PolicyEditor(props: ResourceEditorFormProps) {
  const report = useFieldValidity(props);
  const config = layout(props.context.kind);
  const apply = (operations: ResourceEditorPatch[]) => {
    const result = props.patch({ sessionID: props.draft.sessionID, expectedRevision: props.draft.revision, operations });
    report('structure', result.status === 'accepted' ? null : 'This structural change could not be applied.');
  };
  return <Validity.Provider value={report}><div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
    {config.consequence && <p role="note">{config.consequence}</p>}
    <EditorSection title="Policy behavior">{config.fields.map(field => <Value key={JSON.stringify(field.path)} field={field} path={field.path} props={props} />)}</EditorSection>
    {config.rows.map(row => {
      const raw = props.draft.get(row.path);
      const entries = Array.isArray(raw) ? raw : [];
      return <EditorSection key={row.label} title={row.label}>{entries.map((_, index) => {
        const base = [...row.path, index];
        const strategy = props.draft.get([...base, 'patchType']);
        const extra: Field[] = row.label === 'Mutations' && (strategy === 'ApplyConfiguration' || strategy === 'JSONPatch') ? [{ label: 'CEL patch expression', path: [strategy === 'JSONPatch' ? 'jsonPatch' : 'applyConfiguration', 'expression'], required: true }] : [];
        return <fieldset key={index} style={{ minWidth: 0 }}><legend>{row.label} {index + 1}</legend>{[...row.fields, ...extra].map(field => <Value key={JSON.stringify(field.path)} field={field} path={[...base, ...field.path]} props={props} />)}
          {row.label === 'Cosign keyless attestors' && <EditorSection title="Keyless identity">{['issuer', 'subject'].map(key => <Value key={key} field={{ label: key === 'issuer' ? 'OIDC issuer' : 'Certificate subject', path: [] }} path={[...base, 'cosign', 'keyless', 'identities', 0, key]} props={props} />)}</EditorSection>}
          <Button size="sm" disabled={props.disabled} onClick={() => apply([{ op: 'remove', path: base }])}>Remove entry</Button>
        </fieldset>;
      })}<Button size="sm" disabled={props.disabled} onClick={() => apply(Array.isArray(raw) ? [{ op: 'insert', path: row.path, index: entries.length, value: {} }] : [{ op: 'set', path: row.path, value: [{}] }])}>Add {row.label.toLowerCase()}</Button></EditorSection>;
    })}
  </div></Validity.Provider>;
}
