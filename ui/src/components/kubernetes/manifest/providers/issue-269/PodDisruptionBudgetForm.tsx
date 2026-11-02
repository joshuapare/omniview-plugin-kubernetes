import { Button, TagInput } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';

import { useEffect, useId, useState } from 'react';

import { EditorChoice, EditorField, EditorHelp, EditorSection, patchFields, scalarText, useEditorReferences } from '../../editor-controls';

import { budgetOperations, controllerOwned, expressionOperators, matchesSelector, parseBudget, policyReadOnly, reconcileExpressionIdentity, record, selectionOperations, selectorMode, statusIsCurrent, validLabelKey, validLabelValue, type BudgetRule, type BudgetUnit } from './policy';
import styles from './PolicyEditor.module.css';

type LocalValue = { text: string; base: string; error: string | null; input?: string };
type BudgetDraft = { base: string; rule: BudgetRule | 'omitted'; unit: BudgetUnit; amount: string };
const operatorOptions = expressionOperators.map(value => ({ value, label: value }));

export default function PodDisruptionBudgetForm(props: ResourceEditorFormProps) {
  return <PolicySession key={props.draft.sessionID} {...props} />;
}

function PolicySession(form: ResourceEditorFormProps) {
  const { draft, context, section, onValidityChange } = form;
  const min = draft.get(['spec', 'minAvailable']);
  const max = draft.get(['spec', 'maxUnavailable']);
  const canonicalAmount = min ?? max;
  const budgetBase = `${typeof min}:${scalarText(min)}|${typeof max}:${scalarText(max)}`;
  const [budgetDraft, setBudgetDraft] = useState<BudgetDraft | null>(null);
  const budget = budgetDraft?.base === budgetBase ? budgetDraft : null;
  const rule = budget?.rule ?? (min != null ? 'minAvailable' : max != null ? 'maxUnavailable' : 'omitted');
  const unit = budget?.unit ?? (typeof canonicalAmount === 'string' ? 'percent' : 'pods');
  const amount = budget?.amount ?? scalarText(canonicalAmount).replace(/%$/, '');
  const tokenID = useId();
  const [local, setLocal] = useState<Record<string, LocalValue>>({});
  const [patchFailure, setPatchFailure] = useState<string | null>(null);
  const [labelEditing, setLabelEditing] = useState(false);
  const [labelKey, setLabelKey] = useState('');
  const [labelValue, setLabelValue] = useState('');
  const [expressionKey, setExpressionKey] = useState('');
  const [expressionOperator, setExpressionOperator] = useState('In');
  const [expressionValues, setExpressionValues] = useState<string[]>([]);
  const [expressionInput, setExpressionInput] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);
  const disabled = form.disabled || policyReadOnly(draft, context);
  const selector = draft.get(['spec', 'selector']);
  const mode = selectorMode(draft);
  const labels = record(selector) && record(selector.matchLabels) ? selector.matchLabels : {};
  const expressions = record(selector) && Array.isArray(selector.matchExpressions) ? selector.matchExpressions : [];
  const [expressionIdentity, setExpressionIdentity] = useState(() => reconcileExpressionIdentity(undefined, expressions));
  const expressionRows = reconcileExpressionIdentity(expressionIdentity, expressions);
  if (expressionRows !== expressionIdentity) setExpressionIdentity(expressionRows);
  const policy = scalarText(draft.get(['spec', 'unhealthyPodEvictionPolicy']));
  const parsedAmount = parseBudget(amount, unit);
  const amountError = rule !== 'omitted' && !parsedAmount.valid ? parsedAmount.error : null;
  const localError = Object.entries(local).find(([key, value]) => {
    const canonical = draft.get(JSON.parse(key) as ResourceEditorPath);
    return (value.error || value.input) && value.base === (Array.isArray(canonical) ? JSON.stringify(canonical) : scalarText(canonical));
  })?.[1];
  const pending = labelKey !== '' || labelValue !== '' || expressionKey !== '' || expressionValues.length > 0 || expressionInput !== '';
  const pendingAmountError = budget ? amountError : null;

  useEffect(() => {
    onValidityChange(disabled ? null : pendingAmountError || localError?.error || (localError?.input ? 'Commit or clear the pending expression value.' : null) || patchFailure || rowError || (pending ? 'Add the pending selector requirement or clear its fields.' : null));
  }, [disabled, pendingAmountError, localError, patchFailure, rowError, pending, onValidityChange]);
  useEffect(() => () => onValidityChange(null), [onValidityChange]);

  function commit(operations: readonly ResourceEditorPatch[]): boolean {
    if (disabled) return false;
    const result = patchFields(form, operations);
    setPatchFailure(result.status === 'accepted' ? null : result.message);
    return result.status === 'accepted';
  }
  function textField(path: ResourceEditorPath, label: string, validate: (text: string) => boolean) {
    const key = JSON.stringify(path);
    const canonical = scalarText(draft.get(path));
    const current = local[key]?.base === canonical ? local[key] : undefined;
    return <EditorField label={label} value={current?.text ?? canonical} error={current?.error} disabled={disabled} onChange={next => {
      const error = validate(next) ? null : label.startsWith('Expression key') ? 'Enter a valid Kubernetes label key.' : 'Enter a valid Kubernetes label value.';
      setLocal(values => ({ ...values, [key]: { text: next, base: canonical, error } }));
      if (!error) commit([{ op: 'set', path, value: next }]);
    }} />;
  }
  function updateBudget(nextRule: BudgetRule | 'omitted', nextUnit: BudgetUnit, nextAmount: string) {
    setBudgetDraft({ base: budgetBase, rule: nextRule, unit: nextUnit, amount: nextAmount });
    if (nextRule === 'omitted') {
      commit([{ op: 'remove', path: ['spec', 'minAvailable'] }, { op: 'remove', path: ['spec', 'maxUnavailable'] }]);
      return;
    }
    const parsed = parseBudget(nextAmount, nextUnit);
    if (parsed.valid) commit(budgetOperations(nextRule, parsed.value));
  }
  function chooseSelection(next: string) {
    if (pending) { setRowError('Add pending requirements or clear their fields before changing scope.'); return; }
    if (next !== 'omitted' && next !== 'none' && next !== 'all' && next !== 'labels') return;
    const operations = selectionOperations(draft, next);
    if (next === 'labels' && mode === 'labels') { setLabelEditing(true); return; }
    if (commit(operations)) {
      setLabelEditing(next === 'labels'); setLabelKey(''); setLabelValue(''); setExpressionKey(''); setExpressionValues([]); setLocal({}); setRowError(null);
    }
  }
  const safeForm = { ...form, disabled };
  return <div className={styles.form}>
    {controllerOwned(draft) || context.ownership?.status === 'controller' || context.ownership?.status === 'system' ? <p role="status" className={styles.notice}>Controller-managed budget. Edit its owning source.</p> : disabled && <p role="status" className={styles.notice}>Read-only budget. Draft retained; no update permission assumed.</p>}
    {patchFailure && <p role="alert">{patchFailure}</p>}
    <div hidden={section !== 'budget'} className={styles.stack}>
      <EditorSection title="Disruption budget">
        <div className={styles.grid}>
          <EditorChoice label="Budget rule" value={rule} disabled={disabled} help="Minimum available keeps healthy pods after eviction. Maximum unavailable limits unavailable pods and requires compatible scalable-controller ownership. Percentages round up." options={[{ value: 'omitted', label: 'No budget amount (omitted)' }, { value: 'minAvailable', label: 'Minimum available' }, { value: 'maxUnavailable', label: 'Maximum unavailable' }]} onChange={next => updateBudget(next as BudgetRule | 'omitted', unit, amount)} />
          {rule !== 'omitted' && <><EditorChoice label="Measure" value={unit} options={[{ value: 'pods', label: 'Pods (integer)' }, { value: 'percent', label: 'Percentage (string)' }]} disabled={disabled} onChange={next => updateBudget(rule, next as BudgetUnit, amount)} /><EditorField label={unit === 'percent' ? 'Amount (%)' : 'Amount (pods)'} value={amount} inputMode="numeric" error={amountError} disabled={disabled} onChange={next => updateBudget(rule, unit, next)} /></>}
        </div>
        {rule === 'omitted' && <p className={styles.notice}>No budget amount specified. API admission remains authoritative.</p>}
        {rule === 'maxUnavailable' && <p className={styles.notice}>Selected pods must use compatible scalable-controller ownership. Lookup does not verify this.</p>}
      </EditorSection>
      <EditorSection title="Unhealthy pods">
        <EditorChoice label="Eviction policy" value={policy || 'omitted'} options={[{ value: 'omitted', label: 'Default (IfHealthyBudget, omitted)' }, { value: 'IfHealthyBudget', label: 'If healthy budget permits' }, { value: 'AlwaysAllow', label: 'Always allow running unready pods' }]} disabled={disabled} help="Healthy pods remain budget-protected. IfHealthyBudget allows running unready pods only when currentHealthy is at least desiredHealthy." onChange={next => commit([next === 'omitted' ? { op: 'remove', path: ['spec', 'unhealthyPodEvictionPolicy'] } : { op: 'set', path: ['spec', 'unhealthyPodEvictionPolicy'], value: next }])} />
        {policy === 'AlwaysAllow' && <p className={styles.notice}>Running unready pods may be evicted even when the application is disrupted.</p>}
      </EditorSection>
      <p className={styles.notice}>PDBs do not prevent direct Pod deletion or involuntary disruption.</p>
    </div>
    <div hidden={section !== 'selector'} className={styles.stack}>
      <EditorSection title="Pod selection">
        <EditorChoice label="Selection scope" value={mode === 'all' && labelEditing ? 'labels' : mode} disabled={disabled} options={[{ value: 'omitted', label: 'No pods (selector omitted)' }, { value: 'none', label: 'No pods (null selector)' }, { value: 'all', label: 'All namespace pods ({})' }, { value: 'labels', label: 'Label requirements' }]} help="policy/v1 uses an empty object for all namespace pods; null or omitted matches none. All label requirements combine with AND." onChange={chooseSelection} />
        {mode === 'all' && <p className={styles.notice}>This budget selects every Pod in the namespace.</p>}
        {(mode === 'labels' || (mode === 'all' && labelEditing)) && <>
          <h4>Match labels</h4>
          {Object.entries(labels).map(([key]) => <div className={styles.row} key={key}><code className={styles.key}>{key}</code>{textField(['spec', 'selector', 'matchLabels', key], `Label value ${key}`, validLabelValue)}<Button size="sm" variant="ghost" disabled={disabled} aria-label={`Remove label ${key}`} onClick={() => {
            if (commit([{ op: 'remove', path: ['spec', 'selector', 'matchLabels', key] }])) setLocal(values => Object.fromEntries(Object.entries(values).filter(([path]) => path !== JSON.stringify(['spec', 'selector', 'matchLabels', key]))));
          }}>Remove</Button></div>)}
          <div className={styles.row}><EditorField label="New label key" value={labelKey} disabled={disabled} onChange={next => { setLabelKey(next); setRowError(null); }} /><EditorField label="New label value" value={labelValue} disabled={disabled} onChange={next => { setLabelValue(next); setRowError(null); }} /><Button size="sm" disabled={disabled} onClick={() => {
            if (!validLabelKey(labelKey) || !validLabelValue(labelValue)) { setRowError('Enter a valid label key and value.'); return; }
            if (Object.hasOwn(labels, labelKey)) { setRowError('Label key already exists.'); return; }
            if (commit([{ op: 'set', path: ['spec', 'selector', 'matchLabels', labelKey], value: labelValue }])) { setLabelKey(''); setLabelValue(''); setRowError(null); }
          }}>Add label</Button></div>
          <details className={styles.advanced} open={expressions.length > 0 || undefined}><summary>Expression requirements</summary>
            {expressions.map((entry, index) => {
              const row = record(entry) ? entry : {};
              const path = ['spec', 'selector', 'matchExpressions', index];
              const valuesPath = JSON.stringify([...path, 'values']);
              const valuesBase = Array.isArray(row.values) ? JSON.stringify(row.values) : scalarText(row.values);
              const tokenDraft = local[valuesPath]?.base === valuesBase ? local[valuesPath] : undefined;
              const tokens = tokenDraft ? JSON.parse(tokenDraft.text) as string[] : Array.isArray(row.values) ? row.values as string[] : [];
              return <div className={styles.expression} key={expressionRows.ids[index]}>
                <div className={styles.row}>{textField([...path, 'key'], `Expression key ${index + 1}`, validLabelKey)}<EditorChoice label={`Operator ${index + 1}`} value={scalarText(row.operator)} options={operatorOptions} disabled={disabled} onChange={next => commit([{ op: 'set', path: [...path, 'operator'], value: next }, ...(['Exists', 'DoesNotExist'].includes(next) ? [{ op: 'remove' as const, path: [...path, 'values'] }] : [])])} /><Button size="sm" variant="ghost" disabled={disabled} aria-label={`Remove expression ${index + 1}`} onClick={() => {
                  if (commit([{ op: 'remove', path }])) {
                    setExpressionIdentity(current => ({ ...current, signatures: current.signatures.filter((_, rowIndex) => rowIndex !== index), ids: current.ids.filter((_, rowIndex) => rowIndex !== index) }));
                    setLocal(values => {
                    const shifted: Record<string, LocalValue> = {};
                    Object.entries(values).forEach(([key, value]) => {
                      const parts = JSON.parse(key) as (string | number)[];
                      if (parts[2] === 'matchExpressions' && typeof parts[3] === 'number') {
                        if (parts[3] === index) return;
                        if (parts[3] > index) parts[3]--;
                      }
                      shifted[JSON.stringify(parts)] = value;
                    });
                    return shifted;
                    });
                  }
                }}>Remove</Button></div>
                {(row.operator === 'In' || row.operator === 'NotIn') && <div className={styles.tokens}><label htmlFor={`${tokenID}-${expressionRows.ids[index]}`}>Values {index + 1}</label><TagInput size="sm" value={tokens} disabled={disabled} inputProps={{ id: `${tokenID}-${expressionRows.ids[index]}`, 'aria-label': `Expression values ${index + 1}`, onInput: event => { const input = event.currentTarget.value; setLocal(values => ({ ...values, [valuesPath]: { text: JSON.stringify(tokens), base: valuesBase, error: tokenDraft?.error ?? null, input } })); } }} onChange={next => {
                  const error = !next.length ? 'Add at least one label value.' : next.some(value => !validLabelValue(value)) ? 'Use valid label values.' : null;
                  setLocal(values => ({ ...values, [valuesPath]: { text: JSON.stringify(next), base: valuesBase, error } }));
                  if (error) return;
                  const previous = Array.isArray(row.values) ? row.values : [];
                  const operations: ResourceEditorPatch[] = [];
                  for (let i = previous.length - 1; i >= next.length; i--) operations.push({ op: 'remove', path: [...path, 'values', i] });
                  next.forEach((value, i) => { if (previous[i] !== value) operations.push({ op: 'set', path: [...path, 'values', i], value }); });
                  if (commit(operations)) setRowError(null);
                }} />{tokenDraft?.error && <span role="alert">{tokenDraft.error}</span>}</div>}
              </div>;
            })}
            <div className={styles.expression}><div className={styles.grid}><EditorField label="New expression key" value={expressionKey} disabled={disabled} onChange={next => { setExpressionKey(next); setRowError(null); }} /><EditorChoice label="New expression operator" value={expressionOperator} options={operatorOptions} disabled={disabled} onChange={next => { setExpressionOperator(next); setRowError(null); if (next === 'Exists' || next === 'DoesNotExist') { setExpressionValues([]); setExpressionInput(''); } }} /></div>
              {(expressionOperator === 'In' || expressionOperator === 'NotIn') && <div className={styles.tokens}><label htmlFor={`${tokenID}-new`}>New expression values</label><TagInput size="sm" value={expressionValues} disabled={disabled} inputProps={{ id: `${tokenID}-new`, 'aria-label': 'New expression values', onInput: event => setExpressionInput(event.currentTarget.value) }} onChange={next => { setExpressionValues(next); setExpressionInput(''); setRowError(null); }} /></div>}
              <Button size="sm" disabled={disabled} onClick={() => {
                const needsValues = expressionOperator === 'In' || expressionOperator === 'NotIn';
                if (!validLabelKey(expressionKey) || (needsValues && (!expressionValues.length || expressionValues.some(value => !validLabelValue(value))))) { setRowError('Enter a valid expression key and its required values.'); return; }
                const value = { key: expressionKey, operator: expressionOperator, ...(needsValues ? { values: expressionValues } : {}) };
                if (commit(draft.has(['spec', 'selector', 'matchExpressions']) && Array.isArray(draft.get(['spec', 'selector', 'matchExpressions'])) ? [{ op: 'insert', path: ['spec', 'selector', 'matchExpressions'], index: expressions.length, value }] : [{ op: 'set', path: ['spec', 'selector', 'matchExpressions'], value: [value] }])) { setExpressionKey(''); setExpressionValues([]); setRowError(null); }
              }}>Add expression</Button>
            </div>
          </details>
          {rowError && <p role="alert">{rowError}</p>}
        </>}
      </EditorSection>
      {section === 'selector' && <PodMatches form={safeForm} selector={selector} />}
    </div>
    <div hidden={section !== 'status'}><DisruptionStatus form={form} /></div>
  </div>;
}

