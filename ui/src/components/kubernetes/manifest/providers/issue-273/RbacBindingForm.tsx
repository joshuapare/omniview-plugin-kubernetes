import { Button } from '@omniviewdev/base-ui';
import { useEffect, useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection, ReferencePicker } from '../../editor-controls';
import { GROUP, list, namespaceError, object, serviceAccountNameError, subjectKindPatches, text } from './model';
import { DraftText, OwnershipNotice, useRbacForm, type RbacForm } from './shared';

export default function RbacBindingForm(props: ResourceEditorFormProps) {
  const editor = useRbacForm(props);
  const { form, commit } = editor;
  const cluster = form.context.kind === 'ClusterRoleBinding';
  const creating = form.context.intent === 'create';
  const kind = text(form.draft.get(['roleRef', 'kind'])) || (cluster ? 'ClusterRole' : 'Role');
  const namespace = text(form.draft.get(['metadata', 'namespace'])) || form.context.namespace || '';
  const subjects = list(form.draft.get(['subjects']));
  function roleReference(name: string, nextKind = kind) {
    if (!creating) return;
    const operations: ResourceEditorPatch[] = [
      { op: 'set', path: ['roleRef', 'name'], value: name },
      { op: 'set', path: ['roleRef', 'kind'], value: nextKind },
      { op: 'set', path: ['roleRef', 'apiGroup'], value: GROUP },
    ];
    commit(operations);
  }
  return <div className="rbac-editor"><OwnershipNotice editor={editor} />
    <div className="rbac-warning">{cluster ? 'Grants referenced permissions cluster-wide.' : `Grants referenced permissions only in ${namespace || 'the binding namespace'}.`}</div>
    <EditorSection title="Role reference">
      <EditorHelp label="Role reference">roleRef is immutable after creation. Changing a grant requires a separately reviewed replacement; this editor never deletes or recreates bindings. A namespaced RoleBinding may reference a Role in its own namespace or a ClusterRole. Reference discovery does not prove bind permission.</EditorHelp>
      <div className="rbac-grid">
        <EditorChoice label="Role kind" value={kind} disabled={form.disabled || !creating || cluster} options={(cluster ? ['ClusterRole'] : ['Role', 'ClusterRole']).map(value => ({ value, label: value }))} onChange={next => roleReference(text(form.draft.get(['roleRef', 'name'])), next)} />
        {creating ? <RoleName editor={editor} kind={kind} namespace={namespace} onCommit={roleReference} /> : <EditorField label="Role name" value={text(form.draft.get(['roleRef', 'name']))} readOnly onChange={() => {}} help="Immutable role reference. Edit subjects without replacing this grant." />}
      </div>
      {!creating && <div className="rbac-notice">Role reference locked · immutable after creation.</div>}
    </EditorSection>
    <EditorSection title="Subjects"><EditorHelp label="Subjects">ServiceAccount uses the core API group and an explicit namespace. User and Group names refer to external identities, not discoverable Kubernetes objects. All subject grants are additive.</EditorHelp>
      {subjects.map((subject, index) => <Subject key={index} editor={editor} index={index} subject={object(subject) ? subject : {}} namespace={namespace} />)}
      {!subjects.length && <div className="rbac-notice">No subjects · this binding grants access to nobody.</div>}
      <Button size="sm" disabled={form.disabled} onClick={() => commit(Array.isArray(form.draft.get(['subjects'])) ? [{ op: 'insert', path: ['subjects'], index: subjects.length, value: { kind: 'ServiceAccount', apiGroup: '', name: '', namespace } }] : [{ op: 'set', path: ['subjects'], value: [{ kind: 'ServiceAccount', apiGroup: '', name: '', namespace }] }])}>Add subject</Button>
    </EditorSection>
  </div>;
}

function RoleName({ editor, kind, namespace, onCommit }: { editor: RbacForm; kind: string; namespace: string; onCommit: (name: string) => void }) {
  const canonical = text(editor.form.draft.get(['roleRef', 'name']));
  const identity = JSON.stringify([editor.form.draft.sessionID, kind, canonical]);
  const [edit, setEdit] = useState<{ identity: string; name: string; error: string | null }>({ identity, name: canonical, error: null });
  if (edit.identity !== identity) setEdit({ identity, name: canonical, error: null });
  const { name, error } = edit.identity === identity ? edit : { name: canonical, error: null };
  useEffect(() => { editor.report('role-name', error); }, [editor.report, error]);
  return <ReferencePicker form={editor.form} query={{ group: GROUP, version: 'v1', resource: kind === 'Role' ? 'roles' : 'clusterroles', ...(kind === 'Role' ? { namespace } : {}), projection: 'metadata' }} label="Role name" value={name} error={error} disabled={editor.form.disabled} onChange={next => {
    const invalid = !next.trim() ? 'Enter a role name.' : /[/%]/.test(next) || next === '.' || next === '..' ? 'Enter a valid role name.' : null;
    setEdit({ identity, name: next, error: invalid }); editor.report('role-name', invalid);
    if (!invalid) onCommit(next);
  }} help="Choose an existing role or type an unresolved name. Names never imply permission or existence." />;
}

function Subject({ editor, index, subject, namespace }: { editor: RbacForm; index: number; subject: Record<string, unknown>; namespace: string }) {
  const kind = text(subject.kind);
  return <fieldset className="rbac-card"><legend>Subject {index + 1}</legend>
    <Button size="sm" variant="ghost" disabled={editor.form.disabled} aria-label={`Remove subject ${index + 1}`} onClick={() => editor.commit([{ op: 'remove', path: ['subjects', index] }])}>Remove subject</Button>
    <EditorChoice label={`Subject ${index + 1} kind`} value={kind} disabled={editor.form.disabled} options={['ServiceAccount', 'User', 'Group'].map(value => ({ value, label: value }))} onChange={value => editor.commit(subjectKindPatches(index, value, text(subject.namespace) || namespace))} />
    <div className="rbac-grid"><DraftText editor={editor} path={['subjects', index, 'name']} label={`Subject ${index + 1} name`} validateText={kind === 'ServiceAccount' ? serviceAccountNameError : undefined} help={kind === 'ServiceAccount' ? 'Exact ServiceAccount name. No token or credential is fetched.' : 'Exact external identity. Kubernetes cannot enumerate all users or groups.'} />
      {kind === 'ServiceAccount' && <DraftText editor={editor} path={['subjects', index, 'namespace']} label={`Subject ${index + 1} namespace`} allowEmpty={editor.form.context.kind === 'RoleBinding'} validateText={value => value === '' && editor.form.context.kind === 'RoleBinding' ? null : namespaceError(value)} help="ServiceAccount namespace, not grant destination. An empty namespace on a RoleBinding defaults to its own namespace. ClusterRoleBinding requires an explicit namespace." />}
    </div>
    {kind === 'Group' && text(subject.name).startsWith('system:') && <div className="rbac-warning">System group grant can include many identities.</div>}
  </fieldset>;
}
