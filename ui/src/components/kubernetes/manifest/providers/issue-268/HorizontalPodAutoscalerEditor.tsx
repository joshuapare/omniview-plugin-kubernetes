import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorChoice, EditorHelp, EditorSection, ExactValueField, KeyValueFields, ReferencePicker, patchError, patchFields } from '../../editor-controls';
import ResourceLinkChip from '../../../../shared/ResourceLinkChip';
import { hpaReadOnly, isManaged, metricBranches, metricTypes, parseInteger, sourceChange, targetChange, text, validQuantity, validateHPA, type MetricType } from './model';
import './autoscaling.css';

const options = (values: readonly string[]) => values.map(value => ({ value, label: value || 'Controller default' }));
const workloads = [
  { kind: 'Deployment', apiVersion: 'apps/v1', group: 'apps', version: 'v1', resource: 'deployments' },
  { kind: 'StatefulSet', apiVersion: 'apps/v1', group: 'apps', version: 'v1', resource: 'statefulsets' },
  { kind: 'ReplicaSet', apiVersion: 'apps/v1', group: 'apps', version: 'v1', resource: 'replicasets' },
  { kind: 'ReplicationController', apiVersion: 'v1', group: '', version: 'v1', resource: 'replicationcontrollers' },
] as const;

export default function HorizontalPodAutoscalerEditor(props: ResourceEditorFormProps) {
  return <HPASession key={props.draft.sessionID} {...props} />;
}
function HPASession(form: ResourceEditorFormProps) {
  const { context, draft } = form;
  const [localErrors, setLocalErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [patchFailure, setPatchFailure] = useState<string | null>(null);
  const disabled = form.disabled || hpaReadOnly(draft, context);
  const report = useCallback((key: string, error: string | null) => setLocalErrors(previous => {
    if (previous.get(key) === (error ?? undefined)) return previous;
    const next = new Map(previous);
    if (error) next.set(key, error); else next.delete(key);
    return next;
  }), []);
  const validation = validateHPA(draft, context);
  const pendingIssue = patchFailure || localErrors.values().next().value || null;
  const issue = pendingIssue || (validation[0] ? `${validation[0].path.join('.')}: ${validation[0].message}` : null);
  const validity = useRef(form.onValidityChange);
  useEffect(() => { validity.current = form.onValidityChange; }, [form.onValidityChange]);
  useEffect(() => { validity.current(pendingIssue); }, [pendingIssue]);
  useEffect(() => () => validity.current(null), []);
  const commit = (operations: readonly ResourceEditorPatch[]): string | null => {
    if (disabled) return 'This autoscaler is read-only.';
    const failure = patchError(patchFields(form, operations));
    setPatchFailure(failure);
    return failure;
  };
  const value = (path: ResourceEditorPath) => text(draft.get(path));
  const set = (path: ResourceEditorPath, next: unknown) => commit([{ op: 'set', path, value: next }]);
  const remove = (path: ResourceEditorPath) => commit([{ op: 'remove', path }]);
  const field = (label: string, path: ResourceEditorPath, help?: string, optional = false) => <ExactValueField key={JSON.stringify(path)} identity={`${draft.sessionID}:${JSON.stringify(path)}`} label={label} value={value(path)} disabled={disabled} help={help}
    parse={next => optional || next.trim() ? { valid: true, value: next } : { valid: false, error: 'Required.' }}
    onCommit={next => optional && next === '' ? remove(path) : set(path, next)} onValidityChange={error => report(JSON.stringify(path), error)} />;
  const number = (label: string, path: ResourceEditorPath, minimum: number, maximum: number, optional = false, help?: string) => <ExactValueField key={JSON.stringify(path)} label={label} identity={`${draft.sessionID}:${JSON.stringify(path)}`} value={value(path)} disabled={disabled} inputMode="numeric" help={help}
    parse={next => {
      if (optional && next === '') return { valid: true, value: '' };
      const parsed = parseInteger(next, minimum, maximum);
      if (parsed === null) return { valid: false, error: `Enter a whole number from ${minimum} to ${maximum}.` };
      const floor = parseInteger(text(draft.get(['spec', 'minReplicas']) ?? 1));
      if (path[1] === 'maxReplicas' && floor !== null && parsed < floor) return { valid: false, error: 'Maximum must not be below minimum.' };
      if (path[1] === 'minReplicas') {
        const ceiling = parseInteger(value(['spec', 'maxReplicas']));
        if (ceiling !== null && parsed > ceiling) return { valid: false, error: 'Minimum must not exceed maximum.' };
        const configured = draft.get(['spec', 'metrics']);
        if (parsed === 0 && (!Array.isArray(configured) || !configured.some((_, index) => ['Object', 'External'].includes(value(['spec', 'metrics', index, 'type']))))) return { valid: false, error: 'Zero requires an Object or External metric.' };
      }
      return { valid: true, value: parsed };
    }}
    onCommit={next => next === '' ? remove(path) : set(path, next)} onValidityChange={error => report(JSON.stringify(path), error)} />;
  const quantity = (label: string, path: ResourceEditorPath, optional = false, locked = false) => <ExactValueField key={JSON.stringify(path)} label={label} identity={`${draft.sessionID}:${JSON.stringify(path)}`} value={value(path)} disabled={disabled || locked} help="Exact Kubernetes quantity; no floating-point conversion."
    parse={next => optional && next === '' || validQuantity(next, optional) ? { valid: true, value: next } : { valid: false, error: optional ? 'Enter a nonnegative Kubernetes quantity.' : 'Enter a positive Kubernetes quantity.' }}
    onCommit={next => next === '' ? remove(path) : set(path, next)} onValidityChange={error => report(JSON.stringify(path), error)} />;
  const choice = (label: string, path: ResourceEditorPath, values: readonly string[], help?: string) => <EditorChoice label={label} value={value(path)} options={options(values)} disabled={disabled} help={help} onChange={next => next ? set(path, next) : remove(path)} />;
  const list = (path: ResourceEditorPath): readonly unknown[] => { const result = draft.get(path); return Array.isArray(result) ? result : []; };
  const add = (path: ResourceEditorPath, next: unknown) => commit(draft.has(path) ? [{ op: 'insert', path, index: list(path).length, value: next }] : [{ op: 'set', path, value: [next] }]);
  const removeRow = (path: ResourceEditorPath, index: number) => remove([...path, index]);
  const deleteButton = (label: string, path: ResourceEditorPath, index: number) => <Button size="sm" variant="ghost" disabled={disabled} aria-label={label} onClick={() => removeRow(path, index)}>Remove</Button>;
  const selector = (root: ResourceEditorPath) => <details className="hpa-advanced"><summary>Metric label selector</summary>
    <KeyValueFields form={{ ...form, disabled, onValidityChange: error => report(JSON.stringify(root), error) }} path={[...root, 'matchLabels']} label="Match labels" />
    {list([...root, 'matchExpressions']).map((_, index) => {
      const path = [...root, 'matchExpressions', index];
      const operator = value([...path, 'operator']);
      return <div className="hpa-row" key={index}>
        {field('Label key', [...path, 'key'])}
        <EditorChoice label="Operator" value={operator} options={options(['In', 'NotIn', 'Exists', 'DoesNotExist'])} disabled={disabled} onChange={next => commit([{ op: 'set', path: [...path, 'operator'], value: next }, ...(['Exists', 'DoesNotExist'].includes(next) ? [{ op: 'remove' as const, path: [...path, 'values'] }] : [])])} />
        {['In', 'NotIn'].includes(operator) && <div className="hpa-values">{list([...path, 'values']).map((__, row) => <div className="hpa-inline" key={row}>{field(`Value ${row + 1}`, [...path, 'values', row])}{deleteButton(`Remove selector value ${row + 1}`, [...path, 'values'], row)}</div>)}<Button size="sm" variant="ghost" disabled={disabled} onClick={() => add([...path, 'values'], '')}>Add value</Button></div>}
        {deleteButton(`Remove expression ${index + 1}`, [...root, 'matchExpressions'], index)}
      </div>;
    })}
    <Button size="sm" variant="ghost" disabled={disabled} onClick={() => add([...root, 'matchExpressions'], { key: '', operator: 'In', values: [] })}>Add expression</Button>
  </details>;
  const metrics = list(['spec', 'metrics']);
  const selectedWorkload = workloads.find(workload => workload.kind === value(['spec', 'scaleTargetRef', 'kind']) && workload.apiVersion === value(['spec', 'scaleTargetRef', 'apiVersion']));
  const section = form.section;
  return <div className="hpa-editor">
    {patchFailure && <div role="alert" className="hpa-warning">{patchFailure}</div>}
    {isManaged(draft) && <div className="hpa-warning">Controller-owned autoscaler. Edit its upstream configuration.</div>}
    {!isManaged(draft) && disabled && context.intent !== 'inspect' && <div className="hpa-warning">Update is not available. Inspect only.</div>}
    {section === 'target' && <EditorSection title="Scale target">
      <EditorChoice label="Workload" value={selectedWorkload?.kind ?? 'Custom'} options={[...workloads.map(workload => ({ value: workload.kind, label: workload.kind })), { value: 'Custom', label: 'Custom scalable resource' }]} disabled={disabled} help="Resource must implement /scale. A reference lookup does not prove scale permission or controller health." onChange={next => { const workload = workloads.find(item => item.kind === next); if (workload) commit([{ op: 'set', path: ['spec', 'scaleTargetRef', 'apiVersion'], value: workload.apiVersion }, { op: 'set', path: ['spec', 'scaleTargetRef', 'kind'], value: workload.kind }]); else commit([{ op: 'remove', path: ['spec', 'scaleTargetRef', 'apiVersion'] }, { op: 'remove', path: ['spec', 'scaleTargetRef', 'kind'] }]); }} />
      {!selectedWorkload && <div className="hpa-grid">{field('API version', ['spec', 'scaleTargetRef', 'apiVersion'], 'Exact served API version; for example group/version.', true)}{field('Kind', ['spec', 'scaleTargetRef', 'kind'])}</div>}
      {selectedWorkload && context.namespace ? <TargetName form={{ ...form, disabled }} workload={selectedWorkload} value={value(['spec', 'scaleTargetRef', 'name'])} onCommit={next => set(['spec', 'scaleTargetRef', 'name'], next)} onValidityChange={error => report('targetName', error)} /> : field('Target name', ['spec', 'scaleTargetRef', 'name'], 'Target must be in this autoscaler’s namespace.')}
      {context.namespace && value(['spec', 'scaleTargetRef', 'apiVersion']) && value(['spec', 'scaleTargetRef', 'kind']) && value(['spec', 'scaleTargetRef', 'name']) && <div className="hpa-inline">
        <span>Target workload</span><ResourceLinkChip connectionID={context.connectionID} namespace={context.namespace} ownerReference={{
          apiVersion: value(['spec', 'scaleTargetRef', 'apiVersion']), kind: value(['spec', 'scaleTargetRef', 'kind']), name: value(['spec', 'scaleTargetRef', 'name']),
        }} resourceName={value(['spec', 'scaleTargetRef', 'name'])} />
        <EditorHelp label="Open target workload">Open the discovered target resource. Use its existing Scale action when available; authorization and scale-subresource discovery remain separate.</EditorHelp>
      </div>}
      <div className="hpa-warning">Changing target redirects scaling. Manual scaling belongs to the target workload’s Scale action; HPA may overwrite replicas.</div>
    </EditorSection>}
    {section === 'bounds' && <EditorSection title="Replica bounds"><div className="hpa-grid">
      {number('Minimum replicas', ['spec', 'minReplicas'], context.version === 'v2' && context.discovery.features.HPAScaleToZero === 'available' ? 0 : 1, 2147483647, true, 'Omit for API default of 1. Zero also requires Object or External metrics and verified HPAScaleToZero.')}
      {number('Maximum replicas', ['spec', 'maxReplicas'], 1, 2147483647)}
    </div><div className="hpa-warning">Bounds affect capacity and cost.</div></EditorSection>}
    {section === 'metrics' && (context.version === 'v1' ? <EditorSection title="CPU target">{number('Average CPU utilization (%)', ['spec', 'targetCPUUtilizationPercentage'], 1, 2147483647, true, 'Percent of requested CPU. Omit for API defaults. Other metric types require autoscaling/v2; no automatic conversion.')}</EditorSection> : <EditorSection title="Metrics">
      <div className="hpa-heading"><span>{metrics.length ? `${metrics.length} configured` : 'Controller CPU default'}</span><EditorHelp label="Multiple metrics">The controller uses the largest replica recommendation. Resource requests and metrics adapters must be configured separately.</EditorHelp></div>
      {metrics.map((_, index) => {
        const type = value(['spec', 'metrics', index, 'type']) as MetricType;
        const branch = metricBranches[type];
        const root = ['spec', 'metrics', index, branch];
        const target = [...root, 'target'];
        const targetType = value([...target, 'type']);
        const targetTypes = type === 'Resource' || type === 'ContainerResource' ? ['Utilization', 'AverageValue'] : type === 'Pods' ? ['AverageValue'] : ['Value', 'AverageValue'];
        return <div className="hpa-card" key={index}><div className="hpa-heading"><strong>Metric {index + 1}</strong>{deleteButton(`Remove metric ${index + 1}`, ['spec', 'metrics'], index)}</div>
          <EditorChoice label="Metric source" value={type} options={options(metricTypes)} disabled={disabled} help="Changing source removes its previous configuration." onChange={next => commit(sourceChange(index, next as MetricType))} />
          <div className="hpa-grid">{type === 'Resource' || type === 'ContainerResource' ? field('Resource name', [...root, 'name'], 'CPU, memory, or a supported resource metric.') : field('Metric name', [...root, 'metric', 'name'])}{type === 'ContainerResource' && field('Container name', [...root, 'container'])}</div>
          {type === 'Object' && <details className="hpa-advanced" open><summary>Described object</summary><div className="hpa-grid">{field('Object API version', [...root, 'describedObject', 'apiVersion'], undefined, true)}{field('Object kind', [...root, 'describedObject', 'kind'])}{field('Object name', [...root, 'describedObject', 'name'])}</div></details>}
          <div className="hpa-grid"><EditorChoice label="Target measure" value={targetType} options={options(targetTypes)} disabled={disabled} onChange={next => commit(targetChange(target, next))} />
          {targetType === 'Utilization' ? number('Average utilization (%)', [...target, 'averageUtilization'], 1, 2147483647) : targetType === 'AverageValue' ? quantity('Average quantity', [...target, 'averageValue']) : targetType === 'Value' ? quantity('Total quantity', [...target, 'value']) : null}</div>
          {!['Resource', 'ContainerResource'].includes(type) && selector([...root, 'metric', 'selector'])}
        </div>;
      })}
      <div className="hpa-actions"><Button size="sm" variant="ghost" disabled={disabled} onClick={() => add(['spec', 'metrics'], { type: 'Resource', resource: {} })}>Add metric</Button>{draft.has(['spec', 'metrics']) && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => remove(['spec', 'metrics'])}>Use controller CPU default</Button>}</div>
    </EditorSection>)}
    {section === 'behavior' && (context.version === 'v1' ? <div className="hpa-warning">Behavior controls require autoscaling/v2. Version conversion is not automatic.</div> : <>{(['scaleUp', 'scaleDown'] as const).map(direction => {
      const root = ['spec', 'behavior', direction];
      return <EditorSection key={direction} title={direction === 'scaleUp' ? 'Scale up' : 'Scale down'}><div className="hpa-grid">{number('Stabilization window (seconds)', [...root, 'stabilizationWindowSeconds'], 0, 3600, true)}{choice('Policy selection', [...root, 'selectPolicy'], ['', 'Max', 'Min', 'Disabled'], 'Max permits the largest change. Min uses the smallest. Disabled stops scaling in this direction.')}</div>
        {list([...root, 'policies']).map((_, index) => <div className="hpa-row" key={index}>{choice('Change unit', [...root, 'policies', index, 'type'], ['Pods', 'Percent'])}{number('Maximum change', [...root, 'policies', index, 'value'], 1, 2147483647)}{number('Period (seconds)', [...root, 'policies', index, 'periodSeconds'], 1, 1800)}{deleteButton(`Remove ${direction} policy ${index + 1}`, [...root, 'policies'], index)}</div>)}
        <div className="hpa-actions"><Button size="sm" variant="ghost" disabled={disabled} onClick={() => add([...root, 'policies'], { type: 'Pods' })}>Add policy</Button>{draft.has([...root, 'policies']) && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => remove([...root, 'policies'])}>Use controller policies</Button>}</div>
        <details className="hpa-advanced"><summary>Advanced tolerance <EditorHelp label="Tolerance">Requires verified HPAConfigurableTolerance. Omit to use the controller-wide tolerance. Existing values remain untouched when feature availability is unknown.</EditorHelp></summary>{quantity('Tolerance ratio', [...root, 'tolerance'], true, context.discovery.features.HPAConfigurableTolerance !== 'available')}</details>
      </EditorSection>;
    })}</>)}
    {section === 'status' && <EditorSection title="Controller snapshot"><dl className="hpa-facts">{['observedGeneration', 'currentReplicas', 'desiredReplicas', 'lastScaleTime', ...(context.version === 'v1' ? ['currentCPUUtilizationPercentage'] : [])].map(key => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1')}</dt><dd>{value(['status', key]) || 'Not reported'}</dd></div>)}</dl>
      {list(['status', 'conditions']).map((_, index) => <div className="hpa-condition" key={index}><strong>{value(['status', 'conditions', index, 'type'])}</strong><span>{value(['status', 'conditions', index, 'status'])}</span><span>{value(['status', 'conditions', index, 'reason'])}</span></div>)}
      {list(['status', 'currentMetrics']).map((_, index) => {
        const type = value(['status', 'currentMetrics', index, 'type']) as MetricType;
        const root = ['status', 'currentMetrics', index, metricBranches[type] ?? ''];
        return <div className="hpa-condition" key={index}><strong>{type}</strong><span>{value([...root, 'name']) || value([...root, 'metric', 'name'])}</span><span>{['averageUtilization', 'averageValue', 'value'].map(key => value([...root, 'current', key])).filter(Boolean).join(' / ') || 'Not reported'}</span></div>;
      })}
      <div className="hpa-warning">Read-only controller snapshot, not a live health guarantee.</div>
    </EditorSection>}
    {issue && <div role="status" className="hpa-warning">{issue}</div>}
  </div>;
}

function TargetName({ form, workload, value, onCommit, onValidityChange }: {
  form: ResourceEditorFormProps; workload: typeof workloads[number]; value: string;
  onCommit: (value: string) => string | null; onValidityChange: (error: string | null) => void;
}) {
  const identity = JSON.stringify([form.draft.sessionID, workload.kind, value]);
  const [edit, setEdit] = useState<{ identity: string; input: string; error: string | null }>({ identity, input: value, error: null });
  if (edit.identity !== identity) setEdit({ identity, input: value, error: null });
  const { input, error } = edit.identity === identity ? edit : { input: value, error: null };
  const report = useRef(onValidityChange);
  useEffect(() => { report.current = onValidityChange; }, [onValidityChange]);
  useEffect(() => { report.current(error); }, [error]);
  useEffect(() => () => report.current(null), []);
  return <ReferencePicker form={form} query={{ group: workload.group, version: workload.version, resource: workload.resource, namespace: form.context.namespace }}
    label="Target name" value={input} error={error} help="Same namespace. Existing or manually entered names stay valid when lookup is unavailable."
    onChange={next => { const failure = next.trim() ? onCommit(next) : 'Required.'; setEdit({ identity, input: next, error: failure }); onValidityChange(failure); }} />;
}
