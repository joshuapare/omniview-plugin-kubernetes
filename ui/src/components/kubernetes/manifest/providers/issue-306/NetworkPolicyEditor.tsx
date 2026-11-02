import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorHelp, EditorSection, ExactValueField, KeyValueFields, useFieldValidity } from '../../editor-controls';
import { authoringReason, list, object, validCIDR } from './model';
const options = (values: string[]) => values.map(value => ({ value, label: value }));
export default function NetworkPolicyEditor(props: ResourceEditorFormProps) {
  const reason = authoringReason(props.context);
  const form = { ...props, disabled: props.disabled || !!reason };
  const baseline = props.context.kind === 'BaselineAdminNetworkPolicy';
  return <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
    {reason && <div role="status">{reason}</div>}
    <div role="note">Cluster-wide traffic policy. {baseline ? 'Fallback after AdminNetworkPolicy and NetworkPolicy.' : 'Allow can override NetworkPolicy; Pass delegates.'}<EditorHelp label="Policy precedence">Rules run top to bottom. Lower Admin priority runs first; equal priorities have undefined ordering. Empty direction has no effect. Host-network pods are excluded.</EditorHelp></div>
    {props.section === 'subject' && <EditorSection title="Policy subject">
      {!baseline && <Field form={form} path={['spec', 'priority']} label="Priority · 0–1000" numeric max={1000} min={0} />}
      {baseline && <div>Name must be default. No priority or Pass action.</div>}
      <Peer form={form} path={['spec', 'subject']} subject />
    </EditorSection>}
    {(props.section === 'ingress' || props.section === 'egress') && <Rules form={form} direction={props.section} baseline={baseline} />}
  </div>;
}
function mutate(form: ResourceEditorFormProps, operations: ResourceEditorPatch[]) {
  const result = form.patch({ sessionID: form.draft.sessionID, expectedRevision: form.draft.revision, operations });
  return result.status === 'accepted' ? null : result.message;
}
function set(form: ResourceEditorFormProps, path: ResourceEditorPath, value: unknown) { return mutate(form, [{ op: 'set', path, value }]); }
function Field({ form, path, label, numeric = false, min = 1, max = 65535 }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string; numeric?: boolean; min?: number; max?: number }) {
  const validity = useFieldValidity(form);
  const value = form.draft.get(path);
  return <ExactValueField label={label} value={typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value) : ''} identity={`${form.draft.sessionID}:${JSON.stringify(path)}`} disabled={form.disabled} inputMode={numeric ? 'numeric' : 'text'} parse={text => {
    if (path.includes('networks') && !validCIDR(text)) return { valid: false, error: 'Enter a valid IPv4 or IPv6 CIDR.' };
    if (path[path.length - 1] === 'name' && text.length > 100) return { valid: false, error: 'Rule names allow at most 100 characters.' };
    if (!numeric) return { valid: true, value: text };
    if (!/^\d+$/.test(text) || BigInt(text) < BigInt(min) || BigInt(text) > BigInt(max)) return { valid: false, error: `Enter a whole number from ${min} to ${max}.` };
    return { valid: true, value: Number(text) };
  }} onCommit={value => set(form, path, value)} onValidityChange={error => validity(JSON.stringify(path), error)} />;
}
function Choice({ form, path, label, values, change }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string; values: string[]; change?: (value: string) => ResourceEditorPatch[] }) {
  const validity = useFieldValidity(form);
  const value = form.draft.get(path);
  return <EditorChoice label={label} value={typeof value === 'string' ? value : ''} options={options(values)} disabled={form.disabled} onChange={value => validity(JSON.stringify(path), change ? mutate(form, change(value)) : set(form, path, value))} />;
}
function Add({ form, path, value, label, limit = 100 }: { form: ResourceEditorFormProps; path: ResourceEditorPath; value: unknown; label: string; limit?: number }) {
  const validity = useFieldValidity(form); const entries = list(form.draft.get(path));
  return <Button size="sm" disabled={form.disabled || entries.length >= limit} onClick={() => validity(JSON.stringify(path), form.draft.has(path) ? mutate(form, [{ op: 'insert', path, index: entries.length, value }]) : set(form, path, [value]))}>{label}</Button>;
}
function Remove({ form, path }: { form: ResourceEditorFormProps; path: ResourceEditorPath }) {
  const validity = useFieldValidity(form);
  return <Button size="sm" variant="ghost" disabled={form.disabled} onClick={() => validity(JSON.stringify(path), mutate(form, [{ op: 'remove', path }]))}>Remove</Button>;
}
function Selector({ form, path, label }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string }) {
  const expressions = list(form.draft.get([...path, 'matchExpressions']));
  return <div role="group" aria-label={label}><strong>{label}</strong><EditorHelp label={label}>Empty selector matches all. Labels and expressions combine with AND.</EditorHelp>
    <KeyValueFields form={form} path={[...path, 'matchLabels']} label={`${label} label`} />
    <details><summary>Selector expressions · {expressions.length}</summary>{expressions.map((_, i) => {
      const p = [...path, 'matchExpressions', i]; const operator = form.draft.get([...p, 'operator']);
      return <div key={i} style={{ display: 'grid', gap: 8 }}><Field form={form} path={[...p, 'key']} label="Label key" />
        <Choice form={form} path={[...p, 'operator']} label="Operator" values={['In', 'NotIn', 'Exists', 'DoesNotExist']} change={value => [{ op: 'set', path: [...p, 'operator'], value }, ...(value === 'Exists' || value === 'DoesNotExist' ? [{ op: 'remove' as const, path: [...p, 'values'] }] : [])]} />
        {(operator === 'In' || operator === 'NotIn') && <StringList form={form} path={[...p, 'values']} label="Expression value" />}
        <Remove form={form} path={p} /></div>;
    })}<Add form={form} path={[...path, 'matchExpressions']} value={{ key: '', operator: 'Exists' }} label="Add expression" /></details>
  </div>;
}
function StringList({ form, path, label, limit }: { form: ResourceEditorFormProps; path: ResourceEditorPath; label: string; limit?: number }) {
  return <div>{list(form.draft.get(path)).map((_, i) => <div key={i}><Field form={form} path={[...path, i]} label={label} /><Remove form={form} path={[...path, i]} /></div>)}<Add form={form} path={path} value="" label={`Add ${label.toLowerCase()}`} limit={limit} /></div>;
}
function Peer({ form, path, subject = false, egress = false }: { form: ResourceEditorFormProps; path: ResourceEditorPath; subject?: boolean; egress?: boolean }) {
  const value = object(form.draft.get(path)); const type = Object.keys(value)[0] ?? '';
  const validity = useFieldValidity(form);
  const types = ['namespaces', 'pods', ...(egress ? ['nodes', 'networks'].filter(key => form.context.discovery.features[`admin-network-policy-${key}`] === 'available') : [])];
  return <div style={{ display: 'grid', gap: 8 }}><EditorChoice label={subject ? 'Apply to' : 'Peer type'} value={type} options={options(types)} disabled={form.disabled} onChange={next => validity(JSON.stringify(path), set(form, path, { [next]: next === 'pods' ? { namespaceSelector: {}, podSelector: {} } : next === 'networks' ? [''] : {} }))} />
    {type === 'pods' ? <><Selector form={form} path={[...path, 'pods', 'namespaceSelector']} label="Namespaces" /><Selector form={form} path={[...path, 'pods', 'podSelector']} label="Pods" /></> : type === 'networks' ? <StringList form={form} path={[...path, type]} label="CIDR network" limit={25} /> : ['namespaces', 'nodes'].includes(type) ? <Selector form={form} path={[...path, type]} label={type === 'nodes' ? 'Nodes' : 'Namespaces'} /> : <div role="alert">Unsupported peer. Preserve source.</div>}
  </div>;
}
function Rules({ form, direction, baseline }: { form: ResourceEditorFormProps; direction: 'ingress' | 'egress'; baseline: boolean }) {
  const path = ['spec', direction]; const rules = list(form.draft.get(path)); const peer = direction === 'ingress' ? 'from' : 'to';
  return <EditorSection title={`Ordered ${direction} rules`}>
    {rules.length === 0 && <div>No rules: no effect on {direction}.</div>}
    {rules.map((_, i) => { const p = [...path, i]; return <fieldset key={i} disabled={form.disabled} style={{ minWidth: 0, border: '1px solid var(--ov-color-border-default)', padding: 12 }}><legend>Rule {i + 1}</legend>
      <Field form={form} path={[...p, 'name']} label="Rule name · optional" /><Choice form={form} path={[...p, 'action']} label="Action" values={baseline ? ['Allow', 'Deny'] : ['Allow', 'Deny', 'Pass']} />
      {list(form.draft.get([...p, peer])).map((_, j) => <details key={j} open><summary>Peer {j + 1}</summary><Peer form={form} path={[...p, peer, j]} egress={direction === 'egress'} /><Remove form={form} path={[...p, peer, j]} /></details>)}
      <Add form={form} path={[...p, peer]} value={{ namespaces: {} }} label="Add peer" />
      <details><summary>Ports · {form.draft.has([...p, 'ports']) ? 'specific' : 'all'}</summary>
        {list(form.draft.get([...p, 'ports'])).map((value, j) => <Port key={j} form={form} path={[...p, 'ports', j]} value={value} />)}
        <Add form={form} path={[...p, 'ports']} value={{ portNumber: { port: 1, protocol: 'TCP' } }} label="Add port" />
        {form.draft.has([...p, 'ports']) && <Remove form={form} path={[...p, 'ports']} />}
      </details>
      <Remove form={form} path={p} />
      <MoveRule form={form} path={path} index={i} />
    </fieldset>; })}
    <Add form={form} path={path} value={{ action: 'Deny', [peer]: [{ namespaces: {} }] }} label={`Add ${direction} rule`} />
  </EditorSection>;
}
function Port({ form, path, value }: { form: ResourceEditorFormProps; path: ResourceEditorPath; value: unknown }) {
  const type = Object.keys(object(value))[0] ?? ''; const validity = useFieldValidity(form);
  const types = ['portNumber', 'portRange', ...(form.context.discovery.features['admin-network-policy-named-ports'] === 'available' ? ['namedPort'] : [])];
  return <div><EditorChoice label="Port type" value={type} options={options(types)} disabled={form.disabled} onChange={next => validity(JSON.stringify(path), set(form, path, { [next]: next === 'namedPort' ? '' : next === 'portRange' ? { start: 1, end: 2, protocol: 'TCP' } : { port: 1, protocol: 'TCP' } }))} />
    {type === 'namedPort' ? <Field form={form} path={[...path, type]} label="Port name" /> : <><Choice form={form} path={[...path, type, 'protocol']} label="Protocol" values={['TCP', 'UDP', 'SCTP']} />{(type === 'portRange' ? ['start', 'end'] : ['port']).map(key => <Field key={key} form={form} path={[...path, type, key]} label={key} numeric />)}</>}
    <Remove form={form} path={path} />
  </div>;
}
function MoveRule({ form, path, index }: { form: ResourceEditorFormProps; path: ResourceEditorPath; index: number }) {
  const validity = useFieldValidity(form);
  return <Button size="sm" disabled={form.disabled || index === 0} onClick={() => {
    validity(`move:${JSON.stringify(path)}`, mutate(form, [
      { op: 'set', path: [...path, index - 1], value: form.draft.get([...path, index]) },
      { op: 'set', path: [...path, index], value: form.draft.get([...path, index - 1]) },
    ]));
  }}>Move up</Button>;
}
