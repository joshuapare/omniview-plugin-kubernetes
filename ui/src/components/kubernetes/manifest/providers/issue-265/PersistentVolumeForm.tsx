import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { accessModes, text } from './domain';
import { EditorHelp, EditorSection } from '../../editor-controls';
import { compareQuantity, quantity } from '../../manifestDraft';
import { Advanced, Choice, CoreForm, Field, ReferenceField, Repeat } from './fields';
export default function PersistentVolumeForm(form:ResourceEditorFormProps) {
  const editing=form.context.intent!=='create';
  const baselineCapacity = form.baseline ? quantity(form.baseline.get(['spec','capacity','storage'])) : null;
  return <CoreForm form={form} confirm="I am an administrator authoring a static NFS volume."><EditorSection title="Static storage">
    {editing && <div role="note">Class and access changes affect binding; capacity edits do not resize storage.</div>}
    <div className="core-grid"><Field form={form} label="Capacity" path={['spec','capacity','storage']} kind="quantity" required disabled={editing && !baselineCapacity} validate={value => {
      const parsed = quantity(value);
      if (!parsed || parsed.coefficient <= 0n) return 'Enter a positive storage quantity.';
      return editing && baselineCapacity && compareQuantity(parsed,baselineCapacity) < 0 ? 'Capacity cannot decrease in this editor.' : null;
    }} /><ReferenceField form={form} label="Storage class" path={['spec','storageClassName']} query={{group:'storage.k8s.io',version:'v1',resource:'storageclasses',projection:'storageClass'}} optional /></div>
    <Repeat form={form} title="Access mode" path={['spec','accessModes']} initial="ReadWriteOnce">{index => <Choice form={form} label={'Access mode '+(index+1)} path={['spec','accessModes',index]} options={accessModes} optional={false}/>}</Repeat>
    <Choice form={form} label="Volume mode" path={['spec','volumeMode']} options={['Filesystem']} disabled={editing} help="NFS supports Filesystem only. Existing volume mode is immutable." />
    <Choice form={form} label="Reclaim policy" path={['spec','persistentVolumeReclaimPolicy']} options={['Retain','Delete']} />
    {text(form.draft,['spec','persistentVolumeReclaimPolicy'])==='Delete' && <div role="alert">Delete may permanently remove backing storage.</div>}
    </EditorSection><EditorSection title="NFS source"><Field form={form} label="NFS server" path={['spec','nfs','server']} required disabled={editing}/><Field form={form} label="Export path" path={['spec','nfs','path']} required disabled={editing} validate={value => value.startsWith('/')?null:'Enter an absolute export path.'}/><Choice form={form} label="Read only" path={['spec','nfs','readOnly']} options={['true','false']} boolean disabled={editing}/></EditorSection>
    <Advanced><EditorHelp label="Storage ownership">Provisioned or bound volumes are inspection-only. This form never changes claimRef, source, node affinity or driver identity.</EditorHelp><Repeat form={form} title="Mount option" path={['spec','mountOptions']} initial="">{index => <Field form={form} label={'Mount option '+(index+1)} path={['spec','mountOptions',index]} required sensitive help="Stored options stay hidden; entering a value replaces this option." />}</Repeat></Advanced></CoreForm>;
}