function PodMatches({ form, selector }: { form: ResourceEditorFormProps; selector: unknown }) {
  const namespace = form.context.namespace || scalarText(form.draft.get(['metadata', 'namespace']));
  return namespace ? <NamespacedPodMatches form={form} selector={selector} namespace={namespace} /> : <p role="status">Choose a namespace to preview Pod matches.</p>;
}

function NamespacedPodMatches({ form, selector, namespace }: { form: ResourceEditorFormProps; selector: unknown; namespace: string }) {
  const state = useEditorReferences(form, { group: '', version: 'v1', resource: 'pods', namespace, projection: 'metadata' });
  const items = state.status === 'ready' ? state.items.filter(item => item.namespace === namespace && matchesSelector(item.labels ?? {}, selector)) : [];
  return <EditorSection title="Matching Pods"><div role="status" aria-label="Pod lookup" data-state={state.status}>
    {!namespace ? 'Choose a namespace to preview Pod matches.' : state.status === 'loading' ? 'Loading Pod metadata…' : state.status === 'ready' ? `${items.length} matching Pods from available metadata. This is not a readiness or eviction-permission check.` : state.status === 'denied' ? 'Pod lookup denied. Selector editing remains available.' : state.status === 'absent' ? 'Pod API absent. Selector retained.' : 'Pod lookup unavailable. Selector retained.'}
  </div>{namespace && items.length > 0 && <ul className={styles.matches}>{items.map(item => <li key={item.uid || item.name}>{item.name}</li>)}</ul>}</EditorSection>;
}

