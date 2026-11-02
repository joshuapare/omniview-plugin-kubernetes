import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorSection, ExactValueField, KeyValueFields, patchError, useFieldValidity } from '../../editor-controls';
import { definitions, parseField, publicMonitoringReference, ruleBranch, type Field } from './model';

export default function MonitoringForm(form:ResourceEditorFormProps) {
 const definition=definitions[form.context.kind];
 const locked=form.disabled || form.context.intent==='inspect' || form.context.ownership?.status!=='application';
 const scoped={...form,disabled:locked};
 return <div style={{display:'grid',gap:16,minWidth:0}}>{definition.consequence && <div role="note">{definition.consequence}</div>}{definition.fields.map(field=><DomainField key={field.key} form={scoped} field={field} parent={['spec']} />)}</div>;
}
function DomainField({form,field,parent}:{form:ResourceEditorFormProps;field:Field;parent:ResourceEditorPath}) {
 const path=field.key?[...parent,field.key]:parent;
 const value=form.draft.get(path);
 const validity=useFieldValidity(form);
 if(field.key==='annotations') return null;
 const id=JSON.stringify(path);
 const patch=(operations:ResourceEditorPatch[])=>{const error=patchError(form.patch({sessionID:form.draft.sessionID,expectedRevision:form.draft.revision,operations}));validity(id,error);return error;};
 const set=(value:unknown)=>patch([{op:'set',path,value}]);
 if(field.type==='rule') return <><EditorChoice label="Rule type" value={form.draft.has([...path,'record'])?'record':'alert'} disabled={form.disabled} options={[{value:'alert',label:'Alert'},{value:'record',label:'Recording rule'}]} onChange={branch=>patch(ruleBranch(path,branch).filter(op=>op.op!=='remove'||form.draft.has(op.path)))} /><DomainField form={form} field={{key:form.draft.has([...path,'record'])?'record':'alert',label:'Rule name'}} parent={path}/></>;
 if((field.key==='for'||field.key==='keep_firing_for') && form.draft.has([...parent,'record'])) return null;
 if(field.type==='map') return <EditorSection title={field.label}><KeyValueFields form={form} path={path} label={field.label}/></EditorSection>;
 if(field.type==='selector') return <EditorSection title={field.label}><EditorChoice label="Selection" help={field.help ?? 'Empty selector matches all objects. Expressions remain unchanged when labels change.'} value={value===undefined||value===null?'omitted':'configured'} options={[{value:'omitted',label:'Omitted / no objects'},{value:'configured',label:'Match labels and existing expressions'}]} disabled={form.disabled || (value!==null && value!==undefined && typeof value!=='object')} onChange={choice=>{if(choice==='omitted') patch([{op:'remove',path}]);else if(value===undefined||value===null)set({});}}/>{value!==null && value!==undefined && <KeyValueFields form={form} path={[...path,'matchLabels']} label={`${field.label} label`}/>}</EditorSection>;
 if(field.type==='array') {
  const rows=Array.isArray(value)?value:[];
  return <EditorSection title={field.label}>{rows.map((_,index)=><fieldset key={`${form.draft.sessionID}:${index}`} style={{border:'1px solid var(--ov-color-border-default)',padding:12,minWidth:0,display:'grid',gap:8}}><legend>{field.label} {index+1}</legend>{field.fields?.map(child=><DomainField key={child.key} form={form} field={child} parent={[...path,index]}/>)}<Button size="sm" variant="ghost" disabled={form.disabled} onClick={()=>patch([{op:'remove',path:[...path,index]}])}>Remove {field.label} {index+1}</Button></fieldset>)}<Button size="sm" disabled={form.disabled || (value!==undefined&&!Array.isArray(value))} onClick={()=>value===undefined?set([field.fields?.[0]?.key===''?'':{}]):patch([{op:'insert',path,index:rows.length,value:field.fields?.[0]?.key===''?'':{}}])}>Add {field.label}</Button></EditorSection>;
 }
 if(field.fields) return <details><summary>{field.label}</summary><div style={{display:'grid',gap:12,paddingTop:12}}>{field.fields.map(child=><DomainField key={child.key} form={form} field={child} parent={path}/>)}</div></details>;
 if(field.options) return <EditorChoice label={field.label} value={typeof value==='string'?value:''} disabled={form.disabled} options={[{value:'',label:'Not set'},...field.options.map(value=>({value,label:value}))]} onChange={next=>next?set(next):patch([{op:'remove',path}])}/>;
 const scalar=typeof value==='string'||typeof value==='number'||typeof value==='bigint';
 const reference=field.type==='url'||field.key==='url';
 const hidden=reference&&value!==undefined&&publicMonitoringReference(value,field.type!=='url')==='';
 return <ExactValueField label={field.label} help={reference?'Public HTTP(S) reference. Private or opaque stored references stay hidden and unchanged until replaced.':field.help} type="text" value={reference?publicMonitoringReference(value,field.type!=='url'):scalar?String(value):''} placeholder={hidden?'Stored reference unchanged':undefined} identity={`${form.draft.sessionID}:${id}`} disabled={form.disabled || (value!==undefined&&!scalar)} parse={text=>{if(!text)return {valid:true,value:''};const result=parseField(field,text);return result.error?{valid:false,error:result.error}:{valid:true,value:result.value as string|number};}} onCommit={next=>next===''?(hidden?null:patch([{op:'remove',path}])):set(next)} onValidityChange={error=>validity(id,error)}/>;
}
