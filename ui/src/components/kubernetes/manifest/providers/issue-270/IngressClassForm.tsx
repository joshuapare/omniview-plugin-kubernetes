import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useState } from 'react';
import { EditorChoice, EditorField, EditorSection, useEditorReferences } from '../../editor-controls';
import { Consequence, NetworkField, RemoveButton, useNetworkingForm } from './fields';
import { DEFAULT_CLASS, controllerPath, dnsName, namespaceName, parameterSegment, record, scopeChanges, text } from './model';

export default function IngressClassForm(form: ResourceEditorFormProps) {
  return <ClassSession key={form.draft.sessionID} {...form} />;
}
function ClassSession(form: ResourceEditorFormProps) {
  const editor = useNetworkingForm(form), params = record(form.draft.get(['spec', 'parameters']));
  const [adding, setAdding] = useState(false), [group, setGroup] = useState(''), [kind, setKind] = useState(''), [name, setName] = useState(''), [scope, setScope] = useState('Cluster'), [namespace, setNamespace] = useState('');
  const scopeIdentity = JSON.stringify([form.draft.sessionID, params.scope]);
  const [scopeEdit, setScopeEdit] = useState<{ identity: string; value: string | null }>({ identity: scopeIdentity, value: null });
  if (scopeEdit.identity !== scopeIdentity) setScopeEdit({ identity: scopeIdentity, value: null });
  const pendingScope = scopeEdit.identity === scopeIdentity ? scopeEdit.value : null;
  const classes = useEditorReferences(form, { group: 'networking.k8s.io', version: 'v1', resource: 'ingressclasses', projection: 'ingressClass' });
  const defaults = classes.status === 'ready' ? classes.items.filter(item => item.name !== form.context.name && item.ingressClass?.isDefault) : [];
  const annotation = form.draft.get(['metadata', 'annotations', DEFAULT_CLASS]);
  const path = ['spec', 'parameters'];
  return <div className="networking-form">{editor.failure && <div role="alert">{editor.failure}</div>}
    {form.section === 'controller' && <EditorSection title="Ingress controller">
      <NetworkField editor={editor} path={['spec', 'controller']} label="Controller" readOnly={form.context.intent !== 'create'} help="Immutable domain-prefixed controller identifier. Creating a class does not install or verify a controller." parse={value => controllerPath(value) ? { value } : { error: 'Enter a domain-prefixed controller path, up to 250 characters.' }} />
      <EditorChoice label="Default for classless Ingresses" value={annotation === undefined ? 'omit' : text(annotation)} options={[{ value: 'omit', label: 'Not specified' }, { value: 'true', label: 'Default class' }, { value: 'false', label: 'Not default' }]} disabled={form.disabled} onChange={value => editor.commit([value === 'omit' ? { op: 'remove', path: ['metadata', 'annotations', DEFAULT_CLASS] } : { op: 'set', path: ['metadata', 'annotations', DEFAULT_CLASS], value }])} />
      {annotation === 'true' && <Consequence help="Multiple default IngressClasses can prevent creation of Ingresses without an explicit class.">Default selection affects new classless Ingresses.</Consequence>}
      <div role="status" aria-label="Default class lookup" className="networking-muted">{classes.status === 'loading' ? 'Default classes: loading' : classes.status === 'ready' ? defaults.length ? `${defaults.length} other default class(es) discovered` : 'No other default class discovered' : `Default classes: ${classes.status}`}</div>
    </EditorSection>}
    {form.section === 'parameters' && <EditorSection title="Controller parameters (optional)">
      {form.draft.has(path) ? <>
        <div className="networking-grid"><NetworkField editor={editor} path={[...path, 'apiGroup']} label="Parameter API group" optional help="Omit for a core API kind. This reference does not create or verify the parameter resource." parse={value => !value || dnsName(value) ? { value } : { error: 'Enter a DNS API group.' }} />
          <NetworkField editor={editor} path={[...path, 'kind']} label="Parameter kind" parse={value => parameterSegment(value) ? { value } : { error: 'Enter a resource kind.' }} />
          <NetworkField editor={editor} path={[...path, 'name']} label="Parameter name" parse={value => parameterSegment(value) ? { value } : { error: 'Enter a resource name.' }} />
          <EditorChoice label="Parameter scope" value={pendingScope ?? (text(params.scope) || 'Cluster')} options={[{ value: 'Cluster', label: 'Cluster' }, { value: 'Namespace', label: 'Namespace' }]} disabled={form.disabled} onChange={value => {
            const pending = value === 'Namespace' && !params.namespace;
            setScopeEdit({ identity: scopeIdentity, value: pending ? value : null });
            editor.stage([...path, 'namespace'], 'scope', pending ? 'Enter the parameter namespace to apply this scope.' : null);
            if (!pending) editor.commit(scopeChanges(path, value));
          }} />
          {(pendingScope ?? params.scope) === 'Namespace' && <NetworkField editor={editor} path={[...path, 'namespace']} label="Parameter namespace" parse={value => namespaceName(value) ? { value } : { error: 'Enter a namespace DNS label.' }} operations={value => [{ op: 'set', path: [...path, 'scope'], value: 'Namespace' }, { op: 'set', path: [...path, 'namespace'], value }]} />}
        </div><RemoveButton editor={editor} path={path} label="Remove parameter reference" />
      </> : adding ? <>
        <div className="networking-grid"><EditorField label="New parameter API group" value={group} onChange={setGroup} disabled={form.disabled} /><EditorField label="New parameter kind" value={kind} onChange={setKind} disabled={form.disabled} /><EditorField label="New parameter name" value={name} onChange={setName} disabled={form.disabled} /><EditorChoice label="New parameter scope" value={scope} onChange={setScope} options={[{ value: 'Cluster', label: 'Cluster' }, { value: 'Namespace', label: 'Namespace' }]} disabled={form.disabled} />{scope === 'Namespace' && <EditorField label="New parameter namespace" value={namespace} onChange={setNamespace} disabled={form.disabled} />}</div>
        <Button size="sm" variant="outline" disabled={form.disabled || group !== '' && !dnsName(group) || !parameterSegment(kind) || !parameterSegment(name) || scope === 'Namespace' && !namespaceName(namespace)} onClick={() => { if (!editor.commit([{ op: 'set', path, value: { ...(group ? { apiGroup: group } : {}), kind, name, scope, ...(scope === 'Namespace' ? { namespace } : {}) } }])) setAdding(false); }}>Use parameter reference</Button>
        <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
      </> : <Button size="sm" variant="outline" disabled={form.disabled} onClick={() => setAdding(true)}>Add parameter reference</Button>}
      <span className="networking-muted">Controller-specific reference resolution: not verified.</span>
    </EditorSection>}
  </div>;
}
