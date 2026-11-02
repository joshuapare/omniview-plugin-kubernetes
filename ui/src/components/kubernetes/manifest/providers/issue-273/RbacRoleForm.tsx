import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorChoice, EditorHelp, EditorSection, KeyValueFields } from '../../editor-controls';
import { labelKeyError, labelValueError, list, object, ruleBranchPatches, text, urlError } from './model';
import { DraftText, OwnershipNotice, StringRows, useRbacForm, type RbacForm } from './shared';

const verbOptions = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete', 'deletecollection', 'bind', 'escalate', 'impersonate', '*'];

export default function RbacRoleForm(props: ResourceEditorFormProps) {
  const editor = useRbacForm(props);
  const { form, commit } = editor;
  const aggregated = form.draft.get(['aggregationRule']) != null;
  const cluster = form.context.kind === 'ClusterRole';
  const rules = list(form.draft.get(['rules']));
  const wildcard = rules.some(rule => object(rule) && ['verbs', 'apiGroups', 'resources', 'nonResourceURLs'].some(key => list(rule[key]).some(value => typeof value === 'string' && value.includes('*'))));
  const privileged = rules.some(rule => object(rule) && list(rule.verbs).some(value => ['bind', 'escalate', 'impersonate'].includes(text(value))));
  return <div className="rbac-editor"><OwnershipNotice editor={editor} />
    <div className="rbac-notice">Rule changes affect every binding referencing this {form.context.kind}.</div>
    {wildcard && <div className="rbac-warning" role="status">Wildcard grants include matching future resources or operations.</div>}
    {privileged && <div className="rbac-warning" role="status">Privileged authorization verbs can cross permission boundaries.</div>}
    {cluster && <EditorChoice label="Permission source" value={aggregated ? 'aggregate' : 'direct'} options={[{ value: 'direct', label: 'Direct rules' }, { value: 'aggregate', label: 'Aggregate ClusterRoles' }]} disabled={form.disabled} help="Aggregation selects ClusterRoles by labels. Controller-generated rules cannot be edited. Switching to direct keeps currently observed rules; review them before saving." onChange={value => {
      const failure = commit(value === 'aggregate' ? [{ op: 'set', path: ['aggregationRule', 'clusterRoleSelectors'], value: [] }] : [{ op: 'remove', path: ['aggregationRule'] }]);
      if (!failure) Object.keys(editor.errors).filter(key => key.startsWith('selector-')).forEach(key => editor.report(key, null));
    }} />}
    {aggregated ? <Aggregation editor={editor} /> : <EditorSection title="Permission rules">
      <EditorHelp label="Permission rules">Rules are additive, never deny rules. Resource names cannot constrain create or deletecollection. Named list/watch access requires a matching name field selector. bind and escalate are verbs, not subresources. API authorization and escalation checks still run on submission.</EditorHelp>
      {rules.map((rule, index) => <Rule key={index} editor={editor} index={index} rule={object(rule) ? rule : {}} cluster={cluster} />)}
      <Button size="sm" disabled={form.disabled} onClick={() => commit(Array.isArray(form.draft.get(['rules'])) ? [{ op: 'insert', path: ['rules'], index: rules.length, value: { verbs: [], apiGroups: [''], resources: [] } }] : [{ op: 'set', path: ['rules'], value: [{ verbs: [], apiGroups: [''], resources: [] }] }])}>Add permission rule</Button>
    </EditorSection>}
  </div>;
}

function Rule({ editor, index, rule, cluster }: { editor: RbacForm; index: number; rule: Record<string, unknown>; cluster: boolean }) {
  const { form, commit } = editor;
  const urls = list(rule.nonResourceURLs).length > 0;
  const verbs = list(rule.verbs);
  return <fieldset className="rbac-card"><legend>Rule {index + 1}</legend>
    <Button size="sm" variant="ghost" disabled={form.disabled} aria-label={`Remove permission rule ${index + 1}`} onClick={() => commit([{ op: 'remove', path: ['rules', index] }])}>Remove rule</Button>
    {cluster && <EditorChoice label={`Rule ${index + 1} target`} value={urls ? 'urls' : 'resources'} options={[{ value: 'resources', label: 'API resources' }, { value: 'urls', label: 'Non-resource URLs' }]} disabled={form.disabled} onChange={value => commit(ruleBranchPatches(index, value === 'urls'))} />}
    <div className="rbac-heading">Verbs <EditorHelp label={`Rule ${index + 1} verbs`}>Select common verbs or add custom verbs below. This is not proof of authorization.</EditorHelp></div>
    <div className="rbac-verbs">{verbOptions.map(verb => <Button key={verb} size="sm" variant="ghost" aria-pressed={verbs.includes(verb)} disabled={form.disabled} onClick={() => {
      const position = verbs.indexOf(verb);
      commit(position >= 0 ? [{ op: 'remove', path: ['rules', index, 'verbs', position] }] : Array.isArray(rule.verbs) ? [{ op: 'insert', path: ['rules', index, 'verbs'], index: verbs.length, value: verb }] : [{ op: 'set', path: ['rules', index, 'verbs'], value: [verb] }]);
    }}>{verb}</Button>)}</div>
    <details className="rbac-advanced"><summary>Custom verbs and exact verb list</summary><StringRows editor={editor} path={['rules', index, 'verbs']} label={`Rule ${index + 1} verb`} /></details>
    {urls ? <><div className="rbac-warning">Non-resource access applies only through a ClusterRoleBinding.</div><StringRows editor={editor} path={['rules', index, 'nonResourceURLs']} label={`Rule ${index + 1} URL`} validateText={urlError} help="Use * for every URL, or absolute paths with a wildcard only as the final complete path segment." /></> : <>
      <div className="rbac-grid"><StringRows editor={editor} path={['rules', index, 'apiGroups']} label={`Rule ${index + 1} API group`} allowEmpty help="Empty string means the core API group. Enter exact groups; * grants all matching groups." /><StringRows editor={editor} path={['rules', index, 'resources']} label={`Rule ${index + 1} resource`} help="Exact API resource plurals, optionally resource/subresource. No plural is inferred." /></div>
      <details className="rbac-advanced" open={list(rule.resourceNames).length > 0}><summary>Restrict resource names</summary><StringRows editor={editor} path={['rules', index, 'resourceNames']} label={`Rule ${index + 1} resource name`} help="Empty list permits every name. Cannot restrict create or deletecollection; list/watch require name field selectors." /></details>
    </>}
  </fieldset>;
}

