import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { useEffect, useId, useMemo, useState } from 'react';

import { EditorChoice, EditorField, EditorHelp, EditorSection, patchFields, useEditorReferences } from '../../editor-controls';

import { MANAGER, SERVICE, addressError, dnsLabel, dnsName, formUnavailable, isReadOnly, labelValue, managerError, ownership, portError, qualifiedName, record, rows, text, validate } from './model';
import './endpoint-slice.css';

type Pending = { text: string; error: string };
const pathKey = (path: ResourceEditorPath) => JSON.stringify(path);
const choices = (values: readonly string[]) => values.map(value => ({ value, label: value }));
const conditionOptions = [{ value: '', label: 'Unspecified (omitted)' }, { value: 'true', label: 'True' }, { value: 'false', label: 'False' }];

export default function EndpointSliceForm(props: ResourceEditorFormProps) {
  return <EndpointSliceSession key={props.draft.sessionID} {...props} />;
}
function EndpointSliceSession(form: ResourceEditorFormProps) {
  const { draft, context, section, onValidityChange } = form;
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const scopedReferences = useMemo<ResourceEditorFormProps['references']>(() => ({
    list: request => context.namespace ? form.references.list(request) : Promise.resolve({ status: 'unavailable', message: 'Choose a namespace before looking up Services.' }),
  }), [form.references, context.namespace]);
  const lookup = useEditorReferences({ ...form, references: scopedReferences }, { group: '', version: 'v1', resource: 'services', namespace: context.namespace, projection: 'servicePorts' });
  const listID = useId();
  const readonly = isReadOnly(draft, context) || !!form.baseline && ownership(form.baseline) !== 'manual';
  const locked = form.disabled || readonly || !context.namespace || context.discovery.status !== 'available' || context.schema.status !== 'available' || (context.intent === 'create' ? context.capabilities.create : context.capabilities.update) !== 'available';
  const family = draft.get(['addressType']);
  const endpoints = rows(draft.get(['endpoints']));
  const ports = rows(draft.get(['ports']));
  const [rowKeys, setRowKeys] = useState(() => ({
    endpoints: endpoints.map((_, position) => `endpoint-${position}`),
    ports: ports.map((_, position) => `port-${position}`),
    next: endpoints.length + ports.length,
  }));
  // Source-mode replacement can change collection lengths between mounted revisions.
  // Explicit form insert/remove updates these identities in the originating event.
  if (rowKeys.endpoints.length !== endpoints.length || rowKeys.ports.length !== ports.length) {
    let next = rowKeys.next;
    const endpointKeys = Array.from({ length: endpoints.length }, (_, position) => rowKeys.endpoints[position] ?? `row-${next++}`);
    const portKeys = Array.from({ length: ports.length }, (_, position) => rowKeys.ports[position] ?? `row-${next++}`);
    setRowKeys({ endpoints: endpointKeys, ports: portKeys, next });
  }
  const fieldIssues = validate(draft, context);
  const unsupported = formUnavailable(draft, context);
  const selectedService = lookup.status === 'ready' ? lookup.items.find(item => item.name === draft.get(SERVICE) && item.namespace === context.namespace) : undefined;
  const serviceError = !readonly && selectedService?.serviceSelector === 'present' ? 'Service has a selector. Choose a selectorless Service for manual association.' : null;
  const pendingError = Object.values(pending)[0]?.error ?? (newAddress ? 'Add the pending endpoint or clear its address.' : null);
  useEffect(() => { onValidityChange(pendingError ?? failure ?? serviceError); }, [pendingError, failure, serviceError, onValidityChange]);
  useEffect(() => () => onValidityChange(null), [onValidityChange]);
  const commit = (operations: readonly ResourceEditorPatch[]) => {
    if (locked) return false;
    const result = patchFields(form, operations);
    setFailure(result.status === 'accepted' ? null : result.message);
    return result.status === 'accepted';
  };
  const change = (path: ResourceEditorPath, value: string, check?: (value: string) => string | null, number = false) => {
    const key = pathKey(path);
    const error = check?.(value);
    if (error) { setPending(current => ({ ...current, [key]: { text: value, error } })); return; }
    const operation: ResourceEditorPatch = value === '' ? { op: 'remove', path } : { op: 'set', path, value: number ? BigInt(value) : value };
    if (commit([operation])) setPending(current => { const next = { ...current }; delete next[key]; return next; });
    else setPending(current => ({ ...current, [key]: { text: value, error: 'Draft changed or edit was rejected. Re-enter this value.' } }));
  };
  const field = (path: ResourceEditorPath, label: string, check?: (value: string) => string | null, help?: string, numeric = false, forceLocked = false) => {
    const key = pathKey(path);
    const value = draft.get(path);
    return <EditorField key={key} label={label} value={pending[key]?.text ?? (typeof value === 'bigint' || typeof value === 'number' ? String(value) : text(value))} disabled={locked || forceLocked} inputMode={numeric ? 'numeric' : 'text'} help={help} error={pending[key]?.error ?? fieldIssues.find(issue => pathKey(issue.path) === key)?.message} onChange={next => change(path, next, check, numeric)} />;
  };
  const append = (key: 'endpoints' | 'ports', value: unknown) => {
    const accepted = commit(draft.has([key]) ? [{ op: 'insert', path: [key], index: rows(draft.get([key])).length, value }] : [{ op: 'set', path: [key], value: [value] }]);
    if (accepted) setRowKeys(current => ({ ...current, [key]: [...current[key], `row-${current.next}`], next: current.next + 1 }));
    return accepted;
  };
  const remove = (key: 'endpoints' | 'ports', index: number) => {
    if (!commit([{ op: 'remove', path: [key, index] }])) return;
    setRowKeys(current => ({ ...current, [key]: current[key].filter((_, position) => position !== index) }));
    setPending(current => Object.fromEntries(Object.entries(current).flatMap(([name, value]) => {
      const path = JSON.parse(name) as (string | number)[];
      if (path[0] !== key || typeof path[1] !== 'number') return [[name, value]];
      if (path[1] === index) return [];
      if (path[1] > index) path[1]--;
      return [[pathKey(path), value]];
    })));
  };
  const boolField = (path: ResourceEditorPath, label: string, help?: string) => <EditorChoice label={label} value={typeof draft.get(path) === 'boolean' ? String(draft.get(path)) : ''} options={conditionOptions} disabled={locked} help={help} onChange={value => commit([value === '' ? { op: 'remove', path } : { op: 'set', path, value: value === 'true' }])} />;
  if (unsupported) return <div role="status">{unsupported}</div>;
  return <div className="endpoint-slice-form">
    {failure && <p role="alert">{failure}</p>}
    {readonly && <p className="endpoint-slice-notice" role="status">Inspection only. Change the owning Service or workload; no takeover action is offered.</p>}
    {!readonly && <p className="endpoint-slice-notice">Address, readiness, port and Service changes can redirect or interrupt traffic.</p>}
    {(section === 'association' || section === 'ownership') && <>
      <EditorSection title="Ownership & service association">
        <dl className="endpoint-slice-facts"><dt>Ownership</dt><dd>{context.ownership?.status ?? 'unknown'} · {ownership(form.baseline ?? draft)}</dd><dt>Namespace</dt><dd>{context.namespace ?? 'Not selected'}</dd></dl>
        <div className="endpoint-slice-grid">
          <EditorChoice label="Address family" value={text(family)} options={[{ value: '', label: 'Choose family' }, ...choices(['IPv4', 'IPv6'])]} disabled={locked || context.intent !== 'create'} help="All addresses share one family. Immutable after creation. Changing family may invalidate existing addresses." onChange={value => { if (value) commit([{ op: 'set', path: ['addressType'], value }]); }} />
          {field(MANAGER, 'Manual manager', managerError, 'Distinct ownership label, not authentication or proof of permission. Existing managers cannot be taken over here.', false, context.intent !== 'create')}
          <EditorField label="Existing Service (optional)" list={listID} value={pending[pathKey(SERVICE)]?.text ?? text(draft.get(SERVICE))} disabled={locked} error={pending[pathKey(SERVICE)]?.error ?? serviceError} help="Same namespace. Associate only with a selectorless Service. No Service, owner reference or workload is created. Empty means no association." onChange={value => change(SERVICE, value, value => value && !dnsLabel(value) ? 'Use a valid Service DNS label.' : null)} />
          <datalist id={listID}>{lookup.status === 'ready' && lookup.items.filter(item => item.namespace === context.namespace && item.serviceSelector === 'none').map(item => <option value={item.name} key={item.name} />)}</datalist>
        </div>
        <div role="status" aria-label="Service lookup">{lookup.status === 'loading' ? 'Loading Services…' : lookup.status === 'ready' ? !lookup.items.length ? 'No Services found. Existing or manual name remains available.' : selectedService?.serviceSelector === 'none' ? 'Same-namespace selectorless Service verified. Controller health is not checked.' : 'Only verified selectorless Services are suggested. Manual or existing association remains unresolved.' : lookup.status === 'denied' ? 'Service access denied. Manual association remains unresolved.' : lookup.status === 'absent' ? 'Service API absent. Manual association remains unresolved.' : 'Service lookup unavailable. Manual association remains unresolved.'}</div>
      </EditorSection>
      <EditorSection title="Owners">
        {rows(draft.get(['metadata', 'ownerReferences'])).length ? <ul>{rows(draft.get(['metadata', 'ownerReferences'])).map(owner => <li key={`${text(record(owner).apiVersion)}/${text(record(owner).kind)}/${text(record(owner).name)}/${text(record(owner).uid)}`}>{text(record(owner).kind)} / {text(record(owner).name)}{record(owner).controller === true ? ' · controller' : ''}</li>)}</ul> : <span>No owner reference declared.</span>}
        <EditorHelp label="Ownership boundary">Labels alone do not prove manual ownership. Edit requires trusted application ownership and a distinct manual manager. Unknown or generated ownership remains inspection-only.</EditorHelp>
      </EditorSection>
    </>}
    {section === 'endpoints' && <EditorSection title={`Backends (${endpoints.length})`}>
      {!endpoints.length && <p>No endpoints. An empty slice sends no traffic to a backend.</p>}
      {endpoints.map((endpoint, index) => {
        const row = record(endpoint);
        return <div className="endpoint-slice-row" key={rowKeys.endpoints[index]}>
          <div className="endpoint-slice-row-heading"><strong>Backend {index + 1}</strong><Button size="sm" variant="ghost" disabled={locked} onClick={() => remove('endpoints', index)} aria-label={`Remove backend ${index + 1}`}>Remove</Button></div>
          <div className="endpoint-slice-grid">
            {field(['endpoints', index, 'addresses', 0], `Backend ${index + 1} address`, value => addressError(value, family), 'First address drives kube-proxy. Additional source addresses stay unchanged.')}
            {boolField(['endpoints', index, 'conditions', 'ready'], `Backend ${index + 1} ready`, 'Declared readiness, not measured health. Unspecified is interpreted as true. False may remove this backend from traffic.')}
          </div>
          {rows(row.addresses).length > 1 && <span>{rows(row.addresses).length - 1} additional source addresses retained.</span>}
          <details><summary>Topology & lifecycle</summary><div className="endpoint-slice-grid">
            {field(['endpoints', index, 'hostname'], `Backend ${index + 1} hostname`, value => value && !dnsLabel(value) ? 'Use a lowercase DNS label.' : null)}
            {field(['endpoints', index, 'nodeName'], `Backend ${index + 1} node`, value => value && !dnsName(value) ? 'Use a valid Node DNS name.' : null)}
            {field(['endpoints', index, 'zone'], `Backend ${index + 1} zone`, value => value && !labelValue(value) ? 'Use a label value up to 63 characters.' : null)}
            {boolField(['endpoints', index, 'conditions', 'serving'], `Backend ${index + 1} serving`, 'Unspecified is interpreted as true. Consumers may use serving during termination.')}
            {boolField(['endpoints', index, 'conditions', 'terminating'], `Backend ${index + 1} terminating`, 'Unspecified is interpreted as false. Consumers may avoid terminating endpoints.')}
          </div><EditorHelp label={`Backend ${index + 1} advanced source`}>targetRef, routing hints, extra addresses and unknown fields remain intact in source. deprecatedTopology is not writable through v1. Routing hint support depends on cluster configuration.</EditorHelp></details>
        </div>;
      })}
      {!readonly && <div className="endpoint-slice-row"><EditorField label="New backend address" value={newAddress} onChange={value => { setNewAddress(value); setAddressTouched(true); }} disabled={locked || endpoints.length >= 1000} error={addressTouched && newAddress ? addressError(newAddress, family) : null} />
        <Button size="sm" disabled={locked || !newAddress || !!addressError(newAddress, family) || endpoints.length >= 1000} onClick={() => { if (append('endpoints', { addresses: [newAddress] })) { setNewAddress(''); setAddressTouched(false); } }}>Add backend</Button>
        {!draft.has(['endpoints']) && <Button size="sm" variant="ghost" disabled={locked} onClick={() => commit([{ op: 'set', path: ['endpoints'], value: [] }])}>Use empty slice</Button>}
      </div>}
    </EditorSection>}
    {section === 'ports' && <EditorSection title={`Backend ports (${ports.length})`}>
      {!ports.length && <p>No ports declared.</p>}
      {ports.map((_port, index) => <div className="endpoint-slice-row" key={rowKeys.ports[index]}>
        <div className="endpoint-slice-row-heading"><strong>Port {index + 1}</strong><Button size="sm" variant="ghost" disabled={locked} aria-label={`Remove port ${index + 1}`} onClick={() => remove('ports', index)}>Remove</Button></div>
        <div className="endpoint-slice-grid">
          {field(['ports', index, 'name'], `Port ${index + 1} name`, value => value && !dnsLabel(value) ? 'Use a lowercase DNS label.' : null, 'Names must be unique, including the unnamed port.')}
          {field(['ports', index, 'port'], `Port ${index + 1} backend number`, portError, 'Destination port, not Service port or nodePort. Empty preserves omission.', true)}
          <EditorChoice label={`Port ${index + 1} protocol`} value={text(draft.get(['ports', index, 'protocol']))} options={[{ value: '', label: 'Default TCP (omitted)' }, ...choices(['TCP', 'UDP', 'SCTP'])]} disabled={locked} onChange={value => change(['ports', index, 'protocol'], value)} />
          {field(['ports', index, 'appProtocol'], `Port ${index + 1} application protocol`, value => value && !qualifiedName(value) ? 'Use an application protocol or qualified name.' : null, 'Protocol hint only; no listener or implementation is installed.')}
        </div>
      </div>)}
      {!readonly && <Button size="sm" disabled={locked || ports.length >= 20000} onClick={() => append('ports', {})}>Add port</Button>}
    </EditorSection>}
  </div>;
}
