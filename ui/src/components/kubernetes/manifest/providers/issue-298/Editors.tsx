import { useEffect, useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection, ExactValueField, patchFields, patchError, scalarText, useFieldValidity } from '../../editor-controls';
import { designs, entryReadOnly, type Field, type Path } from './domain';

function DomainField({ form, field, path, report }: {form: ResourceEditorFormProps; field: Field; path: Path; report:(key:string,error:string|null)=>void}) {
 const key=JSON.stringify(path);
 const value=form.draft.get(path);
 const [error,setError]=useState<string|null>(null);
 const [json,setJson]=useState('');
 useEffect(()=>()=>report(key,null),[key,report]);
 const commit=(next: unknown)=>{
  const result=patchFields(form,[next === '' ? {op:'remove',path} : {op:'set',path,value:next}]);
  const failure=patchError(result);setError(failure);report(key,failure);return failure;
 };
 if(field.path.join('.')==='http.0.timeout') return <ExactValueField label={field.label} help={field.help} disabled={form.disabled} identity={`${form.draft.sessionID}:${key}`} value={scalarText(value)} parse={text=>text===''||/^\d+(?:\.\d+)?(?:ms|s|m|h)$/.test(text)?{valid:true,value:text}:{valid:false,error:'Enter a duration with units, such as 5s.'}} onCommit={commit} onValidityChange={failure=>report(key,failure)}/>;
 if(field.number) return <ExactValueField label={field.label} disabled={form.disabled} help={field.help} identity={`${form.draft.sessionID}:${key}`} value={scalarText(value)} inputMode="numeric" parse={text=>{
  if(text==='') return {valid:true,value:''};
  if(!/^\d+$/.test(text)) return {valid:false,error:'Enter a nonnegative whole number.'};
  const n=BigInt(text);if(n>BigInt(field.max??2147483647) || (field.max===65535 && n===0n)) return {valid:false,error:field.max===65535?'Use port 1–65535.':'Value exceeds the supported range.'};
  return {valid:true,value:n};
 }} onCommit={commit} onValidityChange={failure=>report(key,failure)}/>;
 if(field.options) return <EditorChoice label={field.label} value={scalarText(value)} disabled={form.disabled} options={[{value:'',label:'Not set'},...field.options.map(value=>({value,label:value}))]} onChange={commit} error={error} help={field.help}/>;
 if(field.path.join('.')==='patch.value') return <EditorField label={field.label} value={json} disabled={form.disabled} error={error} type="password" help="Existing values stay masked. Enter a new JSON object to replace this patch value; source retains untouched content." onChange={text=>{
  setJson(text);
  try {
   const parsed:unknown=JSON.parse(text);
   const safe=(v:unknown):boolean=> typeof v==='number'?Number.isSafeInteger(v):Array.isArray(v)?v.every(safe):v!==null&&typeof v==='object'?Object.values(v).every(safe):true;
   if(!parsed || Array.isArray(parsed) || typeof parsed!=='object' || !safe(parsed)) throw new Error();
   commit(parsed);
  } catch {setError('Enter a JSON object with exact integer values.');report(key,'Enter a valid patch value.');}
 }}/>;
 return <EditorField label={field.label} type={field.path[0]==='environmentVariables'?'password':'text'} value={scalarText(value)} disabled={form.disabled} error={error} help={field.help} onChange={commit}/>;
}
function IstioEditor(props: ResourceEditorFormProps) {
 const design=designs[props.context.kind];
 const report=useFieldValidity(props);
 const locked=props.context.kind==='WorkloadEntry' && entryReadOnly(props.draft,props.context);
 const form={...props,disabled:props.disabled||locked};
 const [failure,setFailure]=useState<string|null>(null);
 const [compatibility,setCompatibility]=useState(false);
 useEffect(()=>{report('compatibility',props.context.kind==='EnvoyFilter'&&!compatibility?'Confirm installed proxy compatibility before review.':null);},[props.context.kind,compatibility,report]);
 const mutate=(operations:Parameters<typeof patchFields>[1])=>{const error=patchError(patchFields(form,operations));setFailure(error);report('rows',error);};
 return <div style={{display:'grid',gap:12,minWidth:0}}>
 {locked&&<p role="status">Registered or unverified WorkloadEntry: inspect only.</p>}
 {design.consequence&&<p role="note">{design.consequence}</p>}
 {failure&&<p role="alert">{failure}</p>}
 {props.context.kind==='EnvoyFilter'&&<label><input type="checkbox" checked={compatibility} disabled={props.disabled} onChange={event=>setCompatibility(event.target.checked)}/>I reviewed compatibility with the installed Istio and Envoy versions</label>}
 <EditorSection title={props.context.kind==='Gateway'?'Istio gateway workload':props.context.kind}>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,240px),1fr))',gap:12}}>
 {design.fields.map(field=><DomainField key={JSON.stringify(field.path)} form={form} field={field} path={['spec',...field.path]} report={report}/>)}</div>
 </EditorSection>
 {design.rows?.map(row=>{
 const path:Path=['spec',...row.path];const current=props.draft.get(path);const rows=Array.isArray(current)?current:[];
 return <EditorSection key={row.title} title={row.title}>
 {rows.map((_,i)=><fieldset key={`${props.draft.sessionID}:${i}`} style={{border:'1px solid var(--ov-color-border-default)',borderRadius:6,padding:12,marginBottom:8,minWidth:0}}><legend>{row.title} {i+1}</legend>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:10}}>{row.fields.filter(field=>{
 if(props.context.kind!=='Gateway'||field.path[0]!=='tls')return true;
 const protocol=props.draft.get([...path,i,'port','protocol']);return protocol==='HTTPS'||protocol==='TLS';
 }).map(field=><DomainField key={JSON.stringify(field.path)} form={form} field={field} path={[...path,i,...field.path]} report={report}/>)}</div>
 <Button size="sm" disabled={form.disabled} onClick={()=>mutate([{op:'remove',path:[...path,i]}])}>Remove {row.title.toLowerCase()} {i+1}</Button></fieldset>)}
 <Button size="sm" disabled={form.disabled} onClick={()=>mutate(Array.isArray(current)?[{op:'insert',path,index:rows.length,value:row.fields[0]?.path.length?{}:''}]:[{op:'set',path,value:[row.fields[0]?.path.length?{}:'']}])}>Add {row.title.toLowerCase()}</Button>
 </EditorSection>;
 })}
 </div>;
}
export const VirtualService=IstioEditor;
export const DestinationRule=IstioEditor;
export const Gateway=IstioEditor;
export const ServiceEntry=IstioEditor;
export const Sidecar=IstioEditor;
export const WorkloadGroup=IstioEditor;
export const ProxyConfig=IstioEditor;
export const WorkloadEntry=IstioEditor;
export const EnvoyFilter=IstioEditor;
