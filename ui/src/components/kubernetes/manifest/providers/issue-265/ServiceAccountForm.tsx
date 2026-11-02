import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorHelp, EditorSection } from '../../editor-controls';
import { Choice, CoreForm, ReferenceField, Repeat } from './fields';
export default function ServiceAccountForm(form: ResourceEditorFormProps) {
  return <CoreForm form={form}><EditorSection title="Pod identity"><Choice form={form} label="Mount API credentials" path={['automountServiceAccountToken']} options={['true','false']} boolean help="Pods can override this setting. No token or credential Secret is created." /></EditorSection>
    <Repeat form={form} title="Image pull Secret" path={['imagePullSecrets']} initial={{name:''}}>{index => <ReferenceField form={form} path={['imagePullSecrets',index,'name']} query={{group:'',version:'v1',resource:'secrets',namespace:form.context.namespace,projection:'secretType'}} label={'Secret name '+(index+1)} />}</Repeat>
    <EditorHelp label="Token issuance">Short-lived token issuance uses the dedicated TokenRequest workflow. Legacy secrets links remain untouched.</EditorHelp>
  </CoreForm>;
}
