import { useEffect, useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorField, EditorChoice, EditorSection, ExactValueField, ReferencePicker } from '../../editor-controls';
import { definitions, type Field } from './definitions';
import { parseCalicoNumber, readOnly, validCIDR } from './policy';

const rows:Record<string,Field[]> = {
  rules:[{path:'action',label:'Action',type:'ref:Allow,Deny,Log,Pass'},{path:'protocol',label:'Protocol',type:'text'},{path:'source.selector',label:'Source selector',type:'selector'},{path:'destination.selector',label:'Destination selector',type:'selector'},{path:'destination.ports',label:'Destination ports',type:'list'}],
  ports:[{path:'name',label:'Name',type:'text'},{path:'protocol',label:'Protocol',type:'ref:TCP,UDP,SCTP'},{path:'port',label:'Port',type:'number'}],
  filters:[{path:'action',label:'Action',type:'ref:Accept,Reject'},{path:'cidr',label:'CIDR',type:'cidr'},{path:'matchOperator',label:'Match',type:'ref:Equal,NotEqual,In,NotIn'},{path:'source',label:'Source',type:'ref:RemotePeers'},{path:'interface',label:'Interface',type:'text'},{path:'prefixLength.min',label:'Minimum prefix',type:'number'},{path:'prefixLength.max',label:'Maximum prefix',type:'number'}],
  cidrrows:[{path:'cidr',label:'CIDR',type:'cidr'}],
  prefix:[{path:'cidr',label:'CIDR',type:'cidr'},{path:'communities',label:'Communities',type:'list'}],
  protoports:[{path:'protocol',label:'Protocol',type:'ref:TCP,UDP'},{path:'port',label:'Port',type:'number'},{path:'net',label:'Network',type:'text'}],
  pairs:[{path:'name',label:'Name',type:'text'},{path:'value',label:'Value',type:'text'}],
  k8srules:[{path:'ports',label:'Ports',type:'k8sports'},{path:'from',label:'Ingress peers',type:'peers'}],
  k8sports:[{path:'protocol',label:'Protocol',type:'ref:TCP,UDP,SCTP'},{path:'port',label:'Port or name',type:'port'},{path:'endPort',label:'End port',type:'number'}],
  peers:[{path:'podSelector.matchLabels',label:'Pod labels',type:'map'},{path:'namespaceSelector.matchLabels',label:'Namespace labels',type:'map'},{path:'ipBlock.cidr',label:'IP block',type:'cidr'},{path:'ipBlock.except',label:'Except',type:'list'}],
};
const stringValue=(value:unknown)=>typeof value==='string'||typeof value==='number'||typeof value==='bigint'||typeof value==='boolean'?String(value):'';
function Control({props,field,path,locked,report}:{props:ResourceEditorFormProps;field:Field;path:ResourceEditorPath;locked:boolean;report:(key:string,error:string|null)=>void}) {
  const {draft}=props; const value=draft.get(path); const key=JSON.stringify(path);
  const [failure,setFailure]=useState<string|null>(null);
  useEffect(()=>()=>report(key,null),[key]);
  const commit=(operations:ResourceEditorPatch[])=>{
    const result=props.patch({sessionID:draft.sessionID,expectedRevision:draft.revision,operations});
    const error=result.status==='accepted'?null:'Change was not accepted. Refresh this field before retrying.';
    setFailure(error); report(key,error); return error;
  };
  const set=(next:unknown)=>commit([{op:'set',path,value:next}]);
  const common={label:field.label,disabled:locked,help:`${path.join('.')} · Omitted fields retain installed defaults.`,error:failure};
  const type=field.type;
  if(field.path==='node'||field.path==='tier') return <ReferencePicker {...common} form={props} query={field.path==='node'?{group:'',version:'v1',resource:'nodes'}:{group:'projectcalico.org',version:'v3',resource:'tiers'}} value={stringValue(value)} onChange={set}/>;
  if(type==='port') return <ExactValueField {...common} identity={`${draft.sessionID}:${key}`} value={stringValue(value)} parse={text=>/^\d+$/.test(text)?{valid:true,value:BigInt(text)}:/^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(text)?{valid:true,value:text}:{valid:false,error:'Enter a port number, range, or name.'}} onCommit={set} onValidityChange={error=>report(key,error)}/>;
  if(type==='bool'||type.startsWith('ref:')) {
    const values=type==='bool'?['true','false']:type.slice(4).split(',');
    return <EditorChoice {...common} value={stringValue(value)} options={[{value:'',label:'Not specified'},...values.map(v=>({value:v,label:v}))]} onChange={v=>v===''?commit([{op:'remove',path}]):set(type==='bool'?v==='true':v)} />;
  }
  if(type==='number'||type==='cidr') return <ExactValueField {...common} identity={`${draft.sessionID}:${key}`} value={stringValue(value)} parse={v=>type==='number'?parseCalicoNumber(field.path,v):validCIDR(v)?{valid:true,value:v}:{valid:false,error:'Enter a valid network CIDR.'}} onCommit={set} onValidityChange={e=>report(key,e)} />;
  const map=type==='map'||(type==='pairs'&&(field.path==='labelsToApply'||field.path.includes('matchLabels')));
  if(map) return <EditorSection title={field.label}>{value && typeof value==='object'&&!Array.isArray(value)?Object.keys(value).map(name=><div key={name}><Control props={props} field={{path:name,label:name,type:'text'}} path={[...path,name]} locked={locked} report={report}/><Button size="sm" disabled={locked} onClick={()=>commit([{op:'remove',path:[...path,name]}])}>Remove {name}</Button></div>):null}<MapAdd disabled={locked} add={name=>name&&!draft.has([...path,name])?commit([{op:'set',path:[...path,name],value:''}]):'Use a new nonempty key.'} /></EditorSection>;
  if(type==='list'||rows[type]) {
    const items=Array.isArray(value)?value:[];
    const itemType=['types','policyTypes'].includes(field.path)?'ref:Ingress,Egress':field.path==='classes'?'ref:Agent,BGP,Routes':field.path==='allowedUses'?'ref:Workload,Tunnel':field.path==='destination.ports'?'port':'text';
    const fields=type==='list'?[{path:'',label:'Value',type:itemType}]:rows[type];
    return <EditorSection title={field.label}>{items.map((_item,index)=><div key={index} style={{borderLeft:'2px solid var(--ov-color-border-default)',paddingLeft:12,marginBottom:8}}>{fields.map(f=>{
      const actual=type==='k8srules'&&path[1]==='egress'&&f.path==='from'?{...f,path:'to',label:'Egress peers'}:f;
      return <Control key={actual.path} props={props} field={actual} path={actual.path?[...path,index,...actual.path.split('.')]:[...path,index]} locked={locked} report={report}/>;
    })}<Button size="sm" disabled={locked} onClick={()=>commit([{op:'remove',path:[...path,index]}])}>Remove {field.label} {index+1}</Button></div>)}<Button size="sm" disabled={locked} onClick={()=>commit(value===undefined?[{op:'set',path,value:[]} ,{op:'insert',path,index:0,value:type==='list'?'':{}}]:[{op:'insert',path,index:items.length,value:type==='list'?'':{}}])}>Add {field.label}</Button>{failure&&<span role="alert">{failure}</span>}</EditorSection>;
  }
  return <EditorField {...common} value={stringValue(value)} onChange={set}/>;
}
function MapAdd({disabled,add}:{disabled:boolean;add:(key:string)=>string|null}) {
  const [key,setKey]=useState('');const [error,setError]=useState<string|null>(null);
  return <div><EditorField label="New label key" value={key} disabled={disabled} error={error} onChange={setKey}/><Button size="sm" disabled={disabled} onClick={()=>{const failure=add(key);setError(failure);if(!failure)setKey('');}}>Add label</Button></div>;
}
export default function CalicoEditor(props:ResourceEditorFormProps) {
  const definition=definitions.find(d=>d.kind===props.context.kind)!;
  const [errors,setErrors]=useState<Record<string,string>>({});
  const report=(key:string,error:string|null)=>setErrors(old=>{if(old[key]===error||(!error&&!old[key]))return old;const next={...old};if(error)next[key]=error;else delete next[key];return next;});
  useEffect(()=>{props.onValidityChange(Object.values(errors)[0]??null);},[errors,props.onValidityChange]);
  const locked=props.disabled||readOnly(props.draft,props.context);
  const diagnosticPaths=props.context.kind==='CalicoNodeStatus'?['lastUpdated','agent.birdV4.state','agent.birdV6.state','bgp.numberEstablishedV4','bgp.numberNotEstablishedV4','bgp.numberEstablishedV6','bgp.numberNotEstablishedV6']:props.context.kind==='KubeControllersConfiguration'?['environmentVars']: [];
  const stagedDelete=props.context.kind.startsWith('Staged')&&props.draft.get(['spec','stagedAction'])==='Delete';
  const peerSelector=props.context.kind==='BGPPeer'&&props.draft.has(['spec','peerSelector']);
  return <EditorSection title={definition.title}>
    {props.context.kind.startsWith('Staged')&&<div role="note">Staged policy registration does not prove controller support or enforcement.</div>}
    {locked&&<div role="note">Inspection only · Ownership and immutable fields remain protected.</div>}
    {props.context.kind==='BGPPeer'&&<EditorChoice label="Peer target" value={peerSelector?'selector':'address'} disabled={locked} help="Changing target removes only the incompatible peer selector or address and AS number. Other peer settings remain." options={[{value:'address',label:'Address and AS number'},{value:'selector',label:'Calico node selector'}]} onChange={mode=>{
      const operations:ResourceEditorPatch[]=mode==='selector'?[{op:'remove',path:['spec','peerIP']},{op:'remove',path:['spec','asNumber']},{op:'set',path:['spec','peerSelector'],value:''}]:[{op:'remove',path:['spec','peerSelector']}];
      const result=props.patch({sessionID:props.draft.sessionID,expectedRevision:props.draft.revision,operations});
      report('peer-target',result.status==='accepted'?null:'Peer target change was not accepted.');
    }}/>}
    {stagedDelete&&<div role="note">Staged deletion selected. Existing target and rule fields remain preserved in source.</div>}
    {definition.fields.filter(field=>!stagedDelete||field.path==='stagedAction').filter(field=>props.context.kind!=='BGPPeer'||(peerSelector?!['peerIP','asNumber'].includes(field.path):field.path!=='peerSelector')).map(field=><Control key={field.path} props={props} field={field} path={['spec',...field.path.split('.')]} locked={locked||(props.context.kind==='IPPool'&&props.context.intent!=='create'&&['cidr','blockSize'].includes(field.path))} report={report}/>)}
    {diagnosticPaths.length>0&&<EditorSection title="Generated status">{diagnosticPaths.filter(path=>path!=='environmentVars').map(path=><div key={path}><span>{path}</span>: <output>{stringValue(props.draft.get(['status',...path.split('.')]))||'Unavailable'}</output></div>)}{props.context.kind==='KubeControllersConfiguration'&&<div role="status">Effective running configuration is controller-owned. Environment overrides may supersede this spec.</div>}</EditorSection>}
    {props.context.kind==='KubeControllersConfiguration'&&<EditorSection title="Effective configuration">{definition.fields.map(field=><div key={field.path}>{field.label}: <output>{stringValue(props.draft.get(['status','runningConfig',...field.path.split('.')]))||'Unavailable'}</output></div>)}</EditorSection>}
    {props.context.kind==='CalicoNodeStatus'&&<EditorSection title="BGP peers and routes">{['bgp.peersV4','bgp.peersV6','routes.routesV4','routes.routesV6'].map(path=>{
      const data=props.draft.get(['status',...path.split('.')]);
      const columns=path.startsWith('bgp.')?['peerIP','type','state','since']:['type','destination','gateway','interface','learnedFrom.sourceType','learnedFrom.peerIP'];
      return <details key={path}><summary>{path}</summary>{Array.isArray(data)&&data.length>0?<div style={{overflow:'auto',maxHeight:240}}><table><thead><tr>{columns.map(column=><th key={column}>{column}</th>)}</tr></thead><tbody>{data.map((_row,index)=><tr key={index}>{columns.map(column=><td key={column}>{stringValue(props.draft.get(['status',...path.split('.'),index,...column.split('.')]))||'Unavailable'}</td>)}</tr>)}</tbody></table></div>:<div role="status">{Array.isArray(data)?'No entries reported.':'Generated status unavailable.'}</div>}</details>;
    })}</EditorSection>}
    <details><summary>Advanced fields</summary><div>Use the shared source view for unmodeled fields. Generated status is never editable here.</div></details>
  </EditorSection>;
}
