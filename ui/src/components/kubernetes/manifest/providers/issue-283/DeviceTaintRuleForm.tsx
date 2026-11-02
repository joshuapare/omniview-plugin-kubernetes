import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorSection } from '../../editor-controls';
import { classNameError, dnsLabel, labelKeyError, labelValueError, record, rows, text } from './model';
import { DraEditor, DraftChoice, DraftField, Notice, Summary, useDra } from './shared';

function Target() {
  const { form, locked, commit } = useDra();
  const path = ['spec', 'deviceSelector'] as const;
  const selector = record(form.draft.get(path));
  const present = form.draft.has(path);
  const target = !present ? 'none' : Object.keys(selector).length ? 'selected' : 'all';
  const setTarget = (value: string) => {
    const operations: ResourceEditorPatch[] = [];
    if (value === 'none') operations.push({ op: 'remove', path });
    else if (!present) operations.push({ op: 'set', path, value: value === 'selected' ? { driver: '' } : {} });
    else if (value === 'all') for (const key of ['driver', 'pool', 'device']) { if (form.draft.has([...path, key])) operations.push({ op: 'remove', path: [...path, key] }); }
    else if (target === 'all') operations.push({ op: 'set', path: [...path, 'driver'], value: '' });
    if (operations.length) commit(operations);
  };
  return <EditorSection title="Affected devices"><EditorChoice label="Target" value={target} onChange={setTarget} disabled={locked} options={[{ value: 'none', label: 'No devices (selector omitted)' }, { value: 'selected', label: 'Match driver, pool or device' }, { value: 'all', label: 'All devices (empty selector)' }]} help="Omitted selector matches no devices. Empty selector matches every device in the cluster." />
    {target === 'all' && <Notice error>Targets every device in the cluster.</Notice>}
    {target === 'selected' && <div className="dra-grid"><DraftField label="Driver" path={[...path, 'driver']} validate={value => value.length > 63 ? 'Driver name exceeds 63 characters.' : classNameError(value)} help="Optional exact DRA driver name. All specified target fields must match." /><DraftField label="Pool" path={[...path, 'pool']} validate={value => value.length > 253 || value.split('/').some(part => classNameError(part)) ? 'Enter a slash-separated DNS pool name.' : null} /><DraftField label="Device" path={[...path, 'device']} validate={dnsLabel} /></div>}
  </EditorSection>;
}
export default function DeviceTaintRuleForm(form: ResourceEditorFormProps) {
  const features = form.context.discovery.features;
  const enabled = features.DRADeviceTaints === 'available' && features.DRADeviceTaintRules === 'available';
  const locked = !enabled || form.context.intent === 'inspect' || form.context.ownership?.status === 'controller' || form.context.ownership?.status === 'system';
  const effect = text(form.draft.get(['spec', 'taint', 'effect']));
  return <DraEditor form={form} locked={locked}>
    {!enabled && <Notice>Alpha authoring unavailable. DRADeviceTaints: {features.DRADeviceTaints ?? 'unknown'}; DRADeviceTaintRules: {features.DRADeviceTaintRules ?? 'unknown'}.</Notice>}
    {effect === 'NoExecute' && <Notice error>NoExecute can evict running Pods that do not tolerate this device taint.</Notice>}
    {form.section === 'policy' && <><Target /><EditorSection title="Device taint"><div className="dra-grid"><DraftField label="Taint key" path={['spec', 'taint', 'key']} required validate={labelKeyError} /><DraftField label="Taint value" path={['spec', 'taint', 'value']} validate={labelValueError} /><DraftChoice label="Effect" path={['spec', 'taint', 'effect']} options={[{ value: 'None', label: 'Informational only' }, { value: 'NoSchedule', label: 'Block new scheduling' }, { value: 'NoExecute', label: 'Evict untolerated consumers' }]} /></div></EditorSection></>}
    {form.section === 'status' && <EditorSection title="Controller status"><Summary label="Taint added" value={form.draft.get(['spec', 'taint', 'timeAdded'])} />{rows(form.draft.get(['status', 'conditions'])).map((item, i) => { const condition = record(item); return <div className="dra-card" key={i}><Summary label="Condition" value={condition.type} /><Summary label="Status" value={condition.status} /><Summary label="Reason" value={condition.reason} /><Summary label="Observed generation" value={condition.observedGeneration} /></div>; })}{!rows(form.draft.get(['status', 'conditions'])).length && <Notice>No controller condition recorded. Rule presence does not prove eviction support.</Notice>}</EditorSection>}
  </DraEditor>;
}
