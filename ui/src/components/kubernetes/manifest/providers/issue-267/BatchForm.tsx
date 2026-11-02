import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { useEffect, useRef, useState } from 'react';
import { EditorChoice, EditorField, EditorSection, KeyValueFields, patchFields } from '../../editor-controls';
import { array, batchReadOnly, INT32_MAX, INT64_MAX, jobPath, labelKeyError, labelValueError, managedByError, ownerName, parseInteger, record, scalar, scheduleError, timeZoneError, validateBatch } from './batchModel';
import './batch.css';

export default function BatchForm(form: ResourceEditorFormProps) {
  return <BatchSession key={form.draft.sessionID} {...form} />;
}

export function JobEditor(form: ResourceEditorFormProps) {
  return <BatchForm {...form} />;
}

export function CronJobEditor(form: ResourceEditorFormProps) {
  return <BatchForm {...form} />;
}

function BatchSession(form: ResourceEditorFormProps) {
  const { context, draft, section } = form;
  const cron = context.kind === 'CronJob';
  const base = jobPath(context.kind);
  const pod = [...base, 'template', 'spec'];
  const containersPath = [...pod, 'containers'];
  const containers = array(draft.get(containersPath));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [patchFailure, setPatchFailure] = useState<string | null>(null);
  const [elastic, setElastic] = useState('');
  const launchIdentity = JSON.stringify([draft.sessionID, draft.revision]);
  const [launchState, setLaunchState] = useState<{ identity: string; pending: boolean; status: string | null }>({ identity: launchIdentity, pending: false, status: null });
  const launchPending = launchState.identity === launchIdentity && launchState.pending;
  const launchStatus = launchState.identity === launchIdentity ? launchState.status : null;
  const launchRequest = useRef<AbortController | null>(null);
  useEffect(() => () => launchRequest.current?.abort(), [launchIdentity]);
  const launchProtocol = 'kubernetes.cronjob-run-now.v1';
  const launchAvailable = context.intent !== 'create' && !!context.name && context.capabilities.get === 'available' && context.capabilities.actions[launchProtocol] === 'available';
  const launch = async () => {
    if (!launchAvailable || launchPending || form.disabled) return;
    launchRequest.current?.abort();
    const controller = new AbortController();
    launchRequest.current = controller;
    setLaunchState({ identity: launchIdentity, pending: true, status: null });
    try {
      const result = await form.actions.execute({ protocol: launchProtocol, input: {}, sessionID: draft.sessionID, generation: draft.revision, signal: controller.signal });
      if (controller.signal.aborted) return;
      setLaunchState({ identity: launchIdentity, pending: false, status: result.status === 'ready' && record(result.output).opened === true ? 'Job creation review opened. No Job has been submitted.' : result.status === 'ready' ? 'The host did not open a Job creation review.' : `Manual workflow ${result.status}. No Job was submitted.` });
    } catch {
      if (!controller.signal.aborted) setLaunchState({ identity: launchIdentity, pending: false, status: 'Manual workflow unavailable. No Job was submitted.' });
    }
  };
  const locked = form.disabled || batchReadOnly(draft, context);
  const templateLocked = locked || !cron && context.intent !== 'create';
  const immutableJob = !cron && context.intent !== 'create';
  const schemaAllows = (path: ResourceEditorPath) => context.schema.paths === undefined || context.schema.paths.some(parent => parent.length <= path.length && parent.every((segment, index) => segment === '*' || segment === path[index]));
  const canonicalIssues = validateBatch(draft, context);
  const localError = Object.values(errors)[0] ?? patchFailure;
  useEffect(() => { form.onValidityChange(localError ?? null); }, [localError, form.onValidityChange]);
  const report = (key: string, error: string | null) => setErrors(previous => {
    if (previous[key] === error || !error && !(key in previous)) return previous;
    const next = { ...previous };
    if (error) next[key] = error; else delete next[key];
    return next;
  });
  const apply = (operations: readonly ResourceEditorPatch[]): string | null => {
    if (locked) return 'This resource is read-only.';
    if (operations.some(operation => !schemaAllows(operation.path))) return 'Installed schema does not admit this field.';
    const result = patchFields(form, operations);
    const failure = result.status === 'accepted' ? null : result.message;
    setPatchFailure(failure);
    return failure;
  };
  const field = (label: string, path: ResourceEditorPath, options: { numeric?: boolean; max?: bigint; min?: bigint; disabled?: boolean; help?: string; validate?(value: string): string | null; optional?: boolean } = {}) => {
    const key = JSON.stringify(path);
    const max = options.max ?? INT32_MAX;
    const min = options.min ?? 0n;
    return <EditorField key={key} label={label} value={localValues[key] ?? scalar(draft.get(path))} disabled={locked || !!options.disabled || !schemaAllows(path)} inputMode={options.numeric ? 'numeric' : 'text'} help={schemaAllows(path) ? options.help : 'Field unavailable in the installed schema.'} error={errors[key]} onChange={next => {
      const invalid = options.numeric ? parseInteger(next, max, min).error : options.validate?.(next) ?? null;
      const operation: ResourceEditorPatch = next === '' && (options.optional || options.numeric)
        ? { op: 'remove', path }
        : { op: 'set', path, value: options.numeric && !invalid ? parseInteger(next, max, min).value : next };
      const failure = invalid ?? apply([operation]);
      report(key, failure);
      setLocalValues(previous => {
        const values = { ...previous };
        if (failure) values[key] = next; else delete values[key];
        return values;
      });
    }} />;
  };
  const choice = (label: string, path: ResourceEditorPath, options: readonly { value: string; label: string }[], help?: string, disabled = false) => <EditorChoice label={label} value={typeof draft.get(path) === 'boolean' ? String(draft.get(path)) : scalar(draft.get(path))} options={options} help={schemaAllows(path) ? help : 'Field unavailable in the installed schema.'} disabled={locked || disabled || !schemaAllows(path)} onChange={next => {
    apply([next === '' ? { op: 'remove', path } : { op: 'set', path, value: next === 'true' ? true : next === 'false' ? false : next }]);
  }} />;
  const suspendOptions = [{ value: '', label: 'Not specified' }, { value: 'false', label: 'Running' }, { value: 'true', label: 'Suspended' }];
  const stringRows = (title: string, path: ResourceEditorPath) => {
    const values = array(draft.get(path));
    const unsupported = draft.has(path) && (!Array.isArray(draft.get(path)) || values.some(value => typeof value !== 'string'));
    return <div className="batch-list"><div className="batch-row-heading"><h4>{title}</h4><Button size="sm" variant="ghost" disabled={templateLocked || unsupported} onClick={() => apply(draft.has(path) ? [{ op: 'insert', path, index: values.length, value: '' }] : [{ op: 'set', path, value: [''] }])}>Add {title.toLowerCase() === 'command' ? 'command part' : 'argument'}</Button></div>
      {unsupported ? <span role="status">Unsupported or protected value retained. Edit through the host’s safe source workflow.</span> : values.map((_, index) => <div className="batch-row" key={`${JSON.stringify(path)}-${index}`}>
        {field(`${title} ${index + 1}`, [...path, index], { disabled: templateLocked })}
        <Button size="sm" variant="ghost" disabled={templateLocked || Object.keys(errors).length > 0} aria-label={`Remove ${title.toLowerCase()} ${index + 1}`} onClick={() => apply([{ op: 'remove', path: [...path, index] }])}>Remove</Button>
      </div>)}
    </div>;
  };
  const owner = ownerName(draft);
  const managedBy = scalar(draft.get([...base, 'managedBy']));
  return <div className="batch-editor">
    {patchFailure && <div role="alert" className="batch-error">{patchFailure}</div>}
    {owner && <div role="status" className="batch-consequence">Controller-owned by {owner}. Inspect here; edit the owning workload separately.</div>}
    {managedBy && managedBy !== 'kubernetes.io/job-controller' && <div role="status" className="batch-consequence">External Job controller: {managedBy}. Controller availability is not verified.</div>}
    {section === 'schedule' && cron && <>
      <EditorSection title="Schedule"><div className="batch-grid">
        {field('Cron schedule', ['spec', 'schedule'], { validate: scheduleError, help: 'Five fields: minute, hour, day of month, month, weekday. Supports ranges, lists, steps and @daily-style macros. Admission remains authoritative.' })}
        {field('Time zone', ['spec', 'timeZone'], { optional: true, validate: timeZoneError, help: 'IANA time zone, such as Etc/UTC. Omit to use the controller’s local time zone. The server’s database is authoritative.' })}
        {choice('Concurrent runs', ['spec', 'concurrencyPolicy'], [{ value: '', label: 'Default (Allow)' }, { value: 'Allow', label: 'Allow overlap' }, { value: 'Forbid', label: 'Skip overlapping runs' }, { value: 'Replace', label: 'Replace active run' }], 'Forbid skips rather than queues. Replace cancels active scheduled Jobs. These policies do not govern manually created Jobs.')}
        {choice('Future scheduling', ['spec', 'suspend'], suspendOptions, 'Suspension only affects future scheduled runs. Resuming may start missed runs.')}
        {field('Missed-start deadline (seconds)', ['spec', 'startingDeadlineSeconds'], { numeric: true, max: INT64_MAX, help: 'How long a missed scheduled start remains eligible. Omit for no deadline. Very short deadlines can miss controller checks.' })}
      </div>
      {draft.get(['spec', 'concurrencyPolicy']) === 'Replace' && <div className="batch-consequence">Replace cancels the previous active scheduled Job.</div>}
      {draft.get(['spec', 'suspend']) === true && <div className="batch-consequence">Existing Jobs keep running. Resuming may process missed starts.</div>}
      </EditorSection>
      <EditorSection title="History retention"><div className="batch-grid">
        {field('Successful Jobs retained', ['spec', 'successfulJobsHistoryLimit'], { numeric: true, help: 'Omission uses the server default. Zero removes successful Job history.' })}
        {field('Failed Jobs retained', ['spec', 'failedJobsHistoryLimit'], { numeric: true, help: 'Omission uses the server default. Zero removes failed Job history.' })}
      </div>{['successfulJobsHistoryLimit', 'failedJobsHistoryLimit'].some(key => scalar(draft.get(['spec', key])) === '0') && <div className="batch-consequence">Zero retention makes matching finished Jobs eligible for deletion.</div>}</EditorSection>
    </>}
    {section === 'template' && <>
      {cron && context.intent !== 'create' && <div className="batch-consequence">Template changes affect future Jobs only, never existing Jobs.</div>}
      {immutableJob && <div className="batch-consequence">Existing Job executable template is immutable. No delete-and-recreate shortcut.</div>}
      <EditorSection title="Executable Pod template">
        {choice('Restart policy', [...pod, 'restartPolicy'], [{ value: '', label: 'Choose restart policy' }, { value: 'Never', label: 'Never' }, { value: 'OnFailure', label: 'On failure' }], 'Jobs require an explicit Never or OnFailure policy. Per-index retries and Pod failure policies require Never.', templateLocked)}
        {containers.map((_, index) => {
          const path = [...containersPath, index];
          return <div className="batch-container" key={index}><div className="batch-row-heading"><h4>Container {index + 1}</h4><Button size="sm" variant="ghost" disabled={templateLocked || Object.keys(errors).length > 0} aria-label={`Remove container ${index + 1}`} onClick={() => apply([{ op: 'remove', path }])}>Remove container</Button></div><div className="batch-grid">
            {field(`Container ${index + 1} name`, [...path, 'name'], { disabled: templateLocked, validate: next => /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(next) && next.length <= 63 && !containers.some((value, other) => other !== index && record(value).name === next) ? null : 'Use a unique DNS label, up to 63 characters.' })}
            {field(`Container ${index + 1} image`, [...path, 'image'], { disabled: templateLocked, validate: next => next.trim() ? null : 'Image is required.', help: 'Use the image reference you intend to execute. No example workload is inserted.' })}
          </div>{stringRows('Command', [...path, 'command'])}{stringRows('Argument', [...path, 'args'])}</div>;
        })}
        <Button size="sm" variant="outline" disabled={templateLocked} onClick={() => apply(draft.has(containersPath) ? [{ op: 'insert', path: containersPath, index: containers.length, value: { name: '', image: '' } }] : [{ op: 'set', path: containersPath, value: [{ name: '', image: '' }] }])}>Add container</Button>
      </EditorSection>
      <details><summary>Template labels and advanced Pod configuration</summary><KeyValueFields form={{ ...form, disabled: templateLocked, onValidityChange: error => report('template-labels', error) }} path={[...base, 'template', 'metadata', 'labels']} label="Pod template labels" validateKey={labelKeyError} validateValue={labelValueError} /><span className="batch-muted">Resources, environment, volumes, placement, init containers and other Pod fields remain in canonical source.</span></details>
    </>}
    {section === 'execution' && <>
      <EditorSection title={cron ? 'Future Job execution' : 'Execution'}><div className="batch-grid">
        {choice('Completion tracking', [...base, 'completionMode'], [{ value: '', label: 'Default (NonIndexed)' }, { value: 'NonIndexed', label: 'Non-indexed' }, { value: 'Indexed', label: 'Indexed' }], 'Indexed Jobs need explicit completions and permit at most 100000 parallel Pods.', immutableJob)}
        {field('Concurrent Pods', [...base, 'parallelism'], { numeric: true, help: 'Maximum desired concurrent Pods. Zero pauses new Pod creation without Job suspension semantics.' })}
        {field('Successful completions', [...base, 'completions'], { numeric: true, disabled: immutableJob, help: 'Omission permits work-queue completion. Existing non-indexed Jobs cannot change completions. Indexed resize uses an atomic paired update below.' })}
        {field('Retry limit', [...base, 'backoffLimit'], { numeric: true })}
        {field('Active deadline (seconds)', [...base, 'activeDeadlineSeconds'], { numeric: true, min: 1n, max: INT64_MAX, help: 'Positive execution deadline. Suspension resets the active deadline timer on resume.' })}
        {field('Finished cleanup TTL (seconds)', [...base, 'ttlSecondsAfterFinished'], { numeric: true, help: 'Omit to retain finished Jobs. Zero permits immediate cleanup after completion or failure.' })}
        {!cron && choice('Job suspension', ['spec', 'suspend'], suspendOptions, 'Suspending an existing Job deletes its active Pods and resets its start time. Resuming restarts the execution timer.')}
      </div>
      {!cron && draft.get(['spec', 'suspend']) === true && <div className="batch-consequence">Suspending an existing Job deletes active Pods and resets its execution timer.</div>}
      {scalar(draft.get([...base, 'ttlSecondsAfterFinished'])) === '0' && <div className="batch-consequence">Finished Jobs become immediately eligible for deletion.</div>}
      </EditorSection>
      {immutableJob && draft.get([...base, 'completionMode']) === 'Indexed' && <EditorSection title="Resize indexed execution"><div className="batch-row"><EditorField label="New parallelism and completions" value={elastic} disabled={locked} inputMode="numeric" error={elastic ? parseInteger(elastic).error : null} help="Both fields change in one atomic patch. Scaling down can remove active indexed Pods." onChange={next => { setElastic(next); report('elastic', next ? parseInteger(next).error : null); }} /><Button size="sm" disabled={locked || !elastic || !!parseInteger(elastic).error || (parseInteger(elastic).value ?? 0n) > 100000n} onClick={() => { const value = parseInteger(elastic).value!; if (!apply([{ op: 'set', path: [...base, 'parallelism'], value }, { op: 'set', path: [...base, 'completions'], value }])) setElastic(''); }}>Stage resize</Button></div></EditorSection>}
      <details><summary>Advanced execution policy</summary><div className="batch-grid">
        {field('Retries per index', [...base, 'backoffLimitPerIndex'], { numeric: true, disabled: immutableJob, help: 'Requires Indexed completion tracking and Never restart policy. Immutable on an existing Job.' })}
        {field('Maximum failed indexes', [...base, 'maxFailedIndexes'], { numeric: true, help: 'Requires retries per index. Must not exceed completions or 100000; high-completion Jobs have tighter limits.' })}
        {choice('Pod replacement', [...base, 'podReplacementPolicy'], [{ value: '', label: 'Server default' }, { value: 'Failed', label: 'After full termination' }, { value: 'TerminatingOrFailed', label: 'While terminating or failed' }], 'With a Pod failure policy, only Failed is allowed.')}
        {field('Managing controller', [...base, 'managedBy'], { optional: true, disabled: immutableJob, validate: managedByError, help: 'Domain-prefixed controller path, up to 63 characters. Custom values stop the built-in controller; installation is not inferred.' })}
      </div><span className="batch-muted">Selectors, manual selection, success rules and Pod failure rules stay unchanged in source. Existing immutable policies cannot be changed here.</span></details>
    </>}
    {section === 'status' && <EditorSection title="Observed status"><dl className="batch-facts">
      {(cron ? ['lastScheduleTime', 'lastSuccessfulTime'] : ['active', 'succeeded', 'failed', 'ready', 'startTime', 'completionTime', 'completedIndexes', 'failedIndexes']).map(key => <div key={key}><dt>{key}</dt><dd>{scalar(draft.get(['status', key])) || 'Not observed'}</dd></div>)}
      {cron && <div><dt>Active Job references</dt><dd>{draft.has(['status', 'active']) ? array(draft.get(['status', 'active'])).length : 'Not observed'}</dd></div>}
    </dl>{!cron && array(draft.get(['status', 'conditions'])).map((condition, index) => <div key={index}>{scalar(record(condition).type)}: {scalar(record(condition).status)}</div>)}<span className="batch-muted">Snapshot only. Status is controller-owned and never submitted.</span></EditorSection>}
    {section === 'workflow' && cron && <EditorSection title="Run saved CronJob now">
      <div className="batch-consequence">Manual Jobs ignore CronJob suspension and concurrency policy.</div>
      <span className="batch-muted">Use the freshly fetched saved template, not unsaved edits. Review a new Job before submission. No owner reference is added.</span>
      <Button size="sm" disabled={form.disabled || !launchAvailable || launchPending} onClick={() => void launch()}>{launchPending ? 'Opening Job review…' : 'Review manual Job'}</Button>
      {!launchAvailable && <div role="status">{context.intent === 'create' ? 'Save the CronJob before starting a manual Job workflow.' : 'Manual workflow is unavailable until saved CronJob read and independent Job create access are confirmed.'}</div>}
      {launchStatus && <div role="status">{launchStatus}</div>}
      <dl className="batch-facts"><div><dt>Source revision</dt><dd>{context.resourceVersion ?? 'Unavailable'}</dd></div><div><dt>Destination</dt><dd>{context.namespace ?? 'Unavailable'}</dd></div></dl>
    </EditorSection>}
    {canonicalIssues.length > 0 && !locked && <details className="batch-validation"><summary>{canonicalIssues.length} field {canonicalIssues.length === 1 ? 'issue' : 'issues'}</summary><ul>{canonicalIssues.map((issue, index) => <li key={index}>{issue.path?.join('.')}: {issue.message}</li>)}</ul></details>}
  </div>;
}
