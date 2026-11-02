import { useEffect, useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorField, EditorChoice, EditorSection, ExactValueField, ReferencePicker, scalarText, useFieldValidity } from '../../editor-controls';
import { deployment, integer, parseRow } from './model';
import ResourceLinkChip from '@/components/shared/ResourceLinkChip';
import { CALICO_330_IMAGES, evidenceFailure, TIGERA_EVIDENCE_PROTOCOL } from './evidence';

export default function CalicoOperatorEditor(form: ResourceEditorFormProps) {
 const {draft, context} = form;
 const validity = useFieldValidity(form);
 const [failure,setFailure] = useState<string|null>(null);
 const evidenceKey = `${draft.sessionID}/${draft.revision}/${context.kind}/${context.intent}`;
 const [evidenceResult,setEvidenceResult] = useState<{key:string;actions:ResourceEditorFormProps['actions'];error:string|null}|null>(null);
 const needsEvidence = context.intent !== 'inspect' && context.kind !== 'TigeraStatus';
 const evidence = !needsEvidence ? null : evidenceResult?.key === evidenceKey && evidenceResult.actions === form.actions ? evidenceResult.error : 'Checking installed operator prerequisites…';
 useEffect(()=>{validity('evidence',evidence);return()=>validity('evidence',null);},[validity,evidence]);
 useEffect(()=>{
  if (!needsEvidence) return;
  const controller = new AbortController();
  void form.actions.execute({protocol:TIGERA_EVIDENCE_PROTOCOL,input:{},sessionID:draft.sessionID,generation:draft.revision,signal:controller.signal}).then(result=>{
   if (controller.signal.aborted) return;
   const error = result.status === 'ready' ? evidenceFailure(result.output,context.kind) : `Installed operator evidence ${result.status}.`;
   setEvidenceResult({key:evidenceKey,actions:form.actions,error});
  },()=>{
   if (controller.signal.aborted) return;
   setEvidenceResult({key:evidenceKey,actions:form.actions,error:'Installed operator evidence unavailable.'});
  });
  return ()=>controller.abort();
 },[form.actions,draft.sessionID,draft.revision,context.kind,needsEvidence,evidenceKey]);
 const locked = form.disabled || context.intent === 'inspect' || context.kind === 'TigeraStatus';
 const commit = (operations: readonly ResourceEditorPatch[]) => {
  const result = form.patch({sessionID:draft.sessionID,expectedRevision:draft.revision,operations});
  const error = result.status === 'accepted' ? null : result.message;
  setFailure(error); validity('patch',error); return error;
 };
 const set = (path:ResourceEditorPath, value:unknown) => commit([value === '' ? {op:'remove',path} : {op:'set',path,value}]);
 const text = (path:ResourceEditorPath) => scalarText(draft.get(path));
 const field = (label:string,path:ResourceEditorPath,help?:string,disabled=locked) => <EditorField label={label} value={text(path)} disabled={disabled} help={help} onChange={value=>set(path,value)} />;
 const choice = (label:string,path:ResourceEditorPath,values:readonly string[],help?:string) => <EditorChoice label={label} value={text(path)} options={[{value:'',label:'Operator default (omitted)'},...values.map(value=>({value,label:value}))]} help={help} disabled={locked} onChange={value=>set(path,value)} />;
 const number = (label:string,path:ResourceEditorPath) => <ExactValueField label={label} value={text(path)} identity={`${draft.sessionID}:${path.join('.')}`} disabled={locked} parse={integer} onCommit={value=>set(path,value)} onValidityChange={error=>validity(path.join('.'),error)} />;
 const kind = context.kind;
 const arrayPath = kind === 'ImageSet' ? ['spec','images'] : ['spec','calicoNetwork','ipPools'];
 const rowField = (label:string,path:ResourceEditorPath,type:'image'|'digest'|'cidr',disabled=locked) => <ExactValueField label={label} value={text(path)} identity={`${draft.sessionID}:${path.join('.')}`} disabled={disabled} parse={value=>parseRow(value,type)} onCommit={value=>set(path,value)} onValidityChange={error=>validity(path.join('.'),error)} />;
 const rows = draft.get(arrayPath);
 const missingImages = CALICO_330_IMAGES.filter(image=>!Array.isArray(rows) || !rows.some((_,index)=>draft.get([...arrayPath,index,'image']) === image));
 const poolEdit = kind === 'Installation' && context.intent !== 'create';
 const list = (image:boolean) => <EditorSection title={image ? 'Image digests' : 'IP pools'}>
  {!image && poolEdit && <p role="note">Existing pool migrations require operator-specific planning; pool rows are locked.</p>}
  {Array.isArray(rows) && rows.map((_,index)=><div key={index} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr) auto',gap:8,alignItems:'end'}}>
   {image ? <EditorChoice label={`Original image ${index+1}`} value={text([...arrayPath,index,'image'])} disabled={locked} options={[{value:'',label:'Choose original image'},...CALICO_330_IMAGES.map(value=>({value,label:value}))]} onChange={value=>set([...arrayPath,index,'image'],value)} /> : rowField(`CIDR ${index+1}`,[...arrayPath,index,'cidr'],'cidr',locked || poolEdit)}
   {image ? rowField(`Digest ${index+1}`,[...arrayPath,index,'digest'],'digest') : <EditorChoice label={`Encapsulation ${index+1}`} value={text([...arrayPath,index,'encapsulation'])} disabled={locked || poolEdit} options={['','IPIP','IPIPCrossSubnet','VXLAN','VXLANCrossSubnet','None'].map(value=>({value,label:value || 'Operator default'}))} onChange={value=>set([...arrayPath,index,'encapsulation'],value)} />}
   <Button size="sm" disabled={locked || poolEdit} onClick={()=>commit([{op:'remove',path:[...arrayPath,index]}])}>Remove {index+1}</Button>
  </div>)}
  <Button size="sm" disabled={locked || poolEdit} onClick={()=>commit(Array.isArray(rows) ? [{op:'insert',path:arrayPath,index:rows.length,value:image?{image:'',digest:''}:{cidr:''}}] : [{op:'set',path:arrayPath,value:[image?{image:'',digest:''}:{cidr:''}]}])}>Add {image?'image':'pool'}</Button>
  {image && missingImages.length > 0 && <Button size="sm" disabled={locked} onClick={()=>commit(Array.isArray(rows) ? missingImages.map((name,index)=>({op:'insert' as const,path:arrayPath,index:rows.length+index,value:{image:name,digest:''}})) : [{op:'set',path:arrayPath,value:missingImages.map(name=>({image:name,digest:''}))}])}>Add {missingImages.length} missing inventory rows</Button>}
  {!image && draft.has(arrayPath) && !poolEdit && <Button size="sm" disabled={locked} onClick={()=>commit([{op:'remove',path:arrayPath}])}>Use operator pool defaults</Button>}
 </EditorSection>;
 return <div style={{display:'grid',gap:16,minWidth:0}}>{failure && <p role="alert">{failure}</p>}{evidence && <p role="status">{evidence}</p>}
  {kind === 'Installation' && <><p role="note">Network changes affect cluster connectivity.</p><EditorSection title="Cluster network">
   {choice('Kubernetes provider',['spec','kubernetesProvider'],['EKS','GKE','AKS','OpenShift','DockerEnterprise','RKE2','TKG'])}
   {choice('Linux dataplane',['spec','calicoNetwork','linuxDataplane'],['Iptables','BPF','VPP','Nftables'])}
   {choice('BGP',['spec','calicoNetwork','bgp'],['Enabled','Disabled'])}
   {number('MTU · bytes',['spec','calicoNetwork','mtu'])}
  </EditorSection>{list(false)}<details><summary>Advanced installation</summary>{field('Image registry',['spec','registry'])}{number('Control-plane replicas',['spec','controlPlaneReplicas'])}</details></>}
  {['APIServer','Goldmane','Whisker'].includes(kind) && <><p role="note">Operator owns generated workloads. No companion resources are created by this form.</p><EditorSection title={`${kind} configuration`}>
   {kind === 'Whisker' && choice('External notifications',['spec','notifications'],['Enabled','Disabled'],'Enables calls to an external service for notification banners. Installation and Goldmane must be configured separately.')}
   {kind === 'APIServer' && choice('API server logging',['spec','logging','apiServer','logSeverity'],['Fatal','Error','Warn','Info','Debug','Trace'])}
   {number('Minimum ready time · seconds',['spec',deployment(kind),'spec','minReadySeconds'])}
   <ReferencePicker label="Priority class" form={form} query={{group:'scheduling.k8s.io',version:'v1',resource:'priorityclasses',projection:'metadata'}} value={text(['spec',deployment(kind),'spec','template','spec','priorityClassName'])} disabled={locked} onChange={value=>set(['spec',deployment(kind),'spec','template','spec','priorityClassName'],value)} />
  </EditorSection></>}
  {kind === 'ImageSet' && <><p role="note">Pinned inventory · Calico v3.30.0 · {missingImages.length} missing images. Digests are not authenticity proof.</p>{list(true)}</>}
  {kind === 'GatewayAPI' && <EditorSection title="Gateway API CRDs">{choice('CRD management',['spec','crdManagement'],['PreferExisting','Reconcile'],'PreferExisting creates missing CRDs without updating existing CRDs. Reconcile manages shared CRD updates. When omitted, the operator infers and writes Reconcile if all CRDs were newly created, otherwise PreferExisting. CRDs survive removal. Requires an installed compatible operator and resolved Installation variant.')}{text(['spec','crdManagement']) === 'Reconcile' && <p role="alert">Reconcile updates shared Gateway API CRDs.</p>}</EditorSection>}
  {kind === 'TigeraStatus' && <EditorSection title="Operator health"><p role="note">Operator observation only.</p><ResourceLinkChip connectionID={context.connectionID} ownerReference={{apiVersion:'operator.tigera.io/v1',kind:'Installation',name:'default',uid:''}} resourceName="Installation configuration" />{Array.isArray(draft.get(['status','conditions'])) ? (draft.get(['status','conditions']) as unknown[]).map((_,index)=><div key={index}><strong>{text(['status','conditions',index,'type'])}: {text(['status','conditions',index,'status'])}</strong>{field('Reason',['status','conditions',index,'reason'])}{field('Observed generation',['status','conditions',index,'observedGeneration'])}{field('Last transition',['status','conditions',index,'lastTransitionTime'])}</div>) : <p>No conditions reported.</p>}</EditorSection>}
 </div>;
}
