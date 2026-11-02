import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { limitTypes, text } from './domain';
import { Advanced, Choice, CoreForm, Field, Repeat } from './fields';
export default function LimitRangeForm(form:ResourceEditorFormProps) {
  return <CoreForm form={form}><Repeat form={form} title="Limit policy" path={['spec','limits']} initial={{type:'Container'}}>{index => {
    const root=['spec','limits',index]; const type=text(form.draft,[...root,'type']);
    const resources=type==='PersistentVolumeClaim'?['storage']:['cpu','memory','ephemeral-storage'];
    const categories = ['min','max',...(['defaultRequest','default'].filter(category => type === 'Container' || Object.keys(form.draft.get([...root,category]) ?? {}).length > 0))];
    return <><Choice form={form} label={'Applies to '+(index+1)} path={[...root,'type']} options={limitTypes} optional={false} help="Defaults apply to new admissions, not existing Pods." />
      {categories.map(category => {
        const existing = form.draft.get([...root,category]);
        const keys = [...new Set([...resources,...(existing && typeof existing === 'object' ? Object.keys(existing) : [])])];
        return <fieldset key={category}><legend>{category==='min'?'Minimum':category==='max'?'Maximum':category==='defaultRequest'?'Default request':'Default limit'}</legend><div className="core-grid">{keys.map(resource => <Field key={resource} form={form} path={[...root,category,resource]} label={category+' '+resource+' '+(index+1)} kind="quantity" />)}</div></fieldset>;
      })}
      <Advanced>{resources.map(resource => <Field key={resource} form={form} path={[...root,'maxLimitRequestRatio',resource]} label={'Maximum limit/request ratio '+resource+' '+(index+1)} kind="quantity" />)}</Advanced></>;
  }}</Repeat></CoreForm>;
}
