import { useEffect, useRef, useState } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorSection, ReferencePicker } from '../../editor-controls';
import { fieldError, object, rows, subjectChanges, text } from './domain';
import { ChoiceField, Collection, PolicyFrame, PolicyStatus, ToggleField, usePolicy, ValueField } from './fields';

function PriorityReference() {
  const { form, locked, commit, validity } = usePolicy();
  const path = ['spec', 'priorityLevelConfiguration', 'name'];
  const canonical = text(form.draft.get(path));
  const [local, setLocal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previous = useRef(canonical);
  useEffect(() => {
    if (previous.current !== canonical) { previous.current = canonical; setLocal(null); setError(null); validity('priorityReference', null); }
  }, [canonical, validity]);
  useEffect(() => () => validity('priorityReference', null), [validity]);
  return <ReferencePicker form={form} query={{ group: 'flowcontrol.apiserver.k8s.io', version: 'v1', resource: 'prioritylevelconfigurations', projection: 'metadata' }} label="Priority level" value={local ?? canonical} disabled={locked} error={error} help="Exact cluster-scoped priority name. Unresolved references cause this FlowSchema to be ignored; no priority is created implicitly." onChange={value => {
    setLocal(value);
    const failure = !value.trim() ? 'Enter a priority name.' : fieldError(form.draft, path, value) || commit([{ op: 'set', path, value }]);
    setError(failure); validity('priorityReference', failure);
  }} />;
}
function Matching() {
  const { form } = usePolicy();
  return <>{!rows(form.draft.get(['spec', 'rules'])).length && <div className="apf-notice">No matching groups: no API requests match.</div>}<Collection path={['spec', 'rules']} title="Matching groups" addLabel="Add matching group" initial={{ subjects: [], resourceRules: [] }}>{i => {
    const base = ['spec', 'rules', i];
    return <>
      <Collection path={[...base, 'subjects']} title="Subjects" addLabel="Add subject" initial={{ kind: 'User', user: { name: '' } }}>{j => {
        const path = [...base, 'subjects', j];
        const subject = object(form.draft.get(path));
        const branch = text(subject.kind) === 'ServiceAccount' ? 'serviceAccount' : text(subject.kind).toLowerCase();
        return <div className="apf-grid"><ChoiceField path={[...path, 'kind']} label="Subject type" options={[{ value: 'User', label: 'User' }, { value: 'Group', label: 'Group' }, { value: 'ServiceAccount', label: 'Service account' }]} onSelect={kind => subjectChanges(form.draft, path, kind)} />
          <ValueField path={[...path, branch, 'name']} label={branch === 'serviceAccount' ? 'Service account name' : 'Subject name'} required help="Use an exact authenticated name, or * for all names of this subject type." />
          {branch === 'serviceAccount' && <ValueField path={[...path, branch, 'namespace']} label="Service account namespace" required />}
        </div>;
      }}</Collection>
      <Collection path={[...base, 'resourceRules']} title="Resource matches" addLabel="Add resource match" initial={{ verbs: [], apiGroups: [], resources: [], namespaces: [] }}>{j => {
        const path = [...base, 'resourceRules', j];
        return <div className="apf-grid">
          <ValueField path={[...path, 'verbs']} label="Request verbs" tokens required help="Comma-separated Kubernetes verbs. Use * alone to match every verb." />
          <ValueField path={[...path, 'apiGroups']} label="API groups" tokens core required help={'Comma-separated group names. Enter "" for core; use * alone for all groups.'} />
          <ValueField path={[...path, 'resources']} label="Resources / subresources" tokens required help="Use exact plural names, optionally with /subresource. Use * alone for every resource." />
          <ValueField path={[...path, 'namespaces']} label="Target namespaces" tokens help="* matches every specified namespace. It does not include requests without a namespace." />
          <ToggleField path={[...path, 'clusterScope']} label="Include namespace-less requests" />
        </div>;
      }}</Collection>
      <Collection path={[...base, 'nonResourceRules']} title="URL matches" addLabel="Add URL match" initial={{ verbs: [], nonResourceURLs: [] }}>{j => <div className="apf-grid"><ValueField path={[...base, 'nonResourceRules', j, 'verbs']} label="URL request verbs" tokens required />
        <ValueField path={[...base, 'nonResourceRules', j, 'nonResourceURLs']} label="Non-resource URLs" tokens required help="Comma-separated slash paths, trailing /* prefixes, or * alone. Resource endpoints belong in resource matches." /></div>}</Collection>
    </>;
  }}</Collection></>;
}
function FlowSchemaFields() {
  const { form } = usePolicy();
  return <><div hidden={form.section === 'matching' || form.section === 'status'}><EditorSection title="Request routing"><div className="apf-grid"><PriorityReference /><ValueField path={['spec', 'matchingPrecedence']} label="Matching precedence" integer min={2} max={10000} placeholder="Server default: 1000" help="Lower numbers win. Equal precedence sorts by FlowSchema name. Precedence 1 is reserved for exempt." />
    <ChoiceField path={['spec', 'distinguisherMethod', 'type']} label="Separate flows by" help="User isolates users. Namespace isolates namespaced requests; namespace-less requests share the empty distinguisher." options={[{ value: '', label: 'No distinguisher' }, { value: 'ByUser', label: 'User' }, { value: 'ByNamespace', label: 'Namespace' }]} onSelect={value => {
      if (value) return [{ op: 'set', path: ['spec', 'distinguisherMethod', 'type'], value }];
      if (Object.keys(object(form.draft.get(['spec', 'distinguisherMethod']))).some(key => key !== 'type')) return 'Distinguisher has unsupported fields. Change this branch in source.';
      return form.draft.has(['spec', 'distinguisherMethod']) ? [{ op: 'remove', path: ['spec', 'distinguisherMethod'] }] : [];
    }} /></div><div className="apf-notice">Changes reroute matching API requests.</div></EditorSection></div><div hidden={form.section !== 'matching'}><div className="apf-notice">Matching groups use OR; a subject and a request predicate both must match.</div><Matching /></div><div hidden={form.section !== 'status'}><PolicyStatus /></div></>;
}
export default function FlowSchemaForm(form: ResourceEditorFormProps) {
  return <PolicyFrame key={form.draft.sessionID} form={form}><FlowSchemaFields /></PolicyFrame>;
}
