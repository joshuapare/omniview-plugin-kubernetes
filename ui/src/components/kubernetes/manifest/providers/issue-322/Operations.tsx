import { useEffect, useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection, ExactValueField, KeyValueFields, ReferencePicker, patchError, patchFields, removeDraftField, scalarText, setDraftField, useFieldValidity } from '../../editor-controls';
import { exactNonnegative, operationReadOnly, pipelineRoot } from './model';

function Text({ form, path, label, required = false, immutable = false }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string; required?: boolean; immutable?: boolean }) {
  const validity = useFieldValidity(form);
  return <ExactValueField identity={`${form.draft.sessionID}:${JSON.stringify(path)}`} label={label} value={scalarText(form.draft.get(path))} disabled={form.disabled || immutable} parse={value => {
    if (required && !value.trim()) return { valid: false, error: `${label} is required.` };
    if (path[path.length - 1] === 'step') {
      const listPath = path.slice(0, -2);
      const list = form.draft.get(listPath);
      if (Array.isArray(list) && list.some((_, i) => i !== path[path.length - 2] && form.draft.get([...listPath, i, 'step']) === value)) return { valid: false, error: 'Step names must be unique.' };
    }
    return { valid: true, value };
  }} onCommit={value => patchError(setDraftField(form, path, value))} onValidityChange={error => validity(JSON.stringify(path), error)} />;
}
function Integer({ form, path, label, bits = 64 }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string; bits?: 32 | 64 }) {
  const validity = useFieldValidity(form);
  return <ExactValueField identity={`${form.draft.sessionID}:${JSON.stringify(path)}`} label={label} help={`Optional nonnegative int${bits}. Clear to use API default; values remain exact.`} value={scalarText(form.draft.get(path))} disabled={form.disabled} inputMode="numeric" parse={text => text === '' ? { valid: true, value: '' } : exactNonnegative(text, bits)} onCommit={value => patchError(value === '' ? removeDraftField(form, path) : setDraftField(form, path, value))} onValidityChange={error => validity(JSON.stringify(path), error)} />;
}
function FunctionField({ form, path, label }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string }) {
  return <FunctionFieldSession key={`${form.draft.sessionID}/${JSON.stringify(path)}/${scalarText(form.draft.get(path))}`} form={form} path={path} label={label} />;
}
function FunctionFieldSession({ form, path, label }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string }) {
  const [text, setText] = useState(() => scalarText(form.draft.get(path)));
  const [error, setError] = useState<string | null>(null);
  const validity = useFieldValidity(form);
  const fieldID = JSON.stringify(path);
  useEffect(() => { validity(fieldID, error); return () => validity(fieldID, null); }, [validity, fieldID, error]);
  return <ReferencePicker form={form} label={label} query={{ group: 'pkg.crossplane.io', version: 'v1', resource: 'functions', projection: 'metadata' }} value={text} error={error} disabled={form.disabled} onChange={value => {
    setText(value);
    const failure = value.trim() ? patchError(setDraftField(form, path, value)) : 'Function name is required.';
    setError(failure); validity(JSON.stringify(path), failure);
  }} />;
}
function Pipeline({ form }: { form: ResourceEditorFormProps }) {
  const root = pipelineRoot(form.context.kind);
  const path = [...root, 'pipeline'];
  const pipeline = form.draft.get(path);
  const count = Array.isArray(pipeline) ? pipeline.length : 0;
  const [name, setName] = useState('');
  const [fn, setFn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const validity = useFieldValidity(form);
  const report = (message: string | null) => { setError(message); validity('pipeline-add', message); };
  return <EditorSection title="Function pipeline"><EditorHelp label="Function pipeline">Steps execute in order. Functions must already be installed and compatible. Function input and credentials remain in protected source; no values are loaded here.</EditorHelp>
    {Array.from({ length: count }, (_, i) => <div key={i} style={{ borderBottom: '1px solid var(--ov-color-border-default)', paddingBottom: 12 }}><Text form={form} path={[...path, i, 'step']} label={`Step ${i + 1} name`} required /><FunctionField key={`${form.draft.sessionID}:${i}`} form={form} path={[...path, i, 'functionRef', 'name']} label={`Step ${i + 1} Function`} />
      <Button size="sm" variant="ghost" disabled={form.disabled} aria-label={`Remove step ${i + 1}`} onClick={() => report(patchError(removeDraftField(form, [...path, i])))}>Remove step</Button>
      <details><summary>Step advanced fields</summary><span>Input, credentials and required-resource selectors use source. Existing fields stay unchanged.</span></details>
    </div>)}
    <EditorField label="New step name" value={name} onChange={setName} disabled={form.disabled || count >= 99} />
    <ReferencePicker form={form} label="New step Function" query={{ group: 'pkg.crossplane.io', version: 'v1', resource: 'functions', projection: 'metadata' }} value={fn} onChange={setFn} disabled={form.disabled || count >= 99} />
    <Button size="sm" disabled={form.disabled || count >= 99} onClick={() => {
      if (!name.trim() || !fn.trim()) { report('Enter a step name and Function name.'); return; }
      if (Array.from({ length: count }, (_, i) => form.draft.get([...path, i, 'step'])).includes(name)) { report('Step names must be unique.'); return; }
      const step = { step: name, functionRef: { name: fn } };
      const failure = patchError(patchFields(form, form.draft.has(path) ? [{ op: 'insert', path, index: count, value: step }] : [{ op: 'set', path, value: [step] }]));
      report(failure); if (!failure) { setName(''); setFn(''); }
    }}>Add function step</Button>{error && <div role="alert">{error}</div>}
  </EditorSection>;
}
function History({ form }: { form: ResourceEditorFormProps }) {
  const conditions = form.draft.get(['status', 'conditions']);
  const owners = form.draft.get(['metadata', 'ownerReferences']);
  const runs = form.draft.get(['status', 'runningOperationRefs']);
  const applied = form.draft.get(['status', 'appliedResourceRefs']);
  const outputs = form.draft.get(['status', 'pipeline']);
  return <EditorSection title="Execution and history">
    {Array.isArray(owners) && owners.map((_, i) => <div key={i}>Owner: {scalarText(form.draft.get(['metadata', 'ownerReferences', i, 'kind']))} / {scalarText(form.draft.get(['metadata', 'ownerReferences', i, 'name']))}</div>)}
    {Array.isArray(conditions) ? conditions.map((_, i) => <div key={i}>{scalarText(form.draft.get(['status', 'conditions', i, 'type']))}: {scalarText(form.draft.get(['status', 'conditions', i, 'status']))}</div>) : <span>No observed conditions.</span>}
    {['lastScheduleTime', 'lastSuccessfulTime', 'watchingResources', 'failures'].filter(key => form.draft.has(['status', key])).map(key => <div key={key}>{key}: {scalarText(form.draft.get(['status', key]))}</div>)}
    {Array.isArray(runs) && runs.map((_, i) => <div key={i}>Running Operation: {scalarText(form.draft.get(['status', 'runningOperationRefs', i, 'name']))}</div>)}
    {Array.isArray(applied) && applied.map((_, i) => <div key={i}>Applied reference: {scalarText(form.draft.get(['status', 'appliedResourceRefs', i, 'kind']))} / {scalarText(form.draft.get(['status', 'appliedResourceRefs', i, 'name']))}</div>)}
    {Array.isArray(outputs) && outputs.map((_, i) => <div key={i}>Step {scalarText(form.draft.get(['status', 'pipeline', i, 'step']))}: output protected</div>)}
  </EditorSection>;
}
export default function Operations(props: ResourceEditorFormProps) {
  const readOnly = operationReadOnly(props.draft, props.context);
  const form = { ...props, disabled: props.disabled || readOnly };
  const validity = useFieldValidity(form);
  const kind = form.context.kind;
  const root = pipelineRoot(kind);
  if (form.section === 'history') return <History form={form} />;
  return <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
    {kind === 'Operation' ? <div role="note">{readOnly ? 'Execution is inspect-only. Change the owning template for future runs; no retry or completed-run edits.' : 'Submitting this one-shot Operation executes Functions that may change cluster resources.'}</div> : <div role="note">Template changes affect future runs only. Crossplane Operations must be enabled; installed APIs do not prove controller readiness.</div>}
    {form.section === 'pipeline' ? <Pipeline form={form} /> : form.section === 'advanced' ? <EditorSection title="Execution limits">
      <Integer form={form} path={[...root, 'retryLimit']} label="Failure retry limit" />
      {kind !== 'Operation' && <><Integer form={form} path={['spec', 'successfulHistoryLimit']} label="Successful runs retained" bits={32} /><Integer form={form} path={['spec', 'failedHistoryLimit']} label="Failed runs retained" bits={32} /><details><summary>Future-run template labels</summary><KeyValueFields form={form} path={['spec', 'operationTemplate', 'metadata', 'labels']} label="template label" /></details></>}
      <EditorHelp label="Source-only fields">Function input, credential references, requirements and template annotations stay in canonical source. No projected sensitive container is written back.</EditorHelp>
    </EditorSection> : <EditorSection title={kind === 'CronOperation' ? 'Schedule' : kind === 'WatchOperation' ? 'Watched resources' : 'One-shot execution'}>
      {kind === 'CronOperation' && <><ExactValueField identity={`${form.draft.sessionID}:schedule`} label="Cron schedule" value={scalarText(form.draft.get(['spec', 'schedule']))} disabled={form.disabled} help="Five fields: minute, hour, day of month, month, day of week. Server admission validates full syntax." parse={text => text.trim().split(/\s+/).length === 5 ? { valid: true, value: text } : { valid: false, error: 'Enter a five-field cron schedule.' }} onCommit={value => patchError(setDraftField(form, ['spec', 'schedule'], value))} onValidityChange={error => validity('schedule', error)} /><Integer form={form} path={['spec', 'startingDeadlineSeconds']} label="Missed-run deadline (seconds)" /></>}
      {kind === 'WatchOperation' && <><Text form={form} path={['spec', 'watch', 'apiVersion']} label="Watched API version" required immutable={form.context.intent !== 'create'} /><Text form={form} path={['spec', 'watch', 'kind']} label="Watched kind" required immutable={form.context.intent !== 'create'} /><Text form={form} path={['spec', 'watch', 'namespace']} label="Watched namespace" /><div role="note">Empty namespace watches all namespaces. Empty selector matches all resources of this kind.</div><KeyValueFields form={form} path={['spec', 'watch', 'matchLabels']} label="watch label" /></>}
      {kind !== 'Operation' && <><EditorChoice label="Concurrent runs" value={scalarText(form.draft.get(['spec', 'concurrencyPolicy']))} disabled={form.disabled} options={[{ value: '', label: 'API default (Allow)' }, ...['Allow', 'Forbid', 'Replace'].map(value => ({ value, label: value }))]} onChange={value => validity('concurrency', patchError(value ? setDraftField(form, ['spec', 'concurrencyPolicy'], value) : removeDraftField(form, ['spec', 'concurrencyPolicy'])))} />{form.draft.get(['spec', 'concurrencyPolicy']) === 'Replace' && <div role="alert">Replace may interrupt an active run.</div>}</>}
      <EditorField label="Execution mode" value={scalarText(form.draft.get([...root, 'mode'])) || 'Pipeline (API default)'} onChange={() => undefined} readOnly />
    </EditorSection>}
  </div>;
}
