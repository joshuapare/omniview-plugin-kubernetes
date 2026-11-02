import { useState, type ReactNode } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorField, EditorChoice, EditorSection, ExactValueField, ReferencePicker, patchFields, patchError, scalarText, useFieldValidity } from '../../editor-controls';
import { boundedInteger, readOnly, trustOperations } from './model';
import './gateway.css';
type Path = ResourceEditorPath;
type Field = { label: string; key: string; choices?: string[]; max?: number; min?: number; resource?: string; group?: string; version?: string; namespace?: string; immutable?: boolean; help?: string };
const name = {label:'Name',key:'name'};
const backend: Field[] = [{...name,label:'Service',resource:'services'},{label:'Namespace',key:'namespace',help:'A foreign backend needs a ReferenceGrant in its namespace. No grant is created.'},{label:'Port',key:'port',max:65535,min:1},{label:'Weight',key:'weight',max:1000000}];
export default function GatewayForms(form: ResourceEditorFormProps) {
 const [failure,setFailure] = useState<string|null>(null);
 const report = useFieldValidity(form);
 const disabled = form.disabled || readOnly(form.draft,form.context);
 const text = (path:Path) => scalarText(form.draft.get(path));
 const commit = (operations:ResourceEditorPatch[]) => { const error=patchError(patchFields(form,operations));setFailure(error);report('$patch',error);return error; };
 const field = (root:Path, spec:Field):ReactNode => {
  const path=[...root,spec.key], key=JSON.stringify(path), value=text(path);
  const locked=disabled || !!spec.immutable && form.context.intent !== 'create';
  const onChange=(value:string)=> {
   const operations:ResourceEditorPatch[] = value === '' && !['group','kind'].includes(spec.key) ? [{op:'remove',path}] : [{op:'set',path,value}];
   if(spec.key==='protocol') {
    if(['HTTP','TCP','UDP'].includes(value) && form.draft.has([...root,'tls'])) operations.push({op:'remove',path:[...root,'tls']});
    if(['TCP','UDP'].includes(value) && form.draft.has([...root,'hostname'])) operations.push({op:'remove',path:[...root,'hostname']});
    if(value==='HTTPS') operations.push({op:'set',path:[...root,'tls','mode'],value:'Terminate'});
   }
   if(spec.key==='mode' && value==='Passthrough' && form.draft.has([...root,'certificateRefs'])) operations.push({op:'remove',path:[...root,'certificateRefs']});
   commit(operations);
  };
  const props={label:spec.label,value,disabled:locked,help:spec.help,onChange};
  if(spec.max !== undefined) return <ExactValueField key={key} {...props} identity={`${form.draft.sessionID}:${key}`} parse={value=>boundedInteger(value,spec.max!,spec.min)} onCommit={value=>commit([{op:'set',path,value}])} onValidityChange={error=>report(key,error)}/>;
  if(spec.choices) return <EditorChoice key={key} {...props} options={['',...spec.choices].map(value=>({value,label:value || 'Not specified'}))}/>;
  if(spec.resource) return <ReferencePicker key={key} {...props} form={form} query={{group:spec.group ?? '',version:spec.version ?? 'v1',resource:spec.resource,namespace:spec.resource==='gatewayclasses'?undefined:spec.namespace ?? (text([...root,'namespace']) || form.context.namespace),projection:'metadata'}}/>;
  return <EditorField key={key} {...props}/>;
 };
 const fields=(path:Path,specs:Field[])=><div className="gateway-fields">{specs.map(spec=>field(path,spec))}</div>;
 const rows=(path:Path,title:string,initial:unknown,render:(path:Path)=>ReactNode,max=16):ReactNode=> {
  const value=form.draft.get(path), count=Array.isArray(value)?value.length:0;
  return <EditorSection title={title}>{Array.from({length:count},(_,i)=><div className="gateway-row" key={i}>{render([...path,i])}<Button size="sm" disabled={disabled} onClick={()=>commit([{op:'remove',path:[...path,i]}])}>Remove {title.toLowerCase()} {i+1}</Button></div>)}<Button size="sm" disabled={disabled || count>=max} onClick={()=>commit([form.draft.has(path)?{op:'insert',path,index:count,value:initial}:{op:'set',path,value:[initial]}])}>Add {title.toLowerCase()}</Button></EditorSection>;
 };
 const refs=(path:Path,title:string,resource:string,kind:string,group='')=>rows(path,title,{group,kind,name:''},p=>fields(p,[{...name,resource},{label:'Group',key:'group'},{label:'Kind',key:'kind'},{label:'Namespace',key:'namespace'}]));
 const kind=form.context.kind;
 const parents=()=>rows(['spec','parentRefs'],'Parents',{group:'gateway.networking.k8s.io',kind:'Gateway',name:''},p=>fields(p,[{...name,label:'Gateway',resource:'gateways',group:'gateway.networking.k8s.io'},{label:'Namespace',key:'namespace'},{label:'Listener',key:'sectionName'},{label:'Port',key:'port',max:65535,min:1}]));
 const hosts=()=>rows(['spec','hostnames'],kind==='TLSRoute'?'SNI hostnames':'Hostnames','',p=><EditorField label="Hostname" disabled={disabled} value={text(p)} onChange={value=>commit([{op:'set',path:p,value}])}/>);
 const rules=()=>rows(['spec','rules'],'Rules',{},p=><>{(kind==='HTTPRoute' || kind==='GRPCRoute') && rows([...p,'matches'],'Matches',{},m=><>{kind==='HTTPRoute'?<>{fields([...m,'path'],[{label:'Path match',key:'type',choices:['PathPrefix','Exact','RegularExpression']},{label:'Path',key:'value'}])}{fields(m,[{label:'Method',key:'method',choices:['GET','HEAD','POST','PUT','DELETE','CONNECT','OPTIONS','TRACE','PATCH']}])}</>:fields([...m,'method'],[{label:'Match type',key:'type',choices:['Exact','RegularExpression']},{label:'gRPC service',key:'service'},{label:'gRPC method',key:'method'}])}{rows([...m,'headers'],'Headers',{name:'',value:''},h=>fields(h,[name,{label:'Match type',key:'type',choices:['Exact','RegularExpression']},{label:'Value',key:'value'}]))}</>)}{rows([...p,'backendRefs'],'Backends',{name:'',port:80,weight:1},b=>fields(b,backend))}</>);
 return <div className="gateway-editor">{failure && <div role="alert">{failure}</div>}{disabled && <div role="status">Inspection only. Ownership or authoring permission is not established.</div>}
 {kind==='GatewayClass' && <><EditorSection title="Controller">{fields(['spec'],[{label:'Controller',key:'controllerName',immutable:true,help:'Immutable after creation. Authoring requires cluster-scoped create or update permission.'},{label:'Description',key:'description'}])}</EditorSection><details><summary>Parameters</summary>{fields(['spec','parametersRef'],[{label:'Group',key:'group'},{label:'Kind',key:'kind'},name,{label:'Namespace',key:'namespace'}])}</details></>}
 {kind==='Gateway' && <><EditorSection title="Gateway class">{fields(['spec'],[{label:'Class',key:'gatewayClassName',resource:'gatewayclasses',group:'gateway.networking.k8s.io',help:'Changing class can move traffic to another controller.'}])}</EditorSection>{rows(['spec','listeners'],'Listeners',{name:'',protocol:'HTTP',port:80},p=><>{fields(p,[name,{label:'Protocol',key:'protocol',choices:['HTTP','HTTPS','TLS','TCP','UDP'],help:'Protocol changes remove incompatible TLS and hostname fields.'},{label:'Port',key:'port',max:65535,min:1}])}{['HTTP','HTTPS','TLS'].includes(text([...p,'protocol'])) && fields(p,[{label:'Hostname',key:'hostname'}])}{['HTTPS','TLS'].includes(text([...p,'protocol'])) && <>{fields([...p,'tls'],[{label:'TLS mode',key:'mode',choices:text([...p,'protocol'])==='HTTPS'?['Terminate']:['Terminate','Passthrough'],help:'Passthrough removes termination certificate references.'}])}{text([...p,'tls','mode'])!=='Passthrough' && refs([...p,'tls','certificateRefs'],'Certificates','secrets','Secret')}</>}{fields([...p,'allowedRoutes','namespaces'],[{label:'Route namespaces',key:'from',choices:['Same','All','Selector'],help:'Selector requires a namespace label selector in advanced source. Admission does not grant backend access.'}])}</>,64)}</>}
 {['HTTPRoute','GRPCRoute','TCPRoute','TLSRoute','UDPRoute'].includes(kind) && <>{parents()}{['HTTPRoute','GRPCRoute','TLSRoute'].includes(kind) && hosts()}{rules()}<div role="note">Routing edits can redirect traffic. Controller acceptance remains independent.</div></>}
 {kind==='ReferenceGrant' && <>{rows(['spec','from'],'Sources',{group:'gateway.networking.k8s.io',kind:'HTTPRoute',namespace:''},p=>fields(p,[{label:'API group',key:'group'},{label:'Kind',key:'kind',choices:['HTTPRoute','GRPCRoute','TCPRoute','TLSRoute','UDPRoute','Gateway']},{label:'Source namespace',key:'namespace'}]))}{rows(['spec','to'],'Targets',{group:'',kind:'Service'},p=>fields(p,[{label:'API group',key:'group'},{label:'Kind',key:'kind',choices:['Service','Secret']},{label:'Target name',key:'name',help:'An omitted name grants access to every matching kind in this namespace.'}]))}<div role="note">This namespace grants access. An omitted target name broadens permission.</div></>}
 {kind==='BackendTLSPolicy' && <>{rows(['spec','targetRefs'],'Targets',{group:'',kind:'Service',name:''},p=>fields(p,[{...name,label:'Service',resource:'services'},{label:'Group',key:'group'},{label:'Kind',key:'kind'},{label:'Port name',key:'sectionName'}]))}{fields(['spec','validation'],[{label:'TLS hostname',key:'hostname',help:'Used for SNI and certificate authentication unless subjectAltNames overrides authentication.'}])}<EditorChoice label="Trust source" disabled={disabled} value={form.draft.has(['spec','validation','wellKnownCACertificates'])?'System':'ConfigMap'} options={['System','ConfigMap'].map(value=>({value,label:value}))} onChange={value=>commit(trustOperations(value))}/>{!form.draft.has(['spec','validation','wellKnownCACertificates']) && rows(['spec','validation','caCertificateRefs'],'CA ConfigMaps',{group:'',kind:'ConfigMap',name:''},p=>fields(p,[{...name,resource:'configmaps'}]),8)}<div role="note">Trust changes can interrupt backend connections. Certificate validity is not verified here.</div></>}
 <details><summary>Advanced and attachment</summary><p>Additional implementation-specific fields remain in source. Status stays controller-owned.</p><EditorSection title="Observed conditions">{Array.isArray(form.draft.get(['status','conditions'])) ? (form.draft.get(['status','conditions']) as unknown[]).map((_,i)=><div key={i}>{text(['status','conditions',i,'type'])}: {text(['status','conditions',i,'status'])} · {text(['status','conditions',i,'reason'])}</div>):<span>No observed conditions. Acceptance and resolved references are unknown.</span>}</EditorSection></details>
 </div>;
}
