import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { useEffect, useRef, useState } from 'react';

import { EditorChoice, EditorField, EditorHelp, EditorSection, ReferencePicker, scalarText } from '../../editor-controls';

import { BufferedField } from './formState';
import { controllerLookup, controllerPath, dnsLabel, dnsSubdomain, integer, pathSegment, podGroupsPath, policyChanges, record, schedulingReadOnly, validateWorkload } from './model';
import { useSchedulingForm } from './useSchedulingForm';
import './scheduling.css';

export default function WorkloadForm(form: ResourceEditorFormProps) {
  return <WorkloadSession key={form.draft.sessionID} {...form} />;
}

function WorkloadSession(form: ResourceEditorFormProps) {
  const state = useSchedulingForm(form);
  const { report } = state;
  const { draft, context } = form;
  const groupsValue = draft.get(podGroupsPath);
  const groups = Array.isArray(groupsValue) ? groupsValue : [];
  const groupsLocked = state.locked || context.intent !== 'create';
  const gangAvailable = context.discovery.features.GangScheduling !== 'absent';
  const [minimums, setMinimums] = useState<Record<string, number>>({});
  const [rowIDs, setRowIDs] = useState(() => groups.map((_, index) => `initial-${index}`));
  const nextRowID = useRef(0);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const newNameError = !dnsLabel(newName) ? 'Enter a DNS label (up to 63 characters).' : groups.some(group => record(group) && group.name === newName) ? 'Pod-group names must be unique.' : null;
  useEffect(() => report('new-group', adding ? 'Add the pending pod group or cancel it.' : null), [adding, report]);
  const issues = validateWorkload(draft, context);
  const readonly = schedulingReadOnly(draft, context);
  return <div className="scheduling-editor" key={draft.sessionID}>
    {state.error && <p role="alert">{state.error}</p>}
    {readonly && <p role="status">Inspection only: controller, system or unconfirmed application ownership.</p>}
    <EditorSection title={`Pod groups · ${groups.length}/8`}>
      <EditorHelp label="Pod groups">Embedded groups are not standalone resources. Basic schedules Pods independently. Gang waits for its minimum count; API availability does not prove scheduler support.</EditorHelp>
      {groups.map((group, index) => {
        if (!record(group)) return null;
        const path = [...podGroupsPath, index];
        const rowID = rowIDs[index] ?? `source-${index}`;
        const gang = record(group.policy) && record(group.policy.gang) ? group.policy.gang : undefined;
        return <div className="scheduling-group" key={rowID}>
          <div className="scheduling-grid">
            <BufferedField key={`${draft.sessionID}:${rowID}:name`} fieldKey={`group-${rowID}-name`} label={`Group ${index + 1} name`} value={scalarText(group.name)} disabled={groupsLocked} report={state.report}
              validate={text => !dnsLabel(text) ? 'Enter a DNS label (up to 63 characters).' : groups.some((other, otherIndex) => otherIndex !== index && record(other) && other.name === text) ? 'Pod-group names must be unique.' : null}
              onCommit={text => state.apply([{ op: 'set', path: [...path, 'name'], value: text }])} />
            <EditorChoice label={`Group ${index + 1} policy`} value={gang ? 'gang' : 'basic'} disabled={groupsLocked}
              options={[{ value: 'basic', label: 'Basic · independent scheduling' }, ...(gangAvailable || gang ? [{ value: 'gang', label: 'Gang · all or nothing' }] : [])]}
              onChange={value => {
                if (value === 'gang' && !gangAvailable) return;
                if (gang) setMinimums(current => ({ ...current, [rowID]: Number(gang.minCount) }));
                state.apply(policyChanges(index, value === 'gang' ? 'gang' : 'basic', minimums[rowID] ?? 1, draft));
              }} />
            {gang && <BufferedField key={`${draft.sessionID}:${rowID}:min`} fieldKey={`group-${rowID}-min`} label={`Group ${index + 1} minimum Pods`} value={scalarText(gang.minCount)} disabled={groupsLocked || !gangAvailable} inputMode="numeric" report={state.report}
              help="Positive 32-bit count. The scheduler must support GangScheduling. No scheduler success is implied."
              validate={text => integer(text, 1, 2147483647) === null ? 'Enter an integer from 1 to 2147483647 Pods.' : null}
              onCommit={text => state.apply([{ op: 'set', path: [...path, 'policy', 'gang', 'minCount'], value: integer(text, 1, 2147483647)! }])} />}
          </div>
          <Button size="sm" variant="ghost" disabled={groupsLocked} aria-label={`Remove pod group ${index + 1}`} onClick={() => {
            if (!state.apply([{ op: 'remove', path }])) setRowIDs(current => current.filter((_, rowIndex) => rowIndex !== index));
          }}>Remove group</Button>
        </div>;
      })}
      {!groups.length && <p role="status">Add at least one pod group.</p>}
      {context.discovery.features.GangScheduling !== 'available' && <p role="status">{gangAvailable ? 'Gang scheduler support is unconfirmed; API acceptance does not guarantee gang behavior.' : 'GangScheduling is confirmed disabled. Basic policy remains available.'}</p>}
      {issues.map(issue => <p role="alert" key={JSON.stringify(issue.path)}>{issue.message}</p>)}
      {context.intent !== 'create' && <p className="scheduling-note">Pod groups and policies are immutable after creation.</p>}
      {groups.some(group => record(group) && record(group.policy) && group.policy.gang !== undefined) && <p className="scheduling-consequence">Gang groups wait for their minimum schedulable Pod count.</p>}
      {adding ? <div className="scheduling-group">
        <EditorField label="New pod group name" value={newName} onChange={setNewName} error={newName ? newNameError : null} disabled={groupsLocked} />
        <div className="scheduling-actions"><Button size="sm" disabled={groupsLocked || !!newNameError} onClick={() => {
          const operation = groupsValue === undefined ? { op: 'set' as const, path: podGroupsPath, value: [{ name: newName, policy: { basic: {} } }] } : { op: 'insert' as const, path: podGroupsPath, index: groups.length, value: { name: newName, policy: { basic: {} } } };
          if (!state.apply([operation])) {
            const id = `added-${nextRowID.current++}`;
            setRowIDs(current => [...current, id]);
            setAdding(false);
            setNewName('');
          }
        }}>Add basic group</Button><Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(''); }}>Cancel group</Button></div>
      </div> : <Button size="sm" disabled={groupsLocked || groups.length >= 8} onClick={() => setAdding(true)}>Add pod group</Button>}
    </EditorSection>
    <details className="scheduling-advanced"><summary>Controller reference</summary><ControllerReference form={form} locked={state.locked} report={state.report} apply={state.apply} /></details>
  </div>;
}

