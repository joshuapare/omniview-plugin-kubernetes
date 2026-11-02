import { useCallback } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorSection, KeyValueFields } from '../../editor-controls';
import { allocationOperations, branchOperations, claimGateUnavailable, claimReadOnly, claimRoot, classNameError, dnsLabel, generatedClaim, labelKeyError, labelValueError, positiveCount, record, requestBodyPath, rows, text } from './model';
import { AddRow, DraEditor, DraftChoice, DraftField, Notice, RemoveRow, Selectors, Summary, useDra } from './shared';

const modes = [{ value: 'ExactCount', label: 'Exact count' }, { value: 'All', label: 'All matching devices in one pool' }];
function RequestBody({ path, alternate }: { path: ResourceEditorPath; alternate?: number }) {
  const { form } = useDra(); const gate = form.context.discovery.features;
  const mode = text(form.draft.get([...path, 'allocationMode'])) || 'ExactCount';
  return <>
    {alternate !== undefined && <DraftField label={`Alternative ${alternate + 1} name`} path={[...path, 'name']} required validate={dnsLabel} />}
    <div className="dra-grid"><DraftField label="Device class" path={[...path, 'deviceClassName']} required validate={classNameError} reference help="Select an installed class or retain an unresolved name. A class does not guarantee device availability." />
      <DraftChoice label="Allocation" path={[...path, 'allocationMode']} fallback="ExactCount" options={modes} onChoose={value => allocationOperations(form.draft, path, value)} />
      {mode === 'ExactCount' && <DraftField label="Device count" path={[...path, 'count']} placeholder="1 (API default)" numeric emptyIsPartial parse={value => { const result = positiveCount(value); return result.valid ? { value: result.value } : { error: result.error }; }} />}</div>
    {mode === 'All' && <Notice>Requests every matching device in one pool. Existing allocations may prevent scheduling.</Notice>}
    <details className="dra-advanced"><summary>Request selectors and advanced fields</summary><Selectors path={[...path, 'selectors']} />
      {alternate === undefined && <DraftChoice label="Administrative access" path={[...path, 'adminAccess']} readOnly={gate.DRAAdminAccess !== 'available'} options={[{ value: '', label: 'API default' }, { value: 'false', label: 'Disabled' }, { value: 'true', label: 'Enabled' }]} onChoose={value => value === '' ? [{ op: 'remove', path: [...path, 'adminAccess'] }] : [{ op: 'set', path: [...path, 'adminAccess'], value: value === 'true' }]} />}
      {alternate === undefined && gate.DRAAdminAccess !== 'available' && <Notice>DRAAdminAccess: {gate.DRAAdminAccess ?? 'unknown'}. Existing values remain unchanged.</Notice>}
      {(form.draft.has([...path, 'capacity']) || form.draft.has([...path, 'tolerations'])) && <Notice>Capacity and tolerations retained unchanged. Edit these gated fields in YAML.</Notice>}
    </details>
  </>;
}
function RequestRow({ path, index }: { path: ResourceEditorPath; index: number }) {
  const { form, locked, commit, setLocal, locals } = useDra(); const alternatives = rows(form.draft.get([...path, 'firstAvailable'])); const prioritized = form.draft.has([...path, 'firstAvailable']);
  const feature = form.context.discovery.features.DRAPrioritizedList;
  const switchBranch = (value: string) => {
    const operations = branchOperations(form.draft, form.context, path, value === 'prioritized');
    if (typeof operations === 'string') { setLocal(JSON.stringify(path), { canonical: text(form.draft.get(path)), text: '', error: operations }); return; }
    setLocal(JSON.stringify(path), { canonical: text(form.draft.get(path)), text: '', error: null }); commit(operations);
  };
  return <EditorSection title={`Request ${index + 1}`}><div className="dra-row"><DraftField label={`Request ${index + 1} name`} path={[...path, 'name']} required validate={dnsLabel} /><RemoveRow path={path} label={`Remove request ${index + 1}`} /></div>
    <EditorChoice label="Request strategy" value={prioritized ? 'prioritized' : 'exact'} disabled={locked || feature !== 'available'} options={[{ value: 'exact', label: 'Single exact request' }, { value: 'prioritized', label: 'Ordered alternatives' }]} onChange={switchBranch} help="The scheduler tries alternatives in order. Advanced fields are never discarded when switching strategies." />
    {locals[JSON.stringify(path)]?.error && <Notice error>{locals[JSON.stringify(path)].error}</Notice>}
    {feature !== 'available' && <Notice>DRAPrioritizedList: {feature ?? 'unknown'}.</Notice>}
    {prioritized ? <>{alternatives.map((_, i) => <div className="dra-card" key={i}><RequestBody path={requestBodyPath(form.context, path, i)} alternate={i} /><RemoveRow path={[...path, 'firstAvailable', i]} label={`Remove alternative ${i + 1}`} /></div>)}<AddRow path={[...path, 'firstAvailable']} value={{ name: '', deviceClassName: '' }} label="Add next alternative" max={8} /></> : <RequestBody path={requestBodyPath(form.context, path)} />}
  </EditorSection>;
}
function Allocation() {
  const { form } = useDra();
  const allocated = rows(form.draft.get(['status', 'allocation', 'devices', 'results']));
  const reservations = rows(form.draft.get(['status', 'reservedFor']));
  return <><EditorSection title="Allocation">{allocated.length ? allocated.map((item, i) => { const row = record(item); return <div className="dra-card" key={i}><Summary label="Request" value={row.request} /><Summary label="Driver" value={row.driver} /><Summary label="Pool" value={row.pool} /><Summary label="Device" value={row.device} /></div>; }) : <Notice>No allocation recorded.</Notice>}</EditorSection>
    <EditorSection title="Reserved consumers">{reservations.length ? reservations.map((value, i) => { const consumer = record(value); return <Summary key={i} label={`${text(consumer.apiGroup) || 'core'}/${text(consumer.resource)}`} value={consumer.name} />; }) : <Notice>No consumers recorded.</Notice>}</EditorSection>
    {form.draft.has(['status', 'devices']) && <Notice>Driver-reported device state remains read-only. Opaque driver data stays protected.</Notice>}</>;
}
function TemplateMetadata() {
  const { form, locked, setLocal } = useDra(); const path = ['spec', 'metadata', 'labels'] as const;
  const canonical = text(form.draft.get(path));
  // The validity ledger registers by callback identity and reports on registration.
  // Keep this boundary stable so its report cannot trigger another registration.
  const onValidityChange = useCallback((error: string | null) => setLocal('["spec","metadata","labels"]', { canonical, text: '', error }), [canonical, setLocal]);
  return <><KeyValueFields form={{ ...form, disabled: locked, onValidityChange }} path={path} label="Copied claim labels" validateKey={labelKeyError} validateValue={labelValueError} />
    {form.draft.has(['spec', 'metadata', 'annotations']) && <Notice>Copied annotations retained and masked. Use the protected source workflow for changes.</Notice>}</>;
}
export default function ClaimsForm(form: ResourceEditorFormProps) {
  const locked = claimReadOnly(form.draft, form.context) || form.context.ownership?.status === 'controller' || form.context.ownership?.status === 'system';
  const generated = form.context.kind === 'ResourceClaim' && generatedClaim(form.draft);
  const path = [...claimRoot(form.context.kind), 'requests'];
  return <DraEditor form={form} locked={locked}>
    {generated && <Notice>Controller-owned claim. Change its template or workload for future claims.</Notice>}
    {!generated && form.context.intent !== 'create' && <Notice>Claim specification is immutable. Create a new claim or template for different requests.</Notice>}
    {claimGateUnavailable(form.draft, form.context) && <Notice>{claimGateUnavailable(form.draft, form.context)}</Notice>}
    {form.section === 'requests' && <>{rows(form.draft.get(path)).map((_, index) => <RequestRow path={[...path, index]} index={index} key={index} />)}<AddRow path={path} value={form.context.version === 'v1beta1' ? { name: '', deviceClassName: '' } : { name: '', exactly: { deviceClassName: '' } }} label="Add device request" /></>}
    {form.section === 'advanced' && <>{form.context.kind === 'ResourceClaimTemplate' && <TemplateMetadata />}{['constraints', 'config'].some(key => form.draft.has([...claimRoot(form.context.kind), key])) && <Notice>Cross-request constraints and opaque driver configuration retained unchanged. Use YAML or its driver provider.</Notice>}{!['constraints', 'config'].some(key => form.draft.has([...claimRoot(form.context.kind), key])) && <Notice>Optional cross-request constraints and driver configuration can be added in YAML.</Notice>}</>}
    {form.section === 'allocation' && <><EditorSection title="Ownership">{rows(form.draft.get(['metadata', 'ownerReferences'])).map((value, i) => { const owner = record(value); return <Summary key={i} label={text(owner.kind) || 'Owner'} value={owner.name} />; })}</EditorSection><Allocation /></>}
  </DraEditor>;
}
