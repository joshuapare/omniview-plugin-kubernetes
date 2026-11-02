import { Button } from '@omniviewdev/base-ui';
import { useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection, ExactValueField, ReferencePicker, parseExactInteger, patchError, setDraftField, removeDraftField, scalarText, useFieldValidity } from '../../editor-controls';
import { generators } from './schemas';
import { clusterBranches } from './policy';
import { layouts } from './layouts';

type Schema = { type?: string; description?: string; enum?: readonly unknown[]; properties?: Readonly<Record<string, Schema>>; items?: Schema; additionalProperties?: Schema | boolean; required?: readonly string[]; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; pattern?: string; default?: unknown };
const label = (key: string) => key.replace(/Spec$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const sensitive = (path: ResourceEditorPath) => path.some(p => /^(data|state|resource|body|headers|caBundle|parameters|tokenCode|password|token|clientSecret|url)$/i.test(String(p)));

function MapRows({ form, path, schema, title }: { form: ResourceEditorFormProps; path: ResourceEditorPath; schema: Schema; title: string }) {
  const [key, setKey] = useState('');
  const validity = useFieldValidity(form);
  const value = form.draft.get(path);
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).filter(k => !k.startsWith('__')) : [];
  return <EditorSection title={title}>{keys.map(key => <div key={key}><Node form={form} schema={schema} path={[...path, key]} title={sensitive(path) ? 'Protected entry' : key} /><Button size="sm" variant="ghost" disabled={form.disabled} onClick={() => validity(key, patchError(removeDraftField(form, [...path, key])))}>Remove entry</Button></div>)}<EditorField label="New entry key" type={sensitive(path) ? 'password' : 'text'} value={key} onChange={setKey} disabled={form.disabled} /><Button size="sm" disabled={form.disabled || !key || form.draft.has([...path, key])} onClick={() => { const failure = patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [{ op: 'set', path: [...path, key], value: schema.type === 'object' ? {} : '' }] })); validity('new', failure); if (!failure) setKey(''); }}>Add entry</Button></EditorSection>;
}

function Node({ form, schema, path, title, referenceMetadata = false }: { form: ResourceEditorFormProps; schema: Schema; path: ResourceEditorPath; title: string; referenceMetadata?: boolean }) {
  const validity = useFieldValidity(form);
  const value = form.draft.get(path);
  const disabled = form.disabled || form.context.intent === 'inspect';
  const commit = (next: string | bigint | number | boolean) => patchError(setDraftField(form, path, next));
  const field = { label: title, disabled, help: schema.description };
  if (path[path.length - 1] === 'auth' && schema.properties && Object.keys(schema.properties).length > 1) {
    const branches = Object.keys(schema.properties);
    const active = branches.filter(key => form.draft.has([...path, key]));
    if (active.length > 1) return <p role="alert">Multiple authentication branches require source editing. Existing configuration remains unchanged.</p>;
    return <EditorSection title="Authentication"><EditorChoice label="Identity method" disabled={disabled} value={active[0] ?? ''} options={[{value:'',label:'Controller default / not set'},...branches.map(key=>({value:key,label:label(key)}))]} help="Changing identity method removes the previous authentication branch. Secret references never fetch credential bodies." onChange={next => {
      validity('identity', patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [
        ...active.map(key => ({ op: 'remove' as const, path: [...path, key] })),
        ...(next ? [{ op: 'set' as const, path: [...path, next], value: schema.properties?.[next].type === 'string' ? '' : {} }] : []),
      ] })));
    }} />{active[0] && <Node form={form} schema={schema.properties[active[0]]} path={[...path, active[0]]} title={label(active[0])} />}</EditorSection>;
  }
  if (schema.type === 'object' || schema.properties) {
    const secretSelector = schema.properties?.name?.description === 'The name of the Secret resource being referred to.' && schema.properties?.key?.type === 'string';
    if (schema.properties) return <details open={path.length < 3}><summary>{title} {schema.description && <EditorHelp label={title}>{schema.description}</EditorHelp>}</summary><div className="resource-editor-section">{Object.entries(schema.properties).map(([key, child]) => <Node key={key} form={form} schema={child} path={[...path, key]} title={label(key)} referenceMetadata={secretSelector && (key === 'name' || key === 'key')} />)}</div></details>;
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') return <MapRows form={form} path={path} schema={schema.additionalProperties} title={title} />;
    return <span>{title}: source-only opaque object</span>;
  }
  if (schema.type === 'array') {
    const items = Array.isArray(value) ? value : [];
    return <EditorSection title={title}>{items.map((_, index) => <div key={index}><Node form={form} path={[...path, index]} schema={schema.items ?? { type: 'string' }} title={`${title} ${index + 1}`} /><Button size="sm" variant="ghost" disabled={disabled} onClick={() => validity('array', patchError(removeDraftField(form, [...path, index])))}>Remove {title}</Button></div>)}<Button size="sm" disabled={disabled} onClick={() => validity('array', patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: form.draft.has(path) ? [{ op: 'insert', path, index: items.length, value: schema.items?.type === 'object' ? {} : '' }] : [{ op: 'set', path, value: [schema.items?.type === 'object' ? {} : ''] }] })))}>Add {title}</Button></EditorSection>;
  }
  if (schema.enum || schema.type === 'boolean') {
    const options = schema.enum ?? [true, false];
    return <EditorChoice label={title} disabled={disabled} value={value === undefined ? '' : scalarText(value)} onChange={next => validity(title, next === '' ? patchError(removeDraftField(form, path)) : commit(schema.type === 'boolean' ? next === 'true' : next))} options={[{value:'',label:'Not set'},...options.map(option=>({value:String(option),label:String(option)}))]} help={schema.description} />;
  }
  const parse = (text: string) => {
    if (schema.type === 'integer') {
      const result = parseExactInteger(text);
      if (!result.valid) return result;
      const number = BigInt(result.value);
      if (schema.minimum !== undefined && number < BigInt(schema.minimum)) return { valid: false as const, error: `Minimum ${schema.minimum}.` };
      if (schema.maximum !== undefined && number > BigInt(schema.maximum)) return { valid: false as const, error: `Maximum ${schema.maximum}.` };
      return result;
    }
    if (schema.minLength !== undefined && text.length < schema.minLength) return { valid: false as const, error: 'Value is too short.' };
    if (schema.maxLength !== undefined && text.length > schema.maxLength) return { valid: false as const, error: 'Value is too long.' };
    if (schema.pattern && !new RegExp(schema.pattern).test(text)) return { valid: false as const, error: 'Value does not match the required format.' };
    return { valid: true as const, value: text };
  };
  const parent = String(path[path.length - 2] ?? '');
  if (path[path.length - 1] === 'name' && /secret|serviceAccount/i.test(parent) && !sensitive(path)) return <ReferencePicker {...field} form={form} query={{ group: '', version: 'v1', resource: /secret/i.test(parent) ? 'secrets' : 'serviceaccounts', namespace: scalarText(form.draft.get([...path.slice(0, -1), 'namespace'])) || form.context.namespace, projection: 'metadata' }} value={scalarText(value)} onChange={text => validity(title, commit(text))} />;
  return <div><ExactValueField {...field} type={sensitive(path) && !referenceMetadata ? 'password' : 'text'} value={sensitive(path) ? '' : scalarText(value)} placeholder={sensitive(path) && form.draft.has(path) ? referenceMetadata ? 'Protected reference retained; type to replace' : 'Protected value retained; type to replace' : schema.default === undefined ? undefined : `Default: ${scalarText(schema.default)}`} identity={`${form.draft.sessionID}:${JSON.stringify(path)}`} parse={parse} onCommit={commit} onValidityChange={error => validity(title, error)} />{form.draft.has(path) && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => validity(title, patchError(removeDraftField(form, path)))}>Unset {title}</Button>}</div>;
}

