import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { Choice, Section } from '../../ResourceFormFields';
import { EditorHelp } from '../../editor-controls';
import { AdmissionPanel, Advanced, Conditions, Matching, Pick, Repeat, Scalar, useAdmission } from './AdmissionFields';
import { isMutating, mutationBranch, rows, text } from './model';

function Parameters() {
  const { form, disabled, commit, validity } = useAdmission();
  const enabled = form.draft.has(['spec', 'paramKind']);
  return <Section title="Parameter type" action={<Button size="sm" variant="ghost" disabled={disabled} onClick={() => validity('paramKind', commit([enabled ? { op: 'remove', path: ['spec', 'paramKind'] } : { op: 'set', path: ['spec', 'paramKind'], value: { apiVersion: '', kind: '' } }]))}>{enabled ? 'Remove type' : 'Add type'}</Button>}>{enabled && <div className="admission-grid"><Scalar path={['spec', 'paramKind', 'apiVersion']} label="Parameter API version" required /><Scalar path={['spec', 'paramKind', 'kind']} label="Parameter kind" required /></div>}</Section>;
}
function Mutation({ path }: { path: ResourceEditorPath }) {
  const { form, disabled, commit, validity } = useAdmission();
  const patchType = text(form.draft.get([...path, 'patchType']));
  return <><Choice label="Mutation strategy" value={patchType} options={[{ value: 'ApplyConfiguration', label: 'Apply configuration' }, { value: 'JSONPatch', label: 'JSON patch' }]} disabled={disabled} help="Switching strategy replaces only this mutation's expression. Apply configuration cannot modify atomic structures." onChange={value => validity(JSON.stringify(path), commit(mutationBranch(path, value)))} /><Scalar path={[...path, patchType === 'JSONPatch' ? 'jsonPatch' : 'applyConfiguration', 'expression']} label="Mutation CEL" required multiline help={patchType === 'JSONPatch' ? 'Return a list of JSONPatch values. Use jsonpatch.escapeKey for JSON pointer keys.' : 'Return a typed Object apply configuration. Do not overwrite atomic structs, maps or arrays.'} /></>;
}
function PolicyStatus() {
  const { form } = useAdmission();
  const conditions = rows(form.draft.get(['status', 'conditions']));
  const warnings = rows(form.draft.get(['status', 'typeChecking', 'expressionWarnings']));
  return <Section title="Server observations"><div className="admission-inline"><span>Observed generation: {text(form.draft.get(['status', 'observedGeneration'])) || 'Not reported'}</span><EditorHelp label="Policy status">Server-populated status is never edited. Absence of warnings does not prove policy readiness or successful evaluation. Warning messages are not displayed because they can include source values.</EditorHelp></div>
    {!conditions.length && <span role="status">No conditions reported.</span>}
    {conditions.map((_, i) => <div className="admission-inline" key={i}><span>{text(form.draft.get(['status', 'conditions', i, 'type']))}</span><strong>{text(form.draft.get(['status', 'conditions', i, 'status']))}</strong></div>)}
    <span role="status">Type-check warnings: {warnings.length}</span>
  </Section>;
}
export default function PolicyEditor(form: ResourceEditorFormProps) {
  const mutation = isMutating(form.context.kind);
  return <AdmissionPanel key={form.draft.sessionID} form={form}>
    {(form.section === 'logic' || !form.section) && <>
      <p className="admission-consequence">{mutation ? 'Bound policies may change matching requests.' : 'Enforcement depends on each binding’s validation actions.'}</p>
      {mutation ? <><Pick path={['spec', 'reinvocationPolicy']} label="Reinvocation" options={['Never', 'IfNeeded']} required help="IfNeeded allows repeated per-binding mutation after later changes; execution order is not guaranteed." /><Repeat path={['spec', 'mutations']} label="Mutations" initial={{ patchType: 'ApplyConfiguration', applyConfiguration: { expression: '' } }}>{path => <Mutation path={path} />}</Repeat></> : <Repeat path={['spec', 'validations']} label="Validations" initial={{ expression: '' }}>{path => <><Scalar path={[...path, 'expression']} label="Validation CEL" required multiline help="Must evaluate to boolean. Server validation performs CEL syntax, type and cost checks." /><Scalar path={[...path, 'message']} label="Failure message" /><Advanced label="Reason and dynamic message"><Pick path={[...path, 'reason']} label="Failure reason" options={['Unauthorized', 'Forbidden', 'Invalid', 'RequestEntityTooLarge']} /><Scalar path={[...path, 'messageExpression']} label="Message CEL" multiline help="Must return a string. Dynamic messages can disclose object contents; keep them safe." /></Advanced></>}</Repeat>}
      <Pick path={['spec', 'failurePolicy']} label="Evaluation error behavior" options={['Fail', 'Ignore']} help="Fail enforces evaluation errors through bindings. Ignore skips policy errors; it does not override a false validation." />
    </>}
    {form.section === 'matching' && <><Matching path={['spec', 'matchConstraints']} mutation={mutation} /><Conditions path={['spec', 'matchConditions']} /></>}
    {form.section === 'advanced' && <><Parameters /><Repeat path={['spec', 'variables']} label="Variables" initial={{ name: '', expression: '' }}>{path => <><Scalar path={[...path, 'name']} label="Variable name" required /><Scalar path={[...path, 'expression']} label="Variable CEL" required multiline help="Variables can reference earlier variables, never later variables. Match conditions cannot access variables." /></>}</Repeat>{!mutation && <Repeat path={['spec', 'auditAnnotations']} label="Audit annotations" initial={{ key: '', valueExpression: '' }}>{path => <><Scalar path={[...path, 'key']} label="Audit key" required /><Scalar path={[...path, 'valueExpression']} label="Audit value CEL" multiline required help="Return a string or null. Do not emit credentials or sensitive object contents into audit records." /></>}</Repeat>}</>}
    {form.section === 'status' && !mutation && <PolicyStatus />}
  </AdmissionPanel>;
}
