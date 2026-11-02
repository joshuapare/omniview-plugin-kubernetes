import { useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection, ExactValueField, ReferencePicker, useFieldValidity } from '../../editor-controls';
import designs from './design.json';
import { inspectionOnly, integerValue, pathOf } from './policy';

type Design = { fields?: string[][]; rows?: string[]; inspect?: string[][]; warning: string; system: boolean; run: boolean };
const rowMembers: Record<string, string[]> = { string: [], parameter: ['name', 'value'], eventparameter: ['name', 'valueFrom.event'], step: ['setWeight'], groupkind: ['group', 'kind'], analysisref: ['name', 'templateName'], cluster: ['cluster'] };
export default function ArgoEditor(props: ResourceEditorFormProps) {
  const design = (designs as Record<string, Design>)[props.context.kind];
  const [failure, setFailure] = useState<string | null>(null);
  const locked = props.disabled || inspectionOnly(props.draft, props.context);
  const reportValidity = useFieldValidity(props);
  function commit(operations: ResourceEditorPatch[]) {
    if (locked) return 'This resource is read-only.';
    const result = props.patch({ sessionID: props.draft.sessionID, expectedRevision: props.draft.revision, operations });
    const error = result.status === 'accepted' ? null : result.message;
    setFailure(error);
    reportValidity('patch', error);
    return error;
  }
  function field(label: string, path: string, type = 'text') {
    const segments = pathOf(path);
    const value = props.draft.get(segments);
    const scalar = typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value) : '';
    const immutable = props.context.kind === 'Rollout' && props.context.intent !== 'create' && path.startsWith('spec.selector');
    const disabled = locked || immutable || (value !== undefined && typeof value === 'object');
    const set = (next: unknown) => commit([{ op: 'set', path: segments, value: next }]);
    if (type === 'ref' && (props.context.namespace || path.includes('workflowTemplateRef'))) {
      const template = path.includes('workflowTemplateRef');
      const cluster = template && props.draft.get([...segments.slice(0, -1), 'clusterScope']) === true;
      const account = path.endsWith('serviceAccountName');
      return <ReferencePicker key={path} form={props} label={label} value={scalar} disabled={disabled}
        query={{ group: account ? '' : 'argoproj.io', version: account ? 'v1' : 'v1alpha1',
          resource: account ? 'serviceaccounts' : template ? cluster ? 'clusterworkflowtemplates' : 'workflowtemplates' : 'appprojects',
          namespace: cluster ? undefined : props.context.namespace, projection: 'metadata' }} onChange={set} />;
    }
    if (type === 'number') return <ExactValueField key={path} label={label} value={scalar} disabled={disabled} identity={`${props.draft.sessionID}:${path}`} parse={text => integerValue(text, path.endsWith('setWeight'))} onCommit={set} onValidityChange={error => reportValidity(path, error)} />;
    if (type === 'bool' || type.startsWith('choice:')) {
      const choices = type === 'bool' ? ['true', 'false'] : type.slice(7).split(',');
      return <EditorChoice key={path} label={label} disabled={disabled} value={typeof value === 'boolean' ? String(value) : scalar} options={choices.map(option => ({ value: option, label: option }))} onChange={next => set(type === 'bool' ? next === 'true' : next)} />;
    }
    return <EditorField key={path} label={label} value={scalar} disabled={disabled} type={path.endsWith('.value') ? 'password' : 'text'} help={immutable ? 'Selector is locked after creation.' : undefined} onChange={set} />;
  }
  if (design.system) return <EditorSection title={props.context.kind}><p role="status">Controller / executor record · read-only</p>{design.inspect?.map(([label, path]) => <div key={path}><strong>{label}</strong>: {props.draft.has(pathOf(path)) ? 'Present · payload withheld' : 'Not reported'}</div>)}<EditorHelp label="Ownership boundary">{design.warning}</EditorHelp></EditorSection>;
  const [rowLabel, rowPath, rowType] = design.rows ?? [];
  const rows = rowPath ? props.draft.get(pathOf(rowPath)) : undefined;
  const members = rowMembers[rowType] ?? ['name', 'value'];
  return <EditorSection title={props.context.kind}>
    {locked && <p role="status">Inspection only · ownership or execution boundary</p>}
    <EditorHelp label="Consequences">{design.warning.replace('by this mock', 'locally')}</EditorHelp>
    {failure && <p role="alert">{failure}</p>}
    {design.fields?.filter(([, path]) => !rowPath || !path.startsWith(`${rowPath}.`)).map(([label, path, type]) => field(label, path, type))}
    {rowPath && <EditorSection title={rowLabel}>
      {Array.isArray(rows) && rows.map((_, index) => <fieldset key={index} disabled={locked} style={{ border: 0, padding: 0 }}><legend>{rowLabel} {index + 1}</legend>
        {members.length ? members.map(member => field(member === 'setWeight' ? 'Traffic weight %' : member, `${rowPath}.${index}.${member}`, member === 'setWeight' ? 'number' : 'text')) : field('Value', `${rowPath}.${index}`)}
        <button type="button" disabled={locked} onClick={() => commit([{ op: 'remove', path: [...pathOf(rowPath), index] }])}>Remove {index + 1}</button>
      </fieldset>)}
      <button type="button" disabled={locked || (rows !== undefined && !Array.isArray(rows))} onClick={() => {
        const value = members.length ? {} : '';
        commit(rows === undefined ? [{ op: 'set', path: pathOf(rowPath), value: [value] }] : [{ op: 'insert', path: pathOf(rowPath), index: Array.isArray(rows) ? rows.length : 0, value }]);
      }}>Add {rowLabel.toLowerCase()}</button>
    </EditorSection>}
  </EditorSection>;
}
