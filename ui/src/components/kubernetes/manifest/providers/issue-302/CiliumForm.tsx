import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useEffect, useState } from 'react';

import { EditorChoice, EditorField, EditorHelp, EditorSection, ExactValueField, KeyValueFields, parseExactInteger, useFieldValidity } from '../../editor-controls';

import { choices, designs, isBoolean, isInteger, isList, isReadOnly, pathOf } from './domain';
import { parseCiliumInteger } from './validation';
const labelOf = (name: string) => name.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./, c => c.toUpperCase());
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value) : '';

export default function CiliumForm(props: ResourceEditorFormProps) {
 const design = designs.find(item => item.kind === props.context.kind)!;
 const readOnly = isReadOnly(design,props.draft,props.context);
 const report = useFieldValidity(props);
 return <div style={{fontSize:13,display:'grid',gap:16,minWidth:0}}>
 {readOnly && <span role="note">{design.inspect ? 'Controller-managed state. No resource or status writes.' : 'Authoring locked by ownership or field immutability.'}</span>}
 {!design.inspect && <EditorHelp label="Network consequences">Changes can interrupt connectivity, change address allocation or withdraw routes. CRD presence does not confirm feature support. Review administrator configuration before submission.</EditorHelp>}
 <DomainFields {...props} field="" path={[]} paths={design.fields.filter(field=>!design.kind.includes('EnvoyConfig') || !field.startsWith('resources.')).map(field=>pathOf(field,design.inspect))} readOnly={readOnly} report={report} />
 {design.kind.includes('EnvoyConfig') && <span role="note">Opaque Envoy xDS resources stay in protected source. Service bindings remain independently editable.</span>}
 </div>;
}
interface PathProps extends ResourceEditorFormProps { field: string; path: (string|number)[]; paths?: (string|number)[][]; cursor?: number; readOnly: boolean; report: (key: string, error: string|null) => void }
function DomainFields(props: PathProps) {
 const groups=new Map<string,(string|number)[][]>();
 for (const path of props.paths ?? [props.path]) {
  const index=path.findIndex((part,i)=>i >= (props.cursor??0) && typeof part==='number');
  const key=(index<0?path:path.slice(0,index)).join('.');
  const paths=groups.get(key)??[];
  paths.push(path);
  groups.set(key,paths);
 }
 return <>{[...groups.entries()].map(([key,paths])=><DomainPath key={key} {...props} paths={paths} path={paths[0]}/>)}</>;
}
function DomainPath(props: PathProps) {
 const index = props.path.findIndex((part,i) => i >= (props.cursor ?? 0) && typeof part === 'number');
 if (index >= 0) {
  const parent = props.path.slice(0,index);
  const rows = props.draft.get(parent);
  if (rows !== undefined && !Array.isArray(rows)) return <span role="note">Unsupported collection. Use preserved source.</span>;
  const count = Array.isArray(rows) ? rows.length : 0;
  return <EditorSection title={labelOf(String(parent[parent.length-1]))}>
   {Array.from({length:count},(_,i) => <div key={i}><DomainFields {...props} cursor={index+1} paths={(props.paths??[props.path]).map(path=>[...parent,i,...path.slice(index+1)])} path={[...parent,i,...props.path.slice(index+1)]} />{!props.readOnly && <Button size="sm" disabled={props.disabled} onClick={()=>{
    const result=props.patch({sessionID:props.draft.sessionID,expectedRevision:props.draft.revision,operations:[{op:'remove',path:[...parent,i]}]});
    props.report(parent.join('.'),result.status==='accepted'?null:result.message);
   }}>Remove {labelOf(String(parent[parent.length-1]))} {i+1}</Button>}</div>)}
   {!props.readOnly && <Button size="sm" disabled={props.disabled} onClick={() => {
    const result = props.patch({sessionID:props.draft.sessionID,expectedRevision:props.draft.revision,operations: rows === undefined ? [{op:'set',path:parent,value:[{}]}] : [{op:'insert',path:parent,index:count,value:{}}]});
    props.report(parent.join('.'), result.status === 'accepted' ? null : result.message);
   }}>Add {labelOf(String(parent[parent.length-1]))}</Button>}
  </EditorSection>;
 }
 return <DomainField {...props} />;
}
function DomainField(props: PathProps) {
 const {draft,path,readOnly,report} = props;
 const key = path.join('.');
 const name = String(path[path.length-1]);
 const current = draft.get(path);
 const [failure,setFailure] = useState<string|null>(null);
 useEffect(() => () => report(key,null),[key,report]);
 const commit = (value: unknown) => {
  const result = props.patch({sessionID:draft.sessionID,expectedRevision:draft.revision,operations:[{op:'set',path,value}]});
  const error = result.status === 'accepted' ? null : result.message;
  setFailure(error); report(key,error); return error;
 };
 const common = {label:labelOf(name),disabled:props.disabled || readOnly,help:key,error:failure};
 if (path[path.length-2] === 'matchLabels') return <EditorSection title={labelOf(String(path[path.length-3]))}>{readOnly ? <Observation value={draft.get(path.slice(0,-1))} /> : <KeyValueFields form={{...props,onValidityChange:error=>report(key,error)}} path={path.slice(0,-1)} label="Match label" />}</EditorSection>;
 if (isList(name)) return <EditorSection title={labelOf(name)}>
  {Array.isArray(current) && current.map((value: unknown,i) => <div key={[...path,i].join('.')} style={{display:'flex',gap:8}}><EditorField {...common} disabled={common.disabled || typeof value !== 'string'} label={`${labelOf(name)} ${i+1}`} value={text(value)} onChange={next => {
   const result=props.patch({sessionID:draft.sessionID,expectedRevision:draft.revision,operations:[{op:'set',path:[...path,i],value:next}]}); report(key,result.status === 'accepted' ? null : result.message);
  }}/>{!readOnly && typeof value === 'string' && <Button size="sm" disabled={props.disabled} onClick={() => { const result=props.patch({sessionID:draft.sessionID,expectedRevision:draft.revision,operations:[{op:'remove',path:[...path,i]}]}); report(key,result.status === 'accepted' ? null : result.message); }}>Remove</Button>}</div>)}
  {!readOnly && <Button size="sm" disabled={props.disabled} onClick={() => { const result=props.patch({sessionID:draft.sessionID,expectedRevision:draft.revision,operations: current === undefined ? [{op:'set',path,value:['']}] : [{op:'insert',path,index:Array.isArray(current)?current.length:0,value:''}]}); report(key,result.status === 'accepted'?null:result.message); }}>Add {labelOf(name)}</Button>}
 </EditorSection>;
 if (current !== null && typeof current === 'object') return <EditorSection title={labelOf(name)}><Observation value={current} /></EditorSection>;
 if (isBoolean(name) && current !== undefined && typeof current !== 'boolean') return <span role="note">{labelOf(name)} has an unsupported scalar type. Preserve source.</span>;
 if (isBoolean(name)) return <EditorChoice {...common} value={typeof current === 'boolean' ? (current ? 'true' : 'false') : ''} options={[{value:'',label:'Not specified'},{value:'true',label:'Enabled'},{value:'false',label:'Disabled'}]} onChange={value => {
  if (value !== '') { commit(value === 'true'); return; }
  const result=props.patch({sessionID:draft.sessionID,expectedRevision:draft.revision,operations:[{op:'remove',path}]});
  report(key,result.status==='accepted'?null:result.message);
 }} />;
 if (isInteger(name)) return <ExactValueField {...common} value={text(current)} identity={`${draft.sessionID}:${key}`} parse={value => name.endsWith('ASN') ? parseCiliumInteger(name,value) : parseExactInteger(value)} onCommit={commit} onValidityChange={error=>report(key,error)} />;
 if (choices[name]) return <EditorChoice {...common} value={text(current)} options={choices[name].filter(value=>props.context.kind !== 'CiliumLocalRedirectPolicy' || name !== 'protocol' || value === 'TCP' || value === 'UDP').map(value=>({value,label:value}))} onChange={commit} />;
 return <EditorField {...common} value={text(current)} onChange={commit} />;
}
function Observation({value}: {value:unknown}) {
 if (value === undefined || value === null) return <span>Not reported</span>;
 if (typeof value !== 'object') return <span>{text(value)}</span>;
 return <dl>{Object.keys(value).map(key => {
  const child: unknown = Reflect.get(value,key);
  return <div key={key}><dt>{labelOf(key)}</dt><dd>{typeof child === 'object' && child !== null ? <Observation value={child}/> : text(child)}</dd></div>;
 })}</dl>;
}
