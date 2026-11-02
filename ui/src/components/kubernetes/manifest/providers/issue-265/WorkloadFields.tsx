import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { Advanced, CoreForm, Field, MapFields, Repeat, Choice, ReferenceField } from './fields';
import { EditorHelp } from '../../editor-controls';
export function WorkloadFields({form,root}:{form:ResourceEditorFormProps;root:ResourceEditorPath}) {
  return <><MapFields form={form} path={[...root,'metadata','labels']} label="Pod template labels" />
    <Repeat form={form} title="Container" path={[...root,'spec','containers']} initial={{name:'',image:''}}>{index => <><div className="core-grid"><Field form={form} label={'Container name '+(index+1)} path={[...root,'spec','containers',index,'name']} required validate={name => /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)&&name.length<=63?null:'Use a DNS label.'} /><Field form={form} label={'Container image '+(index+1)} path={[...root,'spec','containers',index,'image']} required /></div>
    <Advanced>{['requests','limits'].map(category => <div key={category} className="core-grid">{['cpu','memory','ephemeral-storage'].map(resource => <Field key={resource} form={form} label={category+' '+resource+' '+(index+1)} path={[...root,'spec','containers',index,'resources',category,resource]} kind="quantity" />)}</div>)}<Choice form={form} label={'Image pull policy '+(index+1)} path={[...root,'spec','containers',index,'imagePullPolicy']} options={['Always','IfNotPresent','Never']} /></Advanced></>}</Repeat>
    <Advanced><ReferenceField form={form} label="Service account" path={[...root,'spec','serviceAccountName']} query={{group:'',version:'v1',resource:'serviceaccounts',namespace:form.context.namespace,projection:'metadata'}} optional /><MapFields form={form} label="Node selector" path={[...root,'spec','nodeSelector']} /><Choice form={form} label="Mount API credentials" path={[...root,'spec','automountServiceAccountToken']} options={['true','false']} boolean /></Advanced></>;
}
export function PodTemplateForm(form:ResourceEditorFormProps) {
  return <CoreForm form={form}><EditorHelp label="Template lifecycle">Stores a Pod template only. Saving does not create a Pod or controller.</EditorHelp><WorkloadFields form={form} root={['template']} /></CoreForm>;
}
export function ReplicationControllerForm(form:ResourceEditorFormProps) {
  return <CoreForm form={form} confirm="I am authoring a standalone legacy ReplicationController."><div role="note">Changing replicas can create or terminate Pods.</div><Field form={form} label="Replicas" path={['spec','replicas']} kind="integer" /><MapFields form={form} label="Pod selector" path={['spec','selector']} /><WorkloadFields form={form} root={['spec','template']} /></CoreForm>;
}
