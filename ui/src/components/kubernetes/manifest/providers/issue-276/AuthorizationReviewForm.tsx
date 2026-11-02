import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { useEffect, useRef, useState } from 'react';
import { EditorChoice, EditorField, EditorHelp, EditorSection } from '../../editor-controls';
import { branchOperations, decision, isLocal, isRules, record, suppliedIdentity, validateReview } from './model';
import './review.css';

function stringValue(value: unknown) { return typeof value === 'string' ? value : ''; }
function namespaceError(value: string) { return value && !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value) || value.length > 63 ? 'Use a DNS namespace label, at most 63 characters.' : null; }

export function SubjectAccessReviewForm(props: ResourceEditorFormProps) { return <ReviewSession key={props.draft.sessionID} {...props} />; }
export function LocalSubjectAccessReviewForm(props: ResourceEditorFormProps) { return <ReviewSession key={props.draft.sessionID} {...props} />; }
export function SelfSubjectAccessReviewForm(props: ResourceEditorFormProps) { return <ReviewSession key={props.draft.sessionID} {...props} />; }
export function SelfSubjectRulesReviewForm(props: ResourceEditorFormProps) { return <ReviewSession key={props.draft.sessionID} {...props} />; }

function ReviewSession(props: ResourceEditorFormProps) {
  const { context, draft, disabled, onValidityChange } = props;
  const [buffers, setBuffers] = useState<Record<string, { text: string; error: string }>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [extraKey, setExtraKey] = useState('');
  const [extraValue, setExtraValue] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [sensitiveEpoch, setSensitiveEpoch] = useState(0);
  const branches = useRef<Record<string, unknown>>({});
  const local = isLocal(context.kind);
  const rules = isRules(context.kind);
  const url = draft.has(['spec', 'nonResourceAttributes']);
  const branch = url ? 'nonResourceAttributes' : 'resourceAttributes';
  const issues = validateReview(draft, context);
  const inactiveBranch = url ? 'resourceAttributes' : 'nonResourceAttributes';
  const pendingIdentity = newGroup || extraKey || extraValue ? 'Add or clear pending identity rows before review.' : null;
  const firstError = Object.entries(buffers).find(([key]) => !key.includes(`"${inactiveBranch}"`))?.[1].error ?? failure ?? pendingIdentity ?? null;
  useEffect(() => { onValidityChange(firstError); }, [firstError, onValidityChange]);
  const commit = (operations: readonly ResourceEditorPatch[]) => {
    const result = props.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations });
    if (result.status === 'accepted' && operations.some(operation => operation.op === 'remove' && operation.path.some(segment => typeof segment === 'number'))) setSensitiveEpoch(epoch => epoch + 1);
    setFailure(result.status === 'accepted' ? null : result.message);
    return result.status === 'accepted';
  };
  const field = (label: string, path: ResourceEditorPath, help?: string, validate?: (value: string) => string | null, locked = false) => {
    const key = JSON.stringify(path);
    return <EditorField key={key} label={label} value={buffers[key]?.text ?? stringValue(draft.get(path))} help={help} disabled={disabled || locked}
      error={buffers[key]?.error ?? issues.find(issue => JSON.stringify(issue.path) === key)?.message}
      onChange={text => {
        const selectorParent = path.at(-1) === 'rawSelector' ? path.slice(0, -1) : null;
        const selector = selectorParent ? draft.get(selectorParent) : undefined;
        const error = validate?.(text) ?? (selectorParent && text === '' && record(selector) && Object.keys(selector).some(name => name !== 'rawSelector') ? 'Selector has additional fields; remove it in source.' : null);
        if (error) { setBuffers(previous => ({ ...previous, [key]: { text, error } })); return; }
        const removalPath = selectorParent ?? path;
        if (commit(text === '' && draft.has(removalPath) ? [{ op: 'remove', path: removalPath }] : [{ op: 'set', path, value: text }])) {
          setBuffers(previous => { const next = { ...previous }; delete next[key]; return next; });
        }
      }} />;
  };
  const sensitive = (label: string, path: ResourceEditorPath) => <SensitiveField key={`${sensitiveEpoch}:${JSON.stringify(path)}`} label={label} present={draft.has(path)} disabled={disabled}
    onChange={value => commit(value ? [{ op: 'set', path, value }] : [{ op: 'remove', path }])} />;
  const groups = draft.get(['spec', 'groups']);
  const extra = draft.get(['spec', 'extra']);
  const response = props.requestResult;
  const result = response?.status === 'ready' && record(response.output) ? response.output : null;
  const status = result && record(result.status) ? result.status : result;

  return <div className="authorization-review">
    {failure && <div role="alert">{failure}</div>}
    {props.section === 'request' && <>
      <p className="authorization-consequence">Checks permissions only. Does not execute actions or change RBAC.</p>
      {rules ? <EditorSection title="Effective rules for current identity">
        {field('Evaluation namespace', ['spec', 'namespace'], 'Required namespace to evaluate. Returned rules may be incomplete; never use this list to authorize requests.', namespaceError)}
      </EditorSection> : <EditorSection title={suppliedIdentity(context.kind) ? 'Access to evaluate' : 'Check your own access'}>
        {!local && <EditorChoice label="Action type" value={branch} disabled={disabled} help="Exactly one action branch is sent. Switching removes the inactive branch from the request."
          options={[{ value: 'resourceAttributes', label: 'Resource action' }, { value: 'nonResourceAttributes', label: 'Non-resource URL' }]}
          onChange={next => {
            if (next !== 'resourceAttributes' && next !== 'nonResourceAttributes') return;
            if (next === branch && draft.has(['spec', branch])) return;
            branches.current[branch] = draft.get(['spec', branch]);
            commit(branchOperations(next, branches.current[next] ?? {}));
          }} />}
        {url ? <div className="authorization-grid">
          {field('URL path', ['spec', branch, 'path'], 'An API-server non-resource URL path, not a resource endpoint.', text => text && !text.startsWith('/') ? 'URL path must start with /.' : null)}
          {field('HTTP verb', ['spec', branch, 'verb'], 'HTTP verb such as get. Empty means all verbs; wildcards stay explicit.')}
        </div> : <>
          <div className="authorization-grid">
            {local ? <EditorField label="Action namespace" value={context.namespace ?? ''} disabled readOnly onChange={() => {}} error={issues.find(issue => issue.path.at(-1) === 'namespace')?.message} help="Endpoint namespace applies when this attribute is omitted. An explicit namespace must match the endpoint." /> : field('Action namespace', ['spec', branch, 'namespace'], 'Empty means all namespaces for namespaced resources, or no namespace for cluster-scoped resources.', namespaceError)}
            {field('API verb', ['spec', branch, 'verb'], 'Kubernetes verb, for example get or list. Empty means all verbs.')}
            {field('API group', ['spec', branch, 'group'], 'Empty is the core API group. No group is inferred from resource name.')}
            {field('Resource plural', ['spec', branch, 'resource'], 'Use the exact discovered resource plural. Empty means all resources.')}
          </div>
          <details className="authorization-advanced"><summary>Advanced action and selectors</summary><div className="authorization-grid">
            {field('API version', ['spec', branch, 'version'], 'Empty matches all versions.')}
            {field('Subresource', ['spec', branch, 'subresource'], 'For example status or scale. Empty means no subresource.')}
            {field('Resource name', ['spec', branch, 'name'], 'Empty matches all resource names.')}
            {field('Field selector', ['spec', branch, 'fieldSelector', 'rawSelector'], 'Raw API selector. Can limit access, never broaden it. Server parses the exact string.')}
            {field('Label selector', ['spec', branch, 'labelSelector', 'rawSelector'], 'Raw API selector. Structured requirements remain source-only; they are never converted.')}
          </div></details>
        </>}
      </EditorSection>}
      {suppliedIdentity(context.kind) && <EditorSection title="Supplied identity">
        <div className="authorization-grid">{sensitive('User', ['spec', 'user'])}{sensitive('UID', ['spec', 'uid'])}</div>
        <EditorHelp label="Identity">Identity stays masked. Groups are explicit, never inferred from username. This does not impersonate the subject or grant permissions.</EditorHelp>
        <details className="authorization-advanced"><summary>Groups and extra attributes</summary>
          <div className="authorization-rows">{Array.isArray(groups) && groups.map((_, index) => <div className="authorization-row" key={index}>
            {sensitive(`Group ${index + 1}`, ['spec', 'groups', index])}
            <Button size="sm" variant="ghost" disabled={disabled} aria-label={`Remove group ${index + 1}`} onClick={() => commit([{ op: 'remove', path: ['spec', 'groups', index] }])}>Remove</Button>
          </div>)}</div>
          <div className="authorization-row"><EditorField label="New group" type="password" value={newGroup} disabled={disabled} onChange={setNewGroup} error={newGroup ? 'Add or clear this pending group.' : undefined} />
            <Button size="sm" disabled={disabled || !newGroup} onClick={() => { if (commit(Array.isArray(groups) ? [{ op: 'insert', path: ['spec', 'groups'], index: groups.length, value: newGroup }] : [{ op: 'set', path: ['spec', 'groups'], value: [newGroup] }])) setNewGroup(''); }}>Add group</Button></div>
          {record(extra) && Object.keys(extra).map((key, keyIndex) => <div className="authorization-extra" key={key}>
            <EditorField label={`Attribute ${keyIndex + 1} key`} type="password" value={key} readOnly disabled onChange={() => {}} />
            {Array.isArray(extra[key]) && (extra[key] as unknown[]).map((_, index) => <div className="authorization-row" key={index}>
              {sensitive(`Attribute ${keyIndex + 1} value ${index + 1}`, ['spec', 'extra', key, index])}
              <Button size="sm" variant="ghost" disabled={disabled} aria-label={`Remove attribute ${keyIndex + 1} value ${index + 1}`} onClick={() => commit([{ op: 'remove', path: ['spec', 'extra', key, index] }])}>Remove</Button>
            </div>)}
            <Button size="sm" variant="ghost" disabled={disabled} aria-label={`Remove attribute ${keyIndex + 1}`} onClick={() => commit([{ op: 'remove', path: ['spec', 'extra', key] }])}>Remove attribute</Button>
          </div>)}
          <div className="authorization-grid"><EditorField label="New attribute key" type="password" value={extraKey} disabled={disabled} onChange={setExtraKey} error={extraKey || extraValue ? 'Add or clear this pending attribute.' : undefined} />
            <EditorField label="New attribute value" type="password" value={extraValue} disabled={disabled} onChange={setExtraValue} /></div>
          <Button size="sm" disabled={disabled || !extraKey || !extraValue} onClick={() => {
            const values = record(extra) ? extra[extraKey] : undefined;
            if (commit(Array.isArray(values) ? [{ op: 'insert', path: ['spec', 'extra', extraKey], index: values.length, value: extraValue }] : [{ op: 'set', path: ['spec', 'extra', extraKey], value: [extraValue] }])) { setExtraKey(''); setExtraValue(''); }
          }}>Add attribute value</Button>
        </details>
      </EditorSection>}
    </>}
    {props.section === 'response' && <EditorSection title={rules ? 'Effective rules' : 'Access decision'}>
      {!response && <div role="status">No review response yet.</div>}
      {response && response.status !== 'ready' && <div role="alert">Review request {response.status}. No access decision returned.</div>}
      {response?.status === 'ready' && <>
        {rules ? <RulesResult status={status} sensitive={response.sensitive} /> : <>
          <strong role="status">{decision(status)}</strong>
          {record(status) && !!status.evaluationError && <div role="alert">Evaluation error reported. Decision may still be valid.</div>}
          {response.sensitive || suppliedIdentity(context.kind) ? <p>Response details masked.</p> : record(status) && <dl className="authorization-details">
            {typeof status.reason === 'string' && status.reason && <><dt>Reason</dt><dd>{status.reason}</dd></>}
            {typeof status.evaluationError === 'string' && status.evaluationError && <><dt>Evaluation error</dt><dd>{status.evaluationError}</dd></>}
          </dl>}
        </>}
        <p className="authorization-consequence">Response describes the submitted request, not later draft edits.</p>
      </>}
    </EditorSection>}
  </div>;
}

