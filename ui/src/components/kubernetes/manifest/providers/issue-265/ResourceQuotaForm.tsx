import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorSection } from '../../editor-controls';
import { quantityError, rows, scopes } from './domain';
import { Advanced, Choice, CoreForm, Field, MapFields, Repeat } from './fields';
export default function ResourceQuotaForm(form: ResourceEditorFormProps) {
  const hard = form.draft.get(['spec','hard']);
  const standard = ['requests.cpu','requests.memory','limits.cpu','limits.memory','requests.storage','pods','services','secrets','configmaps','persistentvolumeclaims'];
  const keys = [...new Set([...standard,...(hard && typeof hard === 'object' ? Object.keys(hard) : [])])];
  return <CoreForm form={form}><div role="note">Lower quotas can block new admissions; existing usage remains controller-owned.</div><EditorSection title="Namespace quota"><div className="core-grid">{keys.map(key => <Field key={key} form={form} label={key} path={['spec','hard',key]} kind="quantity" />)}</div></EditorSection>
    <Advanced><MapFields form={form} path={['spec','hard']} label="Custom quota limits" validateValue={quantityError}/><Repeat form={form} title="Scope" path={['spec','scopes']} initial="NotBestEffort">{index => <Choice form={form} label={'Scope '+(index+1)} path={['spec','scopes',index]} options={scopes} optional={false} />}</Repeat>
      <Repeat form={form} title="Scope expression" path={['spec','scopeSelector','matchExpressions']} initial={{scopeName:'PriorityClass',operator:'In',values:[]}}>{index => <><Choice form={form} label={'Scope name '+(index+1)} path={['spec','scopeSelector','matchExpressions',index,'scopeName']} options={scopes} optional={false}/><Choice form={form} label={'Scope operator '+(index+1)} path={['spec','scopeSelector','matchExpressions',index,'operator']} options={['In','NotIn','Exists','DoesNotExist']} optional={false}/>
      {(!['Exists','DoesNotExist'].includes(String(form.draft.get(['spec','scopeSelector','matchExpressions',index,'operator']))) || rows(form.draft,['spec','scopeSelector','matchExpressions',index,'values']).length > 0) && <Repeat form={form} title="Scope value" path={['spec','scopeSelector','matchExpressions',index,'values']} initial="">{n => <Field form={form} label={'Value '+(n+1)} path={['spec','scopeSelector','matchExpressions',index,'values',n]} required />}</Repeat>}</>}</Repeat>
    </Advanced></CoreForm>;
}