function ControllerReference({ form, locked, report, apply }: {
  form: ResourceEditorFormProps;
  locked: boolean;
  report: (key: string, message: string | null) => void;
  apply: (operations: readonly ResourceEditorPatch[]) => string | null;
}) {
  const ref = form.draft.get(controllerPath);
  const original = record(ref) ? ref : {};
  const [pending, setPending] = useState({ group: scalarText(original.apiGroup), kind: scalarText(original.kind), name: scalarText(original.name) });
  const [active, setActive] = useState(false);
  const immutable = locked || form.context.intent !== 'create' && (form.baseline ? form.baseline.has(controllerPath) : form.draft.has(controllerPath));
  const error = !pathSegment(pending.kind) || !pathSegment(pending.name) || pending.group !== '' && !dnsSubdomain(pending.group) ? 'Enter a valid API group, kind and object name.' : null;
  useEffect(() => report('controller', active ? 'Set the pending controller reference or cancel it.' : null), [active, report]);
  const value = active ? pending : { group: scalarText(original.apiGroup), kind: scalarText(original.kind), name: scalarText(original.name) };
  const query = controllerLookup(value.group, value.kind);
  const nameField = { label: 'Controller object name', value: value.name, disabled: immutable, help: 'Same-namespace reference. This link is not metadata.ownerReferences and creates no controller.', onChange: (name: string) => { setPending({ ...value, name }); setActive(true); } };
  return <div className="scheduling-editor">
    <EditorHelp label="Controller reference">Optional same-namespace typed link to an originating workload. It can be set once, including on an existing Workload that has no reference. It cannot change once set.</EditorHelp>
    <div className="scheduling-grid">
      <EditorField label="Controller API group" value={value.group} disabled={immutable} placeholder="Empty for core API" onChange={group => { setPending({ ...value, group }); setActive(true); }} />
      <EditorField label="Controller kind" value={value.kind} disabled={immutable} onChange={kind => { setPending({ ...value, kind }); setActive(true); }} />
      {query && !immutable ? <ReferencePicker {...nameField} form={form} query={{ ...query, namespace: form.context.namespace, projection: 'metadata' }} /> : <EditorField {...nameField} />}
    </div>
    {immutable && form.draft.has(controllerPath) && <p className="scheduling-note">Controller reference is immutable once set.</p>}
    {active && <><p role="status">{error ?? 'Reference ready to set. Unresolved names remain valid.'}</p><div className="scheduling-actions">
      <Button size="sm" disabled={immutable || !!error} onClick={() => {
        const operations = [
          { op: 'set' as const, path: [...controllerPath, 'kind'], value: pending.kind },
          { op: 'set' as const, path: [...controllerPath, 'name'], value: pending.name },
          ...(pending.group ? [{ op: 'set' as const, path: [...controllerPath, 'apiGroup'], value: pending.group }] : form.draft.has([...controllerPath, 'apiGroup']) ? [{ op: 'remove' as const, path: [...controllerPath, 'apiGroup'] }] : []),
        ];
        if (!apply(operations)) setActive(false);
      }}>Set reference</Button>
      <Button size="sm" variant="ghost" onClick={() => setActive(false)}>Cancel reference</Button>
    </div></>}
    {form.context.intent === 'create' && form.draft.has(controllerPath) && <Button size="sm" variant="ghost" disabled={immutable} onClick={() => { if (!apply([{ op: 'remove', path: controllerPath }])) setActive(false); }}>Remove reference</Button>}
  </div>;
}