function DisruptionStatus({ form }: { form: ResourceEditorFormProps }) {
  const { draft } = form;
  const conditions = draft.get(['status', 'conditions']);
  const disrupted = draft.get(['status', 'disruptedPods']);
  return <>
    <EditorSection title="Controller status">
      {!statusIsCurrent(draft) && <p role="status" className={styles.notice}>Status is missing or stale. Do not infer eviction permission.</p>}
      <dl className={styles.status}>{[['Generation', ['metadata', 'generation']], ['Observed generation', ['status', 'observedGeneration']], ['Disruptions allowed', ['status', 'disruptionsAllowed']], ['Healthy pods', ['status', 'currentHealthy']], ['Desired healthy', ['status', 'desiredHealthy']], ['Expected pods', ['status', 'expectedPods']]].map(([label, path]) => <div key={label as string}><dt>{label}</dt><dd>{scalarText(draft.get(path as string[])) || 'Not reported'}</dd></div>)}</dl>
      <EditorHelp label="Disruption status">Counters and conditions belong to the disruption controller. Only current observed generation is meaningful; even current counters do not authorize an eviction.</EditorHelp>
      <details className={styles.advanced}><summary>Conditions and pending disruptions</summary>
        <ul>{Array.isArray(conditions) && conditions.map(condition => record(condition) ? <li key={scalarText(condition.type)}>{scalarText(condition.type)} · {scalarText(condition.status)} · {scalarText(condition.reason)} · {scalarText(condition.lastTransitionTime)}</li> : null)}</ul>
        {record(disrupted) && Object.keys(disrupted).map(name => <div key={name}>{name} · {scalarText(disrupted[name])}</div>)}
        {!Array.isArray(conditions) && !record(disrupted) && <span>No controller detail reported.</span>}
      </details>
    </EditorSection>
    <EditorSection title="Pod eviction boundary"><p className={styles.notice}>Evict an existing Pod from its Pod action. PDB status never grants eviction permission.</p><EditorHelp label="Pod eviction">Eviction uses <code>{'POST /api/v1/namespaces/{namespace}/pods/{name}/eviction'}</code> with a policy/v1 Eviction payload. It is not a persisted resource and never uses Create Eviction. Pod actions retain identity preconditions and admission errors.</EditorHelp></EditorSection>
  </>;
}