export default function GeneratorForm(form: ResourceEditorFormProps) {
  const definition = generators.find(item => item.kind === form.context.kind);
  const validity = useFieldValidity(form);
  if (!definition) return null;
  if (form.context.kind === 'GeneratorState') return <EditorSection title="Controller-owned generator state"><p role="status">Inspection only. Cleanup may revoke external credentials.</p><EditorField label="Garbage collection deadline" value={scalarText(form.draft.get(['spec', 'garbageCollectionDeadline']))} onChange={() => {}} readOnly /><span>Generated state and resource snapshot are withheld.</span></EditorSection>;
  if (form.context.kind === 'UUID') return <EditorSection title="UUID generator"><span>No generator parameters. Generated output is never previewed.</span></EditorSection>;
  let schema: Schema = definition.schema;
  let path: ResourceEditorPath = ['spec'];
  const cluster = form.context.kind === 'ClusterGenerator';
  const selected = scalarText(form.draft.get(['spec', 'kind']));
  if (cluster) { const nested = generators.find(item => item.kind === selected); schema = nested?.schema ?? {}; path = ['spec', 'generator', clusterBranches[selected] ?? '']; }
  const effectiveKind = cluster ? selected : form.context.kind;
  const warning = effectiveKind === 'Fake' ? 'Test data only. Do not use for production secrets.' : effectiveKind === 'ACRAccessToken' && !form.draft.has([...path, 'scope']) ? 'Omitting scope requests a full-scope refresh token.' : effectiveKind === 'VaultDynamicSecret' ? 'Reconciliation can create or revoke external leases.' : effectiveKind === 'Webhook' ? 'Reconciliation sends this request to an external endpoint.' : effectiveKind === 'Grafana' ? 'Reconciliation can create a Grafana service account and token.' : cluster ? 'Cluster-scoped configuration may be referenced across namespaces.' : null;
  return <div>{warning && <p role="status">{warning}</p>}
    {cluster && <EditorChoice label="Generator kind" disabled={form.disabled} value={selected} options={[{value:'',label:'Select generator'},...Object.keys(clusterBranches).map(kind=>({value:kind,label:kind}))]} onChange={kind => {
      if (!kind) return;
      const oldBranch = clusterBranches[selected];
      validity('kind', patchError(form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations: [
        ...(oldBranch && form.draft.has(['spec', 'generator', oldBranch]) ? [{ op: 'remove' as const, path: ['spec', 'generator', oldBranch] }] : []),
        { op: 'set', path: ['spec', 'kind'], value: kind },
        { op: 'set', path: ['spec', 'generator', clusterBranches[kind]], value: {} },
      ] })));
    }} />}
    {(!cluster || selected) && (layouts[cluster ? selected : form.context.kind] ?? []).map(section => {
      const fields = section.fields.filter(key => schema.properties?.[key]).map(key => <Node key={`${selected}:${key}`} form={form} schema={schema.properties![key]} path={[...path, key]} title={label(key)} />);
      return section.advanced ? <details key={section.title}><summary>{section.title}</summary>{fields}</details> : <EditorSection key={section.title} title={section.title}>{fields}</EditorSection>;
    })}
  </div>;
}
