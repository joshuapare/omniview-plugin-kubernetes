import { Button } from '@omniviewdev/base-ui';
import type { ReactNode } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection, ExactValueField, KeyValueFields, ReferencePicker, patchFields, patchError, scalarText, setDraftField, useFieldValidity } from '../../editor-controls';
import { generated, isFanout, isPush, isStore, specPath } from './domain';

export default function ExternalSecretsEditor(form: ResourceEditorFormProps) {
  const validity = useFieldValidity(form);
  const kind = form.context.kind;
  const base = specPath(kind);
  const push = isPush(kind);
  const readOnly = generated(form.draft, form.context) || form.context.intent === 'inspect';
  const f = readOnly ? { ...form, disabled: true } : form;
  const value = (path: ResourceEditorPath) => scalarText(form.draft.get(path));
  const commit = (path: ResourceEditorPath, text: string) => patchError(setDraftField(f, path, text));
  function field(label: string, path: ResourceEditorPath, help?: string, integer = false) {
    return <ExactValueField key={JSON.stringify(path)} label={label} identity={`${form.draft.sessionID}:${JSON.stringify(path)}`} value={value(path)} disabled={f.disabled} help={help}
      parse={text => {
        if (!text) {
          if (['Region', 'Remote key', 'Template key', 'Namespace name', 'Credential namespace', 'Identity namespace'].includes(label) || label === 'Kubernetes key' && !push) return { valid: false, error: 'Enter a value.' };
          return { valid: true, value: '' };
        }
        if (integer) return /^\d+$/.test(text) ? { valid: true, value: BigInt(text) } : { valid: false, error: 'Enter a non-negative whole number.' };
        if (['refreshInterval', 'refreshTime', 'retryInterval'].includes(String(path[path.length - 1])) && text !== '0' && !/^(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+$/.test(text)) return { valid: false, error: 'Enter a complete duration with units.' };
        return { valid: true, value: text };
      }}
      onCommit={next => next === '' ? form.draft.has(path) ? patchError(patchFields(f, [{ op: 'remove', path }])) : null : patchError(setDraftField(f, path, next))} onValidityChange={error => validity(JSON.stringify(path), error)} />;
  }
  function choice(label: string, path: ResourceEditorPath, options: string[], help?: string) {
    return <EditorChoice label={label} value={value(path)} disabled={f.disabled} help={help} options={[{ value: '', label: 'Controller default' }, ...options.map(value => ({ value, label: value }))]} onChange={next => validity(JSON.stringify(path), patchError(patchFields(f, [next ? { op: 'set', path, value: next } : { op: 'remove', path }])))} />;
  }
  function reference(label: string, path: ResourceEditorPath, resource: string, namespace = form.context.namespace, group = '', version = 'v1') {
    return <ReferencePicker label={label} value={value(path)} form={f} query={{ group, version, resource, namespace: resource === 'clustersecretstores' ? undefined : namespace, projection: 'metadata' }} onChange={next => validity(JSON.stringify(path), commit(path, next))} disabled={f.disabled} />;
  }
  function rows(label: string, path: ResourceEditorPath, render: (index: number) => ReactNode, seed: unknown) {
    const current = form.draft.get(path);
    const length = Array.isArray(current) ? current.length : 0;
    return <EditorSection title={label}>{Array.from({ length }, (_, index) => <fieldset key={index} disabled={f.disabled} style={{ minWidth: 0, border: '1px solid var(--ov-color-border-default)', padding: 10, margin: '0 0 8px' }}><legend>{label} {index + 1}</legend>{render(index)}<Button size="sm" variant="ghost" disabled={f.disabled} onClick={() => validity(label, patchError(patchFields(f, [{ op: 'remove', path: [...path, index] }])))}>Remove {label.toLowerCase()} {index + 1}</Button></fieldset>)}<Button size="sm" disabled={f.disabled} onClick={() => validity(label, patchError(patchFields(f, [form.draft.has(path) ? { op: 'insert', path, index: length, value: seed } : { op: 'set', path, value: [seed] }])))}>Add {label.toLowerCase()}</Button></EditorSection>;
  }
  function store(path: ResourceEditorPath) {
    const cluster = value([...path, 'kind']) === 'ClusterSecretStore';
    return <>{choice('Store scope', [...path, 'kind'], ['SecretStore', 'ClusterSecretStore'])}{form.draft.has([...path, 'labelSelector']) ? <p role="note">Destination uses label selection. Manage its selector in YAML.</p> : reference('Store name', [...path, 'name'], cluster ? 'clustersecretstores' : 'secretstores', cluster ? undefined : form.context.namespace, 'external-secrets.io')}</>;
  }
  function template() {
    const path = [...base, ...(push ? ['template'] : ['target', 'template']), 'templateFrom'];
    return rows('Template references', path, i => form.draft.has([...path, i, 'configMap']) ? <>{reference('ConfigMap', [...path, i, 'configMap', 'name'], 'configmaps')}{rows('Template keys', [...path, i, 'configMap', 'items'], j => field('Template key', [...path, i, 'configMap', 'items', j, 'key']), { key: '' })}</> : <p role="note">Secret or literal template retained. Manage it in protected YAML.</p>, { configMap: { name: '', items: [] } });
  }
  if (readOnly) return <EditorSection title="Controller-owned inspection"><p role="status">Direct edits are disabled. Change the owning controller resource.</p><EditorField label="Owner kind" value={ownerText(form, 'kind')} onChange={() => {}} readOnly /><EditorField label="Owner name" value={ownerText(form, 'name')} onChange={() => {}} readOnly /><p>Provider messages and secret payloads remain hidden.</p></EditorSection>;
  if (form.section === 'fanout' && isFanout(kind)) return <><p role="alert">Namespace matches include future namespaces. Each child can {push ? 'write external secrets' : 'create Kubernetes Secrets'}.</p>{field('Child resource name', ['spec', push ? 'pushSecretName' : 'externalSecretName'])}{field('Namespace recheck interval', ['spec', 'refreshTime'], 'Go duration, for example 1m. This is separate from child refresh.')}{rows('Namespace selectors', ['spec', 'namespaceSelectors'], i => <KeyValueFields form={f} path={['spec', 'namespaceSelectors', i, 'matchLabels']} label="Namespace label" />, { matchLabels: {} })}</>;
  if (isStore(kind)) {
    const aws = ['spec', 'provider', 'aws'];
    const auth = [...aws, 'auth'];
    const method = form.draft.has([...auth, 'jwt']) ? 'jwt' : form.draft.has([...auth, 'secretRef']) ? 'secretRef' : 'controller';
    if (form.section === 'advanced') return <>{field('Controller class', ['spec', 'controller'])}{field('Store refresh (seconds)', ['spec', 'refreshInterval'], 'Store validation interval in seconds.', true)}{field('Maximum retries', ['spec', 'retrySettings', 'maxRetries'], undefined, true)}{field('Retry interval', ['spec', 'retrySettings', 'retryInterval'])}{kind === 'ClusterSecretStore' && <><p role="alert">Omitted conditions allow all namespaces.</p>{rows('Access conditions', ['spec', 'conditions'], i => rows('Allowed namespaces', ['spec', 'conditions', i, 'namespaces'], j => field('Namespace name', ['spec', 'conditions', i, 'namespaces', j]), ''), { namespaces: [] })}</>}</>;
    return <EditorSection title="AWS connection">{choice('Service', [...aws, 'service'], ['SecretsManager', 'ParameterStore'])}{field('Region', [...aws, 'region'])}{field('Assume role ARN', [...aws, 'role'])}<EditorChoice label="Authentication" value={method} disabled={f.disabled} help="References only. Credentials are never fetched. Switching authentication removes the previous method after your explicit selection." options={[{ value: 'controller', label: 'Controller identity' }, { value: 'jwt', label: 'ServiceAccount JWT' }, { value: 'secretRef', label: 'Secret key references' }]} onChange={next => {
      const operations: ResourceEditorPatch[] = [];
      for (const branch of ['jwt', 'secretRef']) if (form.draft.has([...auth, branch]) && branch !== next) operations.push({ op: 'remove', path: [...auth, branch] });
      if (next !== 'controller' && !form.draft.has([...auth, next])) operations.push({ op: 'set', path: [...auth, next], value: next === 'jwt' ? { serviceAccountRef: { name: '' } } : { accessKeyIDSecretRef: { name: '', key: '' }, secretAccessKeySecretRef: { name: '', key: '' } } });
      validity('auth', patchError(patchFields(f, operations)));
    }} />{method === 'jwt' && <>{kind === 'ClusterSecretStore' && field('Identity namespace', [...auth, 'jwt', 'serviceAccountRef', 'namespace'])}{reference('ServiceAccount', [...auth, 'jwt', 'serviceAccountRef', 'name'], 'serviceaccounts', kind === 'ClusterSecretStore' ? value([...auth, 'jwt', 'serviceAccountRef', 'namespace']) : form.context.namespace)}</>}{method === 'secretRef' && ['accessKeyIDSecretRef', 'secretAccessKeySecretRef', 'sessionTokenSecretRef'].map((key, i) => <EditorSection key={key} title={['Access key reference', 'Secret key reference', 'Session token reference (optional)'][i]}>{kind === 'ClusterSecretStore' && field('Credential namespace', [...auth, 'secretRef', key, 'namespace'])}{reference('Credential Secret', [...auth, 'secretRef', key, 'name'], 'secrets', kind === 'ClusterSecretStore' ? value([...auth, 'secretRef', key, 'namespace']) : form.context.namespace)}{field('Key name', [...auth, 'secretRef', key, 'key'])}</EditorSection>)}</EditorSection>;
  }
  if (form.section === 'advanced') return <details open><summary>Template references</summary>{template()}</details>;
  if (form.section === 'lifecycle') return <>{field('Refresh interval', [...base, 'refreshInterval'], 'Go duration. No remote sync is performed by this editor.')}{push ? <>{choice('External update policy', [...base, 'updatePolicy'], ['Replace', 'IfNotExists'])}{choice('External deletion policy', [...base, 'deletionPolicy'], ['None', 'Delete'])}<p role="alert">Push writes external systems. Replace can overwrite remote values. Delete can remove remote secrets.</p></> : <>{choice('Refresh policy', [...base, 'refreshPolicy'], ['CreatedOnce', 'Periodic', 'OnChange'])}{field('Target Secret name', [...base, 'target', 'name'])}{choice('Target ownership', [...base, 'target', 'creationPolicy'], ['Owner', 'Orphan', 'Merge', 'None'])}{choice('Provider deletion behavior', [...base, 'target', 'deletionPolicy'], ['Retain', 'Delete', 'Merge'])}<p role="note">Target immutability can prevent downstream updates. Existing target fields remain unchanged.</p></>}</>;
  return <><EditorSection title={push ? 'Push · Kubernetes → external provider' : 'Pull · external provider → Kubernetes'}>{push ? <><p role="alert">Push writes external systems. No plaintext preview is available.</p>{form.draft.has([...base, 'selector', 'generatorRef']) || form.draft.has([...base, 'selector', 'secret', 'selector']) ? <p role="note">Source uses a generator or label selector. Manage that source in YAML.</p> : reference('Existing source Secret', [...base, 'selector', 'secret', 'name'], 'secrets')}{rows('Destination stores', [...base, 'secretStoreRefs'], i => store([...base, 'secretStoreRefs', i]), { kind: 'SecretStore', name: '' })}</> : store([...base, 'secretStoreRef'])}</EditorSection>{rows('Key mappings', [...base, 'data'], i => { const row = [...base, 'data', i, ...(push ? ['match'] : [])]; return <>{field('Kubernetes key', [...row, 'secretKey'], push ? 'Blank selects the full Secret; confirm destination behavior before submission.' : undefined)}{field('Remote key', [...row, 'remoteRef', push ? 'remoteKey' : 'key'])}{field('Remote property', [...row, 'remoteRef', 'property'])}</>; }, push ? { match: { secretKey: '', remoteRef: { remoteKey: '' } } } : { secretKey: '', remoteRef: { key: '' } })}</>;
}
function ownerText(form: ResourceEditorFormProps, key: string): string {
  const owners = form.draft.get(['metadata', 'ownerReferences']);
  if (!Array.isArray(owners)) return 'Unknown';
  const rows: readonly unknown[] = owners;
  const owner = rows.find(item => item !== null && typeof item === 'object' && 'controller' in item && item.controller === true);
  if (!owner || typeof owner !== 'object' || !(key in owner)) return 'Unknown';
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  const value: unknown = descriptor?.value;
  return typeof value === 'string' ? value : 'Unknown';
}