function Aggregation({ editor }: { editor: RbacForm }) {
  const { form, commit } = editor;
  const path = ['aggregationRule', 'clusterRoleSelectors'];
  const selectors = list(form.draft.get(path));
  return <EditorSection title="Aggregation selectors"><div className="rbac-warning">Controller owns effective rules. Matching selectors grant a union of permissions.</div>
    <EditorHelp label="Aggregation selectors">Selectors are OR across rows, AND within each row. An empty selector matches every ClusterRole. Effective rules are observed output, not an authorization preview.</EditorHelp>
    {selectors.map((selector, index) => <fieldset className="rbac-card" key={index}><legend>Selector {index + 1}</legend>
      {object(selector) && !Object.keys(object(selector.matchLabels) ? selector.matchLabels : {}).length && !list(selector.matchExpressions).length && <div className="rbac-warning">Empty selector matches every ClusterRole.</div>}
      <Button size="sm" variant="ghost" disabled={form.disabled} aria-label={`Remove selector ${index + 1}`} onClick={() => { if (!commit([{ op: 'remove', path: [...path, index] }])) editor.report(`selector-${index}-labels`, null); }}>Remove selector</Button>
      <KeyValueFields form={{ ...form, onValidityChange: error => editor.report(`selector-${index}-labels`, error) }} path={[...path, index, 'matchLabels']} label={`selector ${index + 1} label`} validateKey={labelKeyError} validateValue={labelValueError} />
      <details className="rbac-advanced" open={object(selector) && list(selector.matchExpressions).length > 0}><summary>Label expressions</summary><Expressions editor={editor} path={[...path, index, 'matchExpressions']} /></details>
    </fieldset>)}
    <Button size="sm" disabled={form.disabled} onClick={() => commit(Array.isArray(form.draft.get(path)) ? [{ op: 'insert', path, index: selectors.length, value: { matchLabels: {} } }] : [{ op: 'set', path, value: [{ matchLabels: {} }] }])}>Add selector</Button>
    <details className="rbac-advanced"><summary>Observed controller rules · {list(form.draft.get(['rules'])).length}</summary><div className="rbac-notice">Read-only. Inspect canonical source for observed rules; no effective-permission prediction.</div></details>
  </EditorSection>;
}

function Expressions({ editor, path }: { editor: RbacForm; path: (string | number)[] }) {
  const expressions = list(editor.form.draft.get(path));
  return <>{expressions.map((expression, index) => {
    const operator = object(expression) ? text(expression.operator) : 'Exists';
    return <div className="rbac-card" key={index}><DraftText editor={editor} path={[...path, index, 'key']} label={`Expression ${index + 1} key`} validateText={labelKeyError} />
      <EditorChoice label={`Expression ${index + 1} operator`} value={operator} disabled={editor.form.disabled} options={['In', 'NotIn', 'Exists', 'DoesNotExist'].map(value => ({ value, label: value }))} onChange={value => editor.commit([{ op: 'set', path: [...path, index, 'operator'], value }, ...(value === 'Exists' || value === 'DoesNotExist' ? [{ op: 'remove' as const, path: [...path, index, 'values'] }] : [])])} />
      {(operator === 'In' || operator === 'NotIn') && <StringRows editor={editor} path={[...path, index, 'values']} label={`Expression ${index + 1} value`} allowEmpty validateText={labelValueError} />}
      <Button size="sm" disabled={editor.form.disabled} aria-label={`Remove expression ${index + 1}`} onClick={() => editor.commit([{ op: 'remove', path: [...path, index] }])}>Remove expression</Button>
    </div>;
  })}<Button size="sm" disabled={editor.form.disabled} onClick={() => editor.commit(Array.isArray(editor.form.draft.get(path)) ? [{ op: 'insert', path, index: expressions.length, value: { key: '', operator: 'Exists' } }] : [{ op: 'set', path, value: [{ key: '', operator: 'Exists' }] }])}>Add expression</Button></>;
}
