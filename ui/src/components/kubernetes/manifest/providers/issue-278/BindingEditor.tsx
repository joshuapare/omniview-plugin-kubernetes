import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { useState } from 'react';
import { Choice, Section } from '../../ResourceFormFields';
import { AdmissionPanel, Matching, Pick, Reference, Scalar, Selector, useAdmission } from './AdmissionFields';
import { isMutating, rows, text } from './model';

function Enforcement() {
  const { form, disabled, commit, validity, partial, remember } = useAdmission();
  const key = 'validationActions';
  const current = rows(form.draft.get(['spec', 'validationActions'])).map(text).join(',');
  const [localActions, setActions] = useState<string[]>(() => (partial.get(key)?.value ?? current).split(',').filter(Boolean));
  const [error, setError] = useState<string | null>(partial.get(key)?.error ?? (localActions.includes('Deny') && localActions.includes('Warn') ? 'Deny and Warn cannot be combined.' : !localActions.length ? 'Choose at least one validation action.' : null));
  const actions = error ? localActions : current.split(',').filter(Boolean);
  return <Section title="Validation actions"><div className="admission-actions">{['Deny', 'Warn', 'Audit'].map(action => <label key={action}><input type="checkbox" checked={actions.includes(action)} disabled={disabled} onChange={event => {
    const next = event.target.checked ? [...actions, action] : actions.filter(value => value !== action);
    const failure = next.includes('Deny') && next.includes('Warn') ? 'Deny and Warn cannot be combined.' : !next.length ? 'Choose at least one validation action.' : commit([{ op: 'set', path: ['spec', 'validationActions'], value: next }]);
    setActions(next); setError(failure); remember(key, next.join(','), failure); validity(key, failure);
  }} />{action}</label>)}</div>{error && <span role="alert">{error}</span>}{actions.includes('Deny') && <p className="admission-consequence">Failed validation rejects matching API requests.</p>}</Section>;
}
function ParameterReference() {
  const { form, disabled, commit, validity } = useAdmission();
  const path = ['spec', 'paramRef'] as const;
  const mode = !form.draft.has(path) ? 'omitted' : form.draft.has([...path, 'selector']) ? 'selector' : 'name';
  return <Section title="Policy parameters"><Choice label="Parameter selection" value={mode} options={[{ value: 'omitted', label: 'No parameter reference' }, { value: 'name', label: 'Named parameter' }, { value: 'selector', label: 'Label selector' }]} disabled={disabled} help="Uses the policy's parameter kind. Switching selection removes the inactive branch only. No parameter is created. Empty selectors select all parameters in scope." onChange={value => {
    const operations: ResourceEditorPatch[] = value === 'omitted' ? [{ op: 'remove', path }] : [
      { op: 'remove', path: [...path, value === 'name' ? 'selector' : 'name'] },
      { op: 'set', path: [...path, value === 'name' ? 'name' : 'selector'], value: value === 'name' ? '' : {} },
      ...(!form.draft.has([...path, 'parameterNotFoundAction']) ? [{ op: 'set' as const, path: [...path, 'parameterNotFoundAction'], value: 'Deny' }] : []),
    ];
    validity('paramRef', commit(operations));
  }} />
    {mode !== 'omitted' && <>{mode === 'name' ? <Scalar path={[...path, 'name']} label="Parameter name" required /> : <Selector path={[...path, 'selector']} label="Parameter selector" />}<Scalar path={[...path, 'namespace']} label="Parameter namespace (optional)" help="Omit for cluster-scoped parameters. For namespaced parameter types omission uses the admitted request's namespace; cluster-scoped requests require an explicit namespace. Resolve policy type and authorization before submission." /><Pick path={[...path, 'parameterNotFoundAction']} label="When no parameter is found" options={['Allow', 'Deny']} required help="Allow skips parameter enforcement when no parameters match. Deny follows the referenced policy's failure policy." /></>}
  </Section>;
}
export default function BindingEditor(form: ResourceEditorFormProps) {
  const mutation = isMutating(form.context.kind);
  return <AdmissionPanel key={form.draft.sessionID} form={form}>
    {(form.section === 'binding' || !form.section) && <><Reference path={['spec', 'policyName']} label={mutation ? 'Mutating policy' : 'Validating policy'} resource={mutation ? 'mutatingadmissionpolicies' : 'validatingadmissionpolicies'} version={mutation ? 'v1beta1' : 'v1'} /><p className="admission-consequence">Missing policy references are ignored; no policy is created.</p>{!mutation && <Enforcement />}<ParameterReference /></>}
    {form.section === 'matching' && <><p className="admission-consequence">Binding matches intersect policy matches. Exclusions win.</p><Matching path={['spec', 'matchResources']} mutation={mutation} /></>}
    {form.section === 'inspection' && <Section title="Binding reference"><span>Policy: {text(form.draft.get(['spec', 'policyName'])) || 'Not set'}</span><span>No binding status endpoint or reconciliation success is implied.</span></Section>}
  </AdmissionPanel>;
}
