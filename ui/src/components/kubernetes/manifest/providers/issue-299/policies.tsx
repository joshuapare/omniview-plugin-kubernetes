import { useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorHelp, EditorSection, ExactValueField, KeyValueFields, ReferencePicker, patchFields, patchError, setDraftField, removeDraftField, scalarText, useFieldValidity } from '../../editor-controls';
import { modes } from './model';
type Form = ResourceEditorFormProps;
const options = (values: string[]) => values.map(value => ({ value, label: value || 'Inherit / omitted' }));
function Field({ form, path, label, required = false, help }: { form: Form; path: ResourceEditorPath; label: string; required?: boolean; help?: string }) {
  const validity = useFieldValidity(form);
  return <ExactValueField label={label} help={help} identity={`${form.draft.sessionID}:${JSON.stringify(path)}`} value={scalarText(form.draft.get(path))} disabled={form.disabled} parse={value => required && !value.trim() ? { valid: false, error: `${label} is required.` } : { valid: true, value }} onCommit={value => patchError(setDraftField(form, path, value))} onValidityChange={error => validity(JSON.stringify(path), error)} />;
}
function List({ form, path, label }: { form: Form; path: ResourceEditorPath; label: string }) {
  const values = form.draft.get(path);
  return <div role="group" aria-label={label}>{Array.isArray(values) && values.map((_, index) => <div key={index} className="resource-editor-map-row"><Field form={form} path={[...path, index]} label={`${label} ${index + 1}`} /><Remove form={form} path={[...path, index]} label={`${label} ${index + 1}`} /></div>)}<Add form={form} path={path} value="" label={label} /></div>;
}
function Add({ form, path, value, label }: { form: Form; path: ResourceEditorPath; value: unknown; label: string }) {
  const validity = useFieldValidity(form);
  return <Button size="sm" disabled={form.disabled} onClick={() => {
    const values = form.draft.get(path);
    if (values !== undefined && !Array.isArray(values)) { validity(label, 'Unsupported list shape. Edit original source.'); return; }
    const operation: ResourceEditorPatch = Array.isArray(values) ? { op: 'insert', path, index: values.length, value } : { op: 'set', path, value: [value] };
    validity(label, patchError(patchFields(form, [operation])));
  }}>Add {label}</Button>;
}
function Remove({ form, path, label }: { form: Form; path: ResourceEditorPath; label: string }) {
  const validity = useFieldValidity(form);
  return <Button size="sm" variant="ghost" disabled={form.disabled} aria-label={`Remove ${label}`} onClick={() => validity(label, patchError(removeDraftField(form, path)))}>Remove</Button>;
}
function Target({ form, peer = false }: { form: Form; peer?: boolean }) {
  const validity = useFieldValidity(form);
  const mode = form.draft.has(['spec', 'targetRefs']) ? 'references' : form.draft.has(['spec', 'selector']) ? 'labels' : 'all';
  const refs = form.draft.get(['spec', 'targetRefs']);
  return <EditorSection title="Target scope"><EditorChoice label="Apply to" value={mode} options={[{ value: 'all', label: 'Namespace / mesh scope' }, { value: 'labels', label: 'Workload labels' }, ...(!peer ? [{ value: 'references', label: 'Target references' }] : [])]} disabled={form.disabled} help="Root namespace is installation-specific. Waypoints require target references; mixed pre-1.22 revisions require revision isolation. Discovery does not prove enforcement." onChange={next => {
    const operations: ResourceEditorPatch[] = [];
    for (const key of ['selector', 'targetRefs']) if (form.draft.has(['spec', key])) operations.push({ op: 'remove', path: ['spec', key] });
    if (next === 'labels') operations.push({ op: 'set', path: ['spec', 'selector'], value: { matchLabels: {} } });
    if (next === 'references') operations.push({ op: 'set', path: ['spec', 'targetRefs'], value: [] });
    validity('target', patchError(patchFields(form, operations)));
  }} />{mode === 'labels' && <KeyValueFields form={form} path={['spec', 'selector', 'matchLabels']} label="Workload label" validateKey={key => !key || key.includes('*') ? 'Use an exact label key.' : null} />}{mode === 'references' && <>{Array.isArray(refs) && refs.map((_, index) => <div key={index}><Field form={form} path={['spec', 'targetRefs', index, 'group']} label="API group" /><EditorChoice label="Target kind" value={scalarText(form.draft.get(['spec', 'targetRefs', index, 'kind']))} options={options(['Service', 'Gateway', 'GatewayClass', 'ServiceEntry'])} disabled={form.disabled} onChange={value => validity('kind', patchError(setDraftField(form, ['spec', 'targetRefs', index, 'kind'], value)))} />{form.draft.get(['spec', 'targetRefs', index, 'kind']) === 'Service' ? <ReferencePicker form={form} label="Service" value={scalarText(form.draft.get(['spec', 'targetRefs', index, 'name']))} query={{ group: '', version: 'v1', resource: 'services', namespace: form.context.namespace }} onChange={value => validity('service', patchError(setDraftField(form, ['spec', 'targetRefs', index, 'name'], value)))} /> : <Field form={form} path={['spec', 'targetRefs', index, 'name']} label="Target name" required />}<Remove form={form} path={['spec', 'targetRefs', index]} label="target" /></div>)}<Add form={form} path={['spec', 'targetRefs']} value={{ group: '', kind: 'Service', name: '' }} label="target" /></>}</EditorSection>;
}
export function AuthorizationPolicy(form: Form) {
  const validity = useFieldValidity(form);
  const rules = form.draft.get(['spec', 'rules']);
  const action = scalarText(form.draft.get(['spec', 'action'])) || 'ALLOW';
  return <><Target form={form} /><EditorSection title="Authorization"><EditorChoice label="Action" value={action} options={options(['ALLOW', 'DENY', 'AUDIT', 'CUSTOM'])} disabled={form.disabled} help="CUSTOM → DENY → ALLOW. AUDIT requires its plugin. HTTP DENY attributes can match missing TCP attributes; scope destination ports." onChange={value => validity('action', patchError(setDraftField(form, ['spec', 'action'], value)))} />{action === 'CUSTOM' && <Field form={form} path={['spec', 'provider', 'name']} label="External provider" required />}<p role="note">{action === 'ALLOW' && (!Array.isArray(rules) || !rules.length) ? 'No rules: this policy allows no requests.' : 'Rules match with OR. An empty rule matches every request.'}</p>{Array.isArray(rules) && rules.map((_, index) => <EditorSection key={index} title={`Rule ${index + 1}`}><RuleSources form={form} index={index} /><RuleOperations form={form} index={index} /><Remove form={form} path={['spec', 'rules', index]} label={`rule ${index + 1}`} /></EditorSection>)}<Add form={form} path={['spec', 'rules']} value={{}} label="rule" /></EditorSection></>;
}
function RuleSources({ form, index }: { form: Form; index: number }) {
  const path = ['spec', 'rules', index, 'from'] as const;
  const sources = form.draft.get(path);
  return <>{Array.isArray(sources) && sources.map((_, source) => <details key={source}><summary>Source {source + 1}</summary>{['namespaces', 'principals', 'requestPrincipals', 'serviceAccounts', 'ipBlocks', 'remoteIpBlocks', 'notNamespaces', 'notPrincipals'].map(key => <List key={key} form={form} path={[...path, source, 'source', key]} label={key} />)}<Remove form={form} path={[...path, source]} label="source" /></details>)}<Add form={form} path={path} value={{ source: {} }} label="source" /></>;
}
function RuleOperations({ form, index }: { form: Form; index: number }) {
  const path = ['spec', 'rules', index, 'to'] as const;
  const operations = form.draft.get(path);
  return <>{Array.isArray(operations) && operations.map((_, operation) => <details key={operation} open><summary>Operation {operation + 1}</summary>{['methods', 'paths', 'ports', 'hosts', 'notMethods', 'notPaths', 'notPorts', 'notHosts'].map(key => <List key={key} form={form} path={[...path, operation, 'operation', key]} label={key} />)}<Remove form={form} path={[...path, operation]} label="operation" /></details>)}<Add form={form} path={path} value={{ operation: {} }} label="operation" /></>;
}
export function PeerAuthentication(form: Form) {
  const validity = useFieldValidity(form);
  const [port, setPort] = useState('');
  const ports = form.draft.get(['spec', 'portLevelMtls']);
  const mode = (path: ResourceEditorPath, label: string) => <EditorChoice label={label} value={scalarText(form.draft.get(path))} options={options(modes)} disabled={form.disabled} onChange={value => validity(label, patchError(value ? setDraftField(form, path, value) : removeDraftField(form, path)))} />;
  return <><Target form={form} peer /><EditorSection title="Inbound mTLS">{mode(['spec', 'mtls', 'mode'], 'mTLS mode')}<EditorHelp label="mTLS precedence">Workload policy overrides namespace and mesh policy. STRICT rejects non-mTLS traffic. Ambient cannot DISABLE mTLS. Overrides use workload ports, never Service ports.</EditorHelp><details><summary>Workload port overrides</summary>{ports !== null && typeof ports === 'object' && Object.keys(ports).map(key => <div key={key}>{mode(['spec', 'portLevelMtls', key, 'mode'], `Workload port ${key}`)}<Remove form={form} path={['spec', 'portLevelMtls', key]} label={`port ${key}`} /></div>)}<EditorField label="Workload port" value={port} inputMode="numeric" disabled={form.disabled} onChange={setPort} /><Button size="sm" disabled={form.disabled} onClick={() => {
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) { validity('port', 'Workload port must be 1–65535.'); return; }
    if (form.draft.has(['spec', 'portLevelMtls', port])) { validity('port', 'Port already exists.'); return; }
    validity('port', patchError(patchFields(form, [{ op: 'set', path: ['spec', 'portLevelMtls', port, 'mode'], value: 'STRICT' }])));
  }}>Add port override</Button></details></EditorSection></>;
}
export function RequestAuthentication(form: Form) {
  const rules = form.draft.get(['spec', 'jwtRules']);
  return <><Target form={form} /><EditorSection title="JWT issuers"><p role="note">Missing JWT remains accepted. Requiring JWT needs a separate AuthorizationPolicy.</p>{Array.isArray(rules) && rules.map((_, index) => <EditorSection key={index} title={`Issuer ${index + 1}`}><Field form={form} path={['spec', 'jwtRules', index, 'issuer']} label="Issuer" required /><List form={form} path={['spec', 'jwtRules', index, 'audiences']} label="Audience" /><Field form={form} path={['spec', 'jwtRules', index, 'jwksUri']} label="Public JWKS URL" help="Omit for issuer discovery. Never enter JWT credentials. Existing inline JWKS remains source-owned." /><details><summary>Token extraction and forwarding</summary><List form={form} path={['spec', 'jwtRules', index, 'fromParams']} label="Query parameter" /><List form={form} path={['spec', 'jwtRules', index, 'fromCookies']} label="Cookie name" /><Field form={form} path={['spec', 'jwtRules', index, 'timeout']} label="JWKS timeout" /><Field form={form} path={['spec', 'jwtRules', index, 'outputPayloadToHeader']} label="Payload output header" help="Forwarding claims can expose personal information to upstream services." /></details><Remove form={form} path={['spec', 'jwtRules', index]} label={`issuer ${index + 1}`} /></EditorSection>)}<Add form={form} path={['spec', 'jwtRules']} value={{ issuer: '' }} label="issuer" /></EditorSection></>;
}
