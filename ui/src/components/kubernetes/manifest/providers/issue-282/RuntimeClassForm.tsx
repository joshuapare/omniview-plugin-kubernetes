import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { useCallback, useEffect, useState } from 'react';

import { EditorChoice, EditorField, EditorHelp, EditorSection, ExactValueField, KeyValueFields, patchError, patchFields } from '../../editor-controls';

import { controllerOwned, duplicateToleration, handlerError, labelKeyError, labelValueError, quantityError, readOnly, record, secondsError, text, tolerationError, validate } from './model';
import './runtime-class.css';

const effects = [{ value: '', label: 'All effects' }, { value: 'NoSchedule', label: 'NoSchedule' }, { value: 'PreferNoSchedule', label: 'PreferNoSchedule' }, { value: 'NoExecute', label: 'NoExecute' }];
const operators = [{ value: 'Equal', label: 'Equal' }, { value: 'Exists', label: 'Exists' }];

export default function RuntimeClassForm(props: ResourceEditorFormProps) {
  return <RuntimeClassSession key={props.draft.sessionID} {...props} />;
}
function RuntimeClassSession(props: ResourceEditorFormProps) {
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const report = useCallback((field: string, error: string | null) => setErrors(previous => previous[field] === error ? previous : { ...previous, [field]: error }), []);
  const form = { ...props, disabled: props.disabled || readOnly(props.draft, props.context) };
  const { draft, context, onValidityChange } = props;
  const canonicalErrors = validate(draft);
  const pendingError = Object.values(errors).find(Boolean) ?? null;
  const error = pendingError ?? canonicalErrors[0]?.message ?? null;
  useEffect(() => { onValidityChange(pendingError); }, [pendingError, onValidityChange]);
  const commit = (operations: readonly ResourceEditorPatch[]) => patchError(patchFields(form, operations));
  const scalar = (path: ResourceEditorPath, value: string) => commit(value === '' ? [{ op: 'remove', path }] : [{ op: 'set', path, value }]);
  const childForm = (id: string) => ({ ...form, onValidityChange: (failure: string | null) => report(id, failure) });
  const scalarField = (label: string, path: ResourceEditorPath, check: (value: string) => string | null, help: string, locked = false) => {
    const id = JSON.stringify(path);
    return <ExactValueField label={label} value={text(draft.get(path))} identity={`${draft.sessionID}:${id}`} disabled={form.disabled || locked} help={help}
      parse={value => { const failure = check(value); return failure ? { valid: false, error: failure } : { valid: true, value }; }}
      onCommit={value => scalar(path, String(value))} onValidityChange={failure => report(id, failure)} />;
  };
  const rawRows = draft.get(['scheduling', 'tolerations']);
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const [rowKeys, setRowKeys] = useState(() => ({ ids: rows.map((_, index) => index), next: rows.length }));
  if (rowKeys.ids.length !== rows.length) {
    const ids = rowKeys.ids.slice(0, rows.length);
    let next = rowKeys.next;
    while (ids.length < rows.length) ids.push(next++);
    setRowKeys({ ids, next });
  }
  const custom = draft.get(['overhead', 'podFixed']);
  const customCount = record(custom) ? Object.keys(custom).filter(key => key !== 'cpu' && key !== 'memory').length : 0;
  return <div className="runtime-class-form">
    {(controllerOwned(draft) || context.ownership?.status === 'controller' || context.ownership?.status === 'system') && <p role="status" className="runtime-class-notice">Managed object · change its owning configuration.</p>}
    <div hidden={props.section !== 'runtime'}>
      <EditorSection title="Runtime handler">
        {scalarField('Handler', ['handler'], handlerError, 'CRI handler configured on the target nodes. Creation does not install a runtime. Handler is immutable after creation.', context.intent !== 'create')}
        <p className="runtime-class-notice">Node runtime support is unverified.</p>
      </EditorSection>
      <EditorSection title="Fixed overhead per Pod">
        <div className="runtime-class-columns">
          {scalarField('CPU overhead', ['overhead', 'podFixed', 'cpu'], quantityError, 'Measured fixed overhead per Pod, in CPU units. For example, millicpu uses the m suffix. Blank omits this resource.')}
          {scalarField('Memory overhead', ['overhead', 'podFixed', 'memory'], quantityError, 'Measured fixed overhead per Pod, in bytes or Kubernetes units such as Mi. Blank omits this resource.')}
        </div>
        {customCount > 0 && <p role="status" className="runtime-class-notice">Additional overhead resources retained · edit those resources in YAML.</p>}
        <p className="runtime-class-notice">Admission changes do not rewrite existing Pods.</p>
      </EditorSection>
    </div>
    <div hidden={props.section !== 'scheduling'}>
      <EditorSection title="Required node labels">
        <EditorHelp label="Required node labels">All labels must match. The selector merges with each Pod selector; conflicting values reject Pod admission. Omission assumes runtime support on all nodes.</EditorHelp>
        <KeyValueFields form={childForm('nodeLabels')} path={['scheduling', 'nodeSelector']} label="node label" validateKey={labelKeyError} validateValue={labelValueError} />
      </EditorSection>
      <EditorSection title="Tolerations">
        <EditorHelp label="Runtime tolerations">Tolerations are appended to Pods, excluding duplicates. They permit tainted nodes but do not select nodes. Blank seconds means forever; negative seconds act as zero.</EditorHelp>
        {rows.map((row, index) => {
          if (!record(row)) return null;
          const rowID = rowKeys.ids[index];
          return <TolerationRow key={rowID} form={form} rows={rows} row={row} index={index} report={failure => report(`toleration:${rowID}`, failure)} onRemove={() => {
            const failure = patchError(patchFields(form, [{ op: 'remove', path: ['scheduling', 'tolerations', index] }]));
            report(`toleration:${rowID}`, failure);
            if (!failure) setRowKeys(previous => ({ ...previous, ids: previous.ids.filter(id => id !== rowID) }));
            return failure;
          }} />;
        })}
        <NewToleration form={childForm('newToleration')} rows={rows} />
      </EditorSection>
    </div>
    <div hidden={props.section !== 'metadata'}><EditorSection title="RuntimeClass labels">
      <EditorHelp label="RuntimeClass labels">These labels describe the RuntimeClass object. They do not select nodes or label Pods. Annotation values remain in the canonical source and are not shown here.</EditorHelp>
      <KeyValueFields form={childForm('metadataLabels')} path={['metadata', 'labels']} label="metadata label" validateKey={labelKeyError} validateValue={labelValueError} />
    </EditorSection></div>
    {error && <div role="alert" className="resource-editor-error">{error}</div>}
  </div>;
}
function TolerationRow({ form, rows, row, index, report, onRemove }: { form: ResourceEditorFormProps; rows: readonly unknown[]; row: Record<string, unknown>; index: number; report: (error: string | null) => void; onRemove: () => string | null }) {
  const [local, setLocal] = useState(() => ({ key: text(row.key), operator: text(row.operator) || 'Equal', value: text(row.value), effect: text(row.effect), tolerationSeconds: text(row.tolerationSeconds) }));
  const [error, setError] = useState<string | null>(null);
  const update = (field: keyof typeof local, value: string) => {
    const next = { ...local, [field]: value };
    setLocal(next);
    const candidate: Record<string, unknown> = {};
    if (next.key) candidate.key = next.key;
    if (next.operator) candidate.operator = next.operator;
    if (next.operator === 'Equal' && next.value) candidate.value = next.value;
    if (next.effect) candidate.effect = next.effect;
    let failure = next.effect === 'NoExecute' ? secondsError(next.tolerationSeconds) : null;
    if (!failure && next.effect === 'NoExecute' && next.tolerationSeconds) candidate.tolerationSeconds = BigInt(next.tolerationSeconds);
    failure ??= tolerationError(candidate) ?? (duplicateToleration(rows, candidate, index) ? 'This toleration already exists.' : null);
    if (!failure) {
      const operations: ResourceEditorPatch[] = [];
      for (const name of ['key', 'operator', 'value', 'effect', 'tolerationSeconds']) {
        const path = ['scheduling', 'tolerations', index, name];
        if (candidate[name] === undefined) { if (row[name] !== undefined) operations.push({ op: 'remove', path }); }
        else if (candidate[name] !== row[name]) operations.push({ op: 'set', path, value: candidate[name] });
      }
      if (operations.length) failure = patchError(patchFields(form, operations));
    }
    setError(failure);
    report(failure);
  };
  const field = (label: string, name: 'key' | 'value' | 'tolerationSeconds', help?: string) => <EditorField label={`${label} ${index + 1}`} value={local[name]} help={help} disabled={form.disabled} onChange={value => update(name, value)} />;
  return <div className="runtime-class-row" role="group" aria-label={`Toleration ${index + 1}`}>
    <div className="runtime-class-columns">
      {field('Taint key', 'key', 'Empty key requires Exists and matches all taint keys for the selected effect.')}
      <EditorChoice label={`Operator ${index + 1}`} value={local.operator} options={operators} disabled={form.disabled} onChange={value => update('operator', value)} />
      {local.operator === 'Equal' && field('Taint value', 'value')}
      <EditorChoice label={`Effect ${index + 1}`} value={local.effect} options={effects} disabled={form.disabled} onChange={value => update('effect', value)} />
      {local.effect === 'NoExecute' && field('Toleration seconds', 'tolerationSeconds', 'Signed 64-bit integer. Blank means forever. Negative values act as zero.')}
    </div>
    {error && <span role="alert" className="resource-editor-error">{error}</span>}
    <Button size="sm" variant="ghost" disabled={form.disabled} aria-label={`Remove toleration ${index + 1}`} onClick={() => setError(onRemove())}>Remove toleration</Button>
  </div>;
}
function NewToleration({ form, rows }: { form: ResourceEditorFormProps; rows: readonly unknown[] }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [operator, setOperator] = useState('Equal');
  const [value, setValue] = useState('');
  const [effect, setEffect] = useState('');
  const [seconds, setSeconds] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { onValidityChange } = form;
  const report = (failure: string | null) => { setError(failure); onValidityChange(failure); };
  useEffect(() => { onValidityChange(open ? error ?? 'Finish or cancel the new toleration.' : null); }, [open, error, onValidityChange]);
  if (!open) return <Button size="sm" disabled={form.disabled} onClick={() => setOpen(true)}>Add toleration</Button>;
  const row: Record<string, unknown> = { operator };
  if (key) row.key = key;
  if (operator === 'Equal' && value) row.value = value;
  if (effect) row.effect = effect;
  if (effect === 'NoExecute' && seconds && !secondsError(seconds)) row.tolerationSeconds = BigInt(seconds);
  return <div className="runtime-class-row" role="group" aria-label="New toleration">
    <div className="runtime-class-columns">
      <EditorField label="New taint key" value={key} onChange={setKey} disabled={form.disabled} />
      <EditorChoice label="New operator" value={operator} onChange={setOperator} options={operators} disabled={form.disabled} />
      {operator === 'Equal' && <EditorField label="New taint value" value={value} onChange={setValue} disabled={form.disabled} />}
      <EditorChoice label="New effect" value={effect} onChange={setEffect} options={effects} disabled={form.disabled} />
      {effect === 'NoExecute' && <EditorField label="New toleration seconds" value={seconds} onChange={setSeconds} disabled={form.disabled} inputMode="numeric" help="Blank means forever. Negative values act as zero." />}
    </div>
    {error && <span role="alert" className="resource-editor-error">{error}</span>}
    <div className="runtime-class-actions"><Button size="sm" disabled={form.disabled} onClick={() => {
      const failure = (effect === 'NoExecute' ? secondsError(seconds) : null) ?? tolerationError(row) ?? (duplicateToleration(rows, row) ? 'This toleration already exists.' : null);
      if (failure) { report(failure); return; }
      const operations: ResourceEditorPatch[] = form.draft.has(['scheduling', 'tolerations']) ? [{ op: 'insert', path: ['scheduling', 'tolerations'], index: rows.length, value: row }] : [{ op: 'set', path: ['scheduling', 'tolerations'], value: [row] }];
      const result = patchError(patchFields(form, operations));
      report(result);
      if (!result) { setOpen(false); setKey(''); setValue(''); setSeconds(''); setOperator('Equal'); setEffect(''); }
    }}>Add</Button><Button size="sm" variant="ghost" onClick={() => { setOpen(false); report(null); }}>Cancel</Button></div>
  </div>;
}
