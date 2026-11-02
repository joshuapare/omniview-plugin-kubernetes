import { useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection, ExactValueField, KeyValueFields, ReferencePicker, useFieldValidity } from '../../editor-controls';

export default function ExperimentalGatewayForm(form: ResourceEditorFormProps) {
  const { draft, context } = form;
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const validity = useFieldValidity(form);
  const text = (path: ResourceEditorPath) => { const value = draft.get(path); return typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value) : ''; };
  const report = (key: string, error: string | null) => { setErrors(previous => ({ ...previous, [key]: error })); validity(key, error); };
  const commit = (operations: ResourceEditorPatch[]) => { const result = form.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations }); return result.status === 'accepted' ? null : result.message; };
  const set = (path: ResourceEditorPath, value: unknown) => report(path.join('/'), commit([{ op: 'set', path, value }]));
  const field = (label: string, path: ResourceEditorPath, help?: string, locked = false) => <EditorField key={path.join('/')} label={label} value={text(path)} help={help} disabled={form.disabled || locked} error={errors[path.join('/')]} onChange={value => report(path.join('/'), commit([value === '' && path[path.length - 1] !== 'group' ? { op: 'remove', path } : { op: 'set', path, value }]))} />;
  const choice = (label: string, path: ResourceEditorPath, values: string[]) => <EditorChoice label={label} value={text(path)} disabled={form.disabled} options={values.map(value => ({ value, label: value || 'Not configured' }))} onChange={value => value ? set(path, value) : report(path.join('/'), commit([{ op: 'remove', path }]))} />;
  const number = (label: string, path: ResourceEditorPath, max: bigint) => <ExactValueField label={label} identity={`${draft.sessionID}/${path.join('/')}`} value={text(path)} disabled={form.disabled} parse={value => /^\d+$/.test(value) && BigInt(value) <= max ? { valid: true, value: BigInt(value) } : { valid: false, error: `Enter a whole number from 0 to ${max}.` }} onCommit={value => commit([{ op: 'set', path, value }])} onValidityChange={error => report(path.join('/'), error)} />;
  const rows = (path: ResourceEditorPath): readonly unknown[] => { const value = draft.get(path); return Array.isArray(value) ? value : []; };
  const add = (path: ResourceEditorPath, value: unknown) => report(path.join('/'), commit([draft.has(path) ? { op: 'insert', path, index: rows(path).length, value } : { op: 'set', path, value: [value] }]));
  const remove = (path: ResourceEditorPath) => report(path.join('/'), commit([{ op: 'remove', path }]));
  const button = (label: string, click: () => void, disabled = false) => <Button size="sm" type="button" disabled={form.disabled || disabled} onClick={click}>{label}</Button>;
  const reference = (label: string, path: ResourceEditorPath, group: string, resource: string, version = 'v1', namespace = context.namespace) => <ReferencePicker form={form} label={label} value={text(path)} disabled={form.disabled} query={{ group, version, resource, namespace, projection: 'metadata' }} onChange={value => set(path, value)} />;
  if (context.kind === 'XMesh') return <EditorSection title="Mesh controller">
    {field('Controller domain/path', ['spec', 'controllerName'], 'Immutable controller identity. This resource does not install or enrol a mesh.', context.intent !== 'create')}
    {field('Description', ['spec', 'description'], 'Optional description, at most 64 characters.')}
    <details><summary>Implementation parameters</summary>
      {field('API group', ['spec', 'parametersRef', 'group'])}{field('Kind', ['spec', 'parametersRef', 'kind'])}{field('Name', ['spec', 'parametersRef', 'name'])}{field('Namespace', ['spec', 'parametersRef', 'namespace'], 'Required only for a namespaced referent. Omit for cluster-scoped resources.')}
      {button('Remove parameters reference', () => remove(['spec', 'parametersRef']))}
    </details>
  </EditorSection>;
  if (context.kind === 'XListenerSet') return <EditorSection title="Shared listeners">
    {reference('Parent Gateway', ['spec', 'parentRef', 'name'], 'gateway.networking.k8s.io', 'gateways')}
    <details><summary>Parent namespace</summary>{field('Gateway namespace', ['spec', 'parentRef', 'namespace'], 'The parent must explicitly allow ListenerSet attachment. ReferenceGrants are not inherited.')}</details>
    {rows(['spec', 'listeners']).map((_, index) => {
      const p = ['spec', 'listeners', index]; const protocol = text([...p, 'protocol']); const tls = ['HTTPS', 'TLS'].includes(protocol);
      return <EditorSection key={index} title={`Listener ${index + 1}`}>
        {field('Listener name', [...p, 'name'])}{choice('Protocol', [...p, 'protocol'], ['HTTP', 'HTTPS', 'TLS', 'TCP', 'UDP'])}
        {number('Port · 0 assigns dynamically', [...p, 'port'], 65535n)}
        {!['TCP', 'UDP'].includes(protocol) && field('Hostname', [...p, 'hostname'])}
        {choice('Route namespaces', [...p, 'allowedRoutes', 'namespaces', 'from'], ['', 'Same', 'All', 'Selector'])}
        {tls && <><h4>TLS</h4>{choice('TLS mode', [...p, 'tls', 'mode'], protocol === 'HTTPS' ? ['Terminate'] : ['Terminate', 'Passthrough'])}
          {text([...p, 'tls', 'mode']) !== 'Passthrough' && <>{rows([...p, 'tls', 'certificateRefs']).map((__, cert) => <div key={cert}>{reference('Certificate Secret name', [...p, 'tls', 'certificateRefs', cert, 'name'], '', 'secrets')}{field('Certificate namespace', [...p, 'tls', 'certificateRefs', cert, 'namespace'], 'Cross-namespace certificates require a separate ReferenceGrant.')}{button('Remove certificate', () => remove([...p, 'tls', 'certificateRefs', cert]))}</div>)}{button('Add certificate', () => add([...p, 'tls', 'certificateRefs'], { name: '' }))}</>}
        </>}
        {button('Remove listener', () => remove(p))}
        {text([...p, 'allowedRoutes', 'namespaces', 'from']) === 'Selector' && <KeyValueFields form={form} path={[...p, 'allowedRoutes', 'namespaces', 'selector', 'matchLabels']} label="Namespace label" />}
      </EditorSection>;
    })}
    {button('Add listener', () => add(['spec', 'listeners'], { name: '', protocol: 'HTTP' }), rows(['spec', 'listeners']).length >= 64)}
  </EditorSection>;
  return <EditorSection title="Backend traffic policy">
    {rows(['spec', 'targetRefs']).map((_, index) => <EditorSection key={index} title={`Local backend ${index + 1}`}>
      {field('API group', ['spec', 'targetRefs', index, 'group'], 'Empty group selects core Kubernetes resources.')}{field('Kind', ['spec', 'targetRefs', index, 'kind'])}
      {text(['spec', 'targetRefs', index, 'kind']) === 'Service' && !text(['spec', 'targetRefs', index, 'group']) ? reference('Service', ['spec', 'targetRefs', index, 'name'], '', 'services') : field('Backend name', ['spec', 'targetRefs', index, 'name'])}
      {button('Remove backend', () => remove(['spec', 'targetRefs', index]))}
    </EditorSection>)}
    {button('Add local backend', () => add(['spec', 'targetRefs'], { group: '', kind: 'Service', name: '' }), rows(['spec', 'targetRefs']).length >= 16)}
    <details><summary>Retry budget</summary>{number('Retry percentage', ['spec', 'retryConstraint', 'budget', 'percent'], 100n)}{field('Budget interval', ['spec', 'retryConstraint', 'budget', 'interval'], 'Duration from 1s through 1h. Excess retries return HTTP 503.')}{number('Minimum retry count', ['spec', 'retryConstraint', 'minRetryRate', 'count'], 2147483647n)}{field('Minimum retry interval', ['spec', 'retryConstraint', 'minRetryRate', 'interval'])}{button('Remove retry constraint', () => remove(['spec', 'retryConstraint']))}</details>
    <details><summary>Session persistence</summary>{choice('Persistence type', ['spec', 'sessionPersistence', 'type'], ['', 'Cookie', 'Header'])}{field('Session name', ['spec', 'sessionPersistence', 'sessionName'])}{field('Absolute timeout', ['spec', 'sessionPersistence', 'absoluteTimeout'])}{field('Idle timeout', ['spec', 'sessionPersistence', 'idleTimeout'])}
      {text(['spec', 'sessionPersistence', 'type']) === 'Cookie' && choice('Cookie lifetime', ['spec', 'sessionPersistence', 'cookieConfig', 'lifetimeType'], ['', 'Session', 'Permanent'])}
      {button('Remove persistence', () => remove(['spec', 'sessionPersistence']))}
    </details>
  </EditorSection>;
}