function SensitiveField({ label, present, disabled, onChange }: { label: string; present: boolean; disabled: boolean; onChange(this: void, value: string): boolean }) {
  const [text, setText] = useState('');
  return <EditorField label={label} type="password" value={text} disabled={disabled} placeholder={present ? 'Stored · type to replace' : undefined} onChange={value => { setText(value); onChange(value); }} />;
}
function tokens(value: unknown, empty: string, groups = false) { return Array.isArray(value) && value.every(item => typeof item === 'string') ? value.length ? value.map(item => groups && item === '' ? 'core (empty group)' : item).join(', ') : empty : 'Unsupported response'; }
function RulesResult({ status, sensitive }: { status: unknown; sensitive?: boolean }) {
  if (!record(status)) return <div role="alert">Unsupported rules response.</div>;
  return <>
    <p className="authorization-consequence">{status.incomplete ? 'Incomplete rules. ' : ''}Never use this list for authorization decisions.</p>
    {!!status.evaluationError && <div role="alert">Rule evaluation error reported.</div>}
      <div className="authorization-table"><table><caption>Resource rules</caption><thead><tr><th>API groups</th><th>Resources</th><th>Names</th><th>Verbs</th></tr></thead><tbody>
        {Array.isArray(status.resourceRules) && status.resourceRules.filter(record).map((rule, index) => <tr key={index}><td>{tokens(rule.apiGroups, 'No API groups', true)}</td><td>{tokens(rule.resources, 'No resources')}</td><td>{tokens(rule.resourceNames ?? [], 'All names')}</td><td>{tokens(rule.verbs, 'No verbs')}</td></tr>)}
      </tbody></table>{Array.isArray(status.resourceRules) && !status.resourceRules.length && <p>No resource rules returned; this does not imply denial.</p>}</div>
      <div className="authorization-table"><table><caption>Non-resource rules</caption><thead><tr><th>URL paths</th><th>Verbs</th></tr></thead><tbody>
        {Array.isArray(status.nonResourceRules) && status.nonResourceRules.filter(record).map((rule, index) => <tr key={index}><td>{tokens(rule.nonResourceURLs, 'No URLs')}</td><td>{tokens(rule.verbs, 'No verbs')}</td></tr>)}
      </tbody></table></div>
      {sensitive && !!status.evaluationError ? <p>Evaluation error details masked.</p> : typeof status.evaluationError === 'string' && status.evaluationError && <dl><dt>Evaluation error</dt><dd>{status.evaluationError}</dd></dl>}
  </>;
}
