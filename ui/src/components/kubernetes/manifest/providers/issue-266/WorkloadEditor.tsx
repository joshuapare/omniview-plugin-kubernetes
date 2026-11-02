import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { useEffect, useRef, useState } from 'react';
import { EditorChoice, EditorField, EditorHelp, EditorSection } from '../../editor-controls';
import { isKubernetesQuantity } from '../../manifestDraft';
import { appsReadOnly, containersPath, labelKey, labelValue, linkLabel, object, ownership, parseBudget, parseNonnegative, podPath, rollingPath, rows, selectorPath, strategyPatch, text, validateApps } from './model';
import OwnerInspection from './OwnerInspection';
import './apps.css';

type Buffer = { value: string; error: string; percent?: boolean; rollout?: boolean };

function WorkloadEditor(form: ResourceEditorFormProps) {
  const { context, draft, section, onValidityChange } = form;
  const daemon = context.kind === 'DaemonSet';
  const locked = form.disabled || appsReadOnly(draft, context);
  const editing = context.intent !== 'create';
  const [buffers, setBuffers] = useState<Record<string, Buffer>>({});
  const [patchError, setPatchError] = useState<string | null>(null);
  const [labelName, setLabelName] = useState('');
  const [labelContent, setLabelContent] = useState('');
  const [newContainer, setNewContainer] = useState({ name: '', image: '' });
  const [addingContainer, setAddingContainer] = useState(false);
  const [removingContainer, setRemovingContainer] = useState<number | null>(null);
  const rolloutCache = useRef<readonly ResourceEditorPatch[]>([]);
  const issue = validateApps(draft, context)[0]?.message;
  const localError = Object.values(buffers).find(buffer => !buffer.rollout || draft.get(['spec', 'updateStrategy', 'type']) !== 'OnDelete')?.error;
  useEffect(() => onValidityChange(localError ?? patchError ?? null), [localError, patchError, onValidityChange]);
  const commit = (operations: readonly ResourceEditorPatch[]): string | null => {
    if (locked) return 'This resource is read-only.';
    const result = form.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations });
    const error = result.status === 'accepted' ? null : 'Change was not accepted. Review source and current resource permissions.';
    setPatchError(error);
    return error;
  };
  const field = (label: string, path: ResourceEditorPath, options: { integer?: boolean; required?: boolean; linked?: boolean; disabled?: boolean; help?: string; validate?: (value: string) => boolean; error?: string } = {}) => {
    const id = JSON.stringify(path);
    const canonical = text(draft.get(path));
    return <EditorField key={id} label={label} value={buffers[id]?.value ?? canonical} disabled={locked || options.disabled} help={options.help} inputMode={options.integer ? 'numeric' : 'text'} error={buffers[id]?.error} onChange={value => {
      const parsed = options.integer && value !== '' ? parseNonnegative(value) : value;
      const error = options.required && !value.trim() ? 'Enter a value.' : parsed === null ? 'Use a whole number from 0 to 2147483647.' : options.validate && value !== '' && !options.validate(value) ? options.error ?? 'Enter a valid value.' : null;
      const failure = error ?? commit(options.linked ? linkLabel(String(path.at(-1)), value) : value === '' && !options.required ? [{ op: 'remove', path }] : [{ op: 'set', path, value: parsed }]);
      setBuffers(current => {
        const next = { ...current };
        if (failure) next[id] = { value, error: failure }; else delete next[id];
        return next;
      });
    }} />;
  };
  const budget = (name: 'maxUnavailable' | 'maxSurge', label: string) => {
    const path = [...rollingPath, name];
    const id = JSON.stringify(path);
    const raw = draft.get(path);
    const unit = buffers[id]?.percent ?? (typeof raw === 'string' && raw.endsWith('%'));
    const display = buffers[id]?.value ?? (unit ? text(raw).slice(0, -1) : text(raw));
    const update = (next: string, percent: boolean) => {
      const parsed = next === '' ? undefined : parseBudget(next, percent);
      const failure = parsed === null ? percent ? 'Use a whole percentage from 0 to 100.' : 'Use a whole count from 0 to 2147483647.' : commit(parsed === undefined ? [{ op: 'remove', path }] : [{ op: 'set', path, value: parsed }]);
      setBuffers(current => {
        const updated = { ...current };
        if (failure) updated[id] = { value: next, error: failure, percent, rollout: true }; else delete updated[id];
        return updated;
      });
    };
    return <div className="apps-budget" key={name}><EditorField label={label} value={display} inputMode="numeric" disabled={locked} error={buffers[id]?.error} placeholder={name === 'maxUnavailable' ? 'Default: 1' : 'Default: 0'} onChange={next => update(next, unit)} help="Exactly one rollout budget must be positive. Percentage counts round up; surge can temporarily double node resource use." /><EditorChoice label={`${label} unit`} value={unit ? 'percent' : 'count'} disabled={locked} options={[{ value: 'count', label: 'Pods (count)' }, { value: 'percent', label: 'Percent (%)' }]} onChange={next => update(display || '0', next === 'percent')} /></div>;
  };
  if (!daemon && (ownership(draft).state !== 'standalone' || (context.intent === 'edit' && context.ownership?.status !== 'application'))) return <OwnerInspection {...form} />;
  const containers = rows(draft.get(containersPath));
  const selector = object(draft.get(selectorPath));
  const strategy = text(draft.get(['spec', 'updateStrategy', 'type']));
  const selectorLocked = locked || editing;
  return <div className="apps-editor">
    {daemon && context.intent === 'edit' && context.ownership?.status !== 'application' && <div className="apps-notice">Application ownership is not confirmed. Editing stays locked.</div>}
    {patchError && <div role="alert" className="apps-notice">{patchError}</div>}
    {issue && !locked && <div role="alert" className="apps-notice">{issue}</div>}
    {(section === 'workload' || !['containers', 'placement', 'status'].includes(section)) && <>
      <EditorSection title={daemon ? 'Daemon scheduling' : 'Standalone replicas'}>
        {!daemon && <div className="apps-notice">Matching orphan Pods may be adopted. Reducing replicas may terminate Pods.</div>}
        <div className="apps-grid">
          {!daemon && field('Desired replicas', ['spec', 'replicas'], { integer: true, help: 'Omitted defaults to 1; zero stops all replicas. Check autoscaler and field ownership before saving.' })}
          {field('Minimum ready (seconds)', ['spec', 'minReadySeconds'], { integer: true, help: 'Time a Pod must remain ready before being considered available. Omitted defaults to 0.' })}
          {daemon && <EditorChoice label="Update strategy" value={strategy} disabled={locked} options={[{ value: '', label: 'Default (RollingUpdate)' }, { value: 'RollingUpdate', label: 'Rolling update' }, { value: 'OnDelete', label: 'On delete' }]} help="Rolling update replaces Pods progressively. On delete waits for explicit Pod deletion; this editor deletes no Pods." onChange={next => {
            const operations = strategyPatch(draft, next);
            if (!operations) { setPatchError('Advanced rolling-update fields retained. Change strategy in YAML.'); return; }
            if (next === 'OnDelete') rolloutCache.current = ['maxUnavailable', 'maxSurge'].flatMap(name => draft.has([...rollingPath, name]) ? [{ op: 'set' as const, path: [...rollingPath, name], value: draft.get([...rollingPath, name]) }] : []);
            commit(next !== 'OnDelete' && strategy === 'OnDelete' && !draft.has(rollingPath) ? [...operations, ...rolloutCache.current] : operations);
          }} />}
        </div>
        {daemon && strategy === 'OnDelete' && <div className="apps-notice">Existing Pods remain until explicitly deleted. No Pod deletion occurs here.</div>}
        {daemon && strategy !== 'OnDelete' && <div className="apps-grid">{budget('maxUnavailable', 'Maximum unavailable')}{budget('maxSurge', 'Maximum surge')}</div>}
        {!daemon && <div className="apps-notice">Template changes affect new Pods, not an automatic rollout of existing Pods.</div>}
      </EditorSection>
      <EditorSection title="Pod selector">
        <div className="apps-heading"><span>{editing ? 'Immutable after creation' : 'Selector values also set matching Pod labels'}</span><EditorHelp label="Pod selector">Every selector must match Pod-template labels. These are not resource metadata labels. Existing match expressions stay unchanged in YAML.</EditorHelp></div>
        {Object.keys(selector).map(key => <div className="apps-row" key={key}>{field(`Selector ${key}`, [...selectorPath, key], { disabled: editing, linked: true, validate: labelValue, error: 'Use a Kubernetes label value up to 63 characters.' })}<Button size="sm" variant="ghost" disabled={selectorLocked || !!localError} aria-label={`Remove selector ${key}`} onClick={() => commit([{ op: 'remove', path: [...selectorPath, key] }])}>Remove</Button></div>)}
        {rows(draft.get(['spec', 'selector', 'matchExpressions'])).length > 0 && <span>Advanced match expressions retained in YAML.</span>}
        {!editing && <div className="apps-grid"><EditorField label="New selector key" value={labelName} disabled={locked} onChange={setLabelName} error={labelName && (!labelKey(labelName) || Object.hasOwn(selector, labelName)) ? 'Use a valid, unique label key.' : null} /><EditorField label="New selector value" value={labelContent} disabled={locked} onChange={setLabelContent} error={!labelValue(labelContent) ? 'Use a Kubernetes label value.' : null} /><Button size="sm" disabled={locked || !labelKey(labelName) || !labelValue(labelContent) || Object.hasOwn(selector, labelName)} onClick={() => { if (!commit(linkLabel(labelName, labelContent))) { setLabelName(''); setLabelContent(''); } }}>Add selector</Button></div>}
      </EditorSection>
      {daemon && <details><summary>Revision history</summary>{field('Revision history limit', ['spec', 'revisionHistoryLimit'], { integer: true, help: 'Omitted defaults to 10. Zero retains no old history and can remove rollback options.' })}</details>}
    </>}
    {section === 'containers' && <EditorSection title="Pod containers">
      {containers.map((raw, index) => { const container = object(raw); return <div className="apps-card" key={`${draft.sessionID}:${index}`}><div className="apps-grid">
        {field(`Container ${index + 1} name`, [...containersPath, index, 'name'], { required: true, validate: value => value.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(value) && !containers.some((other, otherIndex) => otherIndex !== index && object(other).name === value), error: 'Use a unique container DNS label.' })}
        {field(`Container ${index + 1} image`, [...containersPath, index, 'image'], { required: true, help: 'Image reference only. Updating a DaemonSet can replace Pods; a ReplicaSet template change does not roll existing Pods.' })}
      </div><details><summary>Resource requests and limits</summary><div className="apps-grid">{(['requests', 'limits'] as const).flatMap(group => (['cpu', 'memory'] as const).map(resource => field(`Container ${index + 1} ${resource} ${group}`, [...containersPath, index, 'resources', group, resource], { validate: isKubernetesQuantity, error: 'Use a nonnegative Kubernetes quantity.', help: resource === 'cpu' ? 'CPU cores; m means millicores.' : 'Memory bytes; Mi and Gi are binary units.' })))}</div></details><Button size="sm" variant="ghost" disabled={locked || containers.length <= 1 || !!localError} aria-label={`Remove container ${index + 1}`} onClick={() => setRemovingContainer(index)}>Remove container</Button>
      {removingContainer === index && <div className="apps-notice" role="group" aria-label="Confirm container removal"><span>Removing this container can replace existing Pods.</span><Button size="sm" disabled={locked || !!localError} onClick={() => { if (!commit([{ op: 'remove', path: [...containersPath, index] }])) setRemovingContainer(null); }}>Confirm removal</Button><Button size="sm" variant="ghost" onClick={() => setRemovingContainer(null)}>Keep container</Button></div>}
      {Object.keys(container).some(key => !['name', 'image', 'resources'].includes(key)) && <span className="apps-muted">Other container fields retained in source.</span>}</div>; })}
      {!addingContainer && <Button size="sm" variant="ghost" disabled={locked} onClick={() => setAddingContainer(true)}>Add container</Button>}
      {addingContainer && <div className="apps-card"><div className="apps-grid"><EditorField label="New container name" value={newContainer.name} disabled={locked} onChange={name => setNewContainer(current => ({ ...current, name }))} /><EditorField label="New container image" value={newContainer.image} disabled={locked} onChange={image => setNewContainer(current => ({ ...current, image }))} /></div><Button size="sm" disabled={locked || newContainer.name.length > 63 || !/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(newContainer.name) || containers.some(raw => object(raw).name === newContainer.name) || !newContainer.image.trim()} onClick={() => {
        const operation: ResourceEditorPatch = draft.has(containersPath) ? { op: 'insert', path: containersPath, index: containers.length, value: newContainer } : { op: 'set', path: containersPath, value: [newContainer] };
        if (!commit([operation])) { setNewContainer({ name: '', image: '' }); setAddingContainer(false); }
      }}>Add</Button><Button size="sm" variant="ghost" onClick={() => setAddingContainer(false)}>Cancel</Button></div>}
    </EditorSection>}
    {section === 'placement' && <EditorSection title="Placement"><div className="apps-grid"><EditorChoice label="Node operating system" value={text(draft.get([...podPath, 'nodeSelector', 'kubernetes.io/os']))} disabled={locked} options={[{ value: '', label: 'No OS constraint' }, { value: 'linux', label: 'Linux' }, { value: 'windows', label: 'Windows' }]} onChange={value => commit(value ? [{ op: 'set', path: [...podPath, 'nodeSelector', 'kubernetes.io/os'], value }] : [{ op: 'remove', path: [...podPath, 'nodeSelector', 'kubernetes.io/os'] }])} help="Restricts eligible nodes without modifying other node selectors, affinity or tolerations. No nodes are changed." /></div><details><summary>Advanced Pod configuration</summary><span className="apps-muted">Use shared YAML for affinity, tolerations, volumes, probes and environment. Unedited fields remain intact.</span></details></EditorSection>}
    {section === 'status' && <EditorSection title="Observed status"><div className="apps-grid">{(daemon ? [['Desired nodes', 'desiredNumberScheduled'], ['Scheduled nodes', 'currentNumberScheduled'], ['Ready', 'numberReady'], ['Available', 'numberAvailable'], ['Updated', 'updatedNumberScheduled'], ['Misscheduled', 'numberMisscheduled']] : [['Current replicas', 'replicas'], ['Ready', 'readyReplicas'], ['Available', 'availableReplicas'], ['Fully labeled', 'fullyLabeledReplicas']]).map(([label, key]) => <div key={key}><span className="apps-muted">{label}</span><strong>{text(draft.get(['status', key])) || 'Not reported'}</strong></div>)}</div><span className="apps-muted">Observed values may be stale. Status cannot be edited.</span></EditorSection>}
  </div>;
}
export function DaemonSetEditor(props: ResourceEditorFormProps) { return <WorkloadEditor key={props.draft.sessionID} {...props} />; }
export function ReplicaSetEditor(props: ResourceEditorFormProps) { return <WorkloadEditor key={props.draft.sessionID} {...props} />; }
