import { useEffect, useRef, useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorSection } from '../../editor-controls';
const protocol='kubernetes.crossplane-revision-activation.v1';
interface Change {resource:string;name:string;uid:string;resourceVersion:string;from:'Active'|'Inactive';to:'Active'|'Inactive'}
interface Plan {owner:{name:string;uid:string;resourceVersion:string;activationPolicy:'Manual'};target:{name:string;uid:string;resourceVersion:string};changes:Change[];atomic:false}
function record(value: unknown): value is Record<string, unknown> {
 return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isChange(value: unknown): value is Change {
 return record(value) && typeof value.resource === 'string' && typeof value.name === 'string' && typeof value.uid === 'string' && typeof value.resourceVersion === 'string' && (value.from === 'Active' || value.from === 'Inactive') && (value.to === 'Active' || value.to === 'Inactive');
}
function isPlan(value:unknown):value is Plan {
 if (!record(value) || !record(value.owner) || !record(value.target) || !Array.isArray(value.changes)) return false;
 const changes: readonly unknown[] = value.changes;
 return value.atomic === false && value.owner.activationPolicy === 'Manual' && typeof value.owner.name === 'string' && typeof value.owner.uid === 'string' && typeof value.owner.resourceVersion === 'string' && typeof value.target.name === 'string' && typeof value.target.uid === 'string' && typeof value.target.resourceVersion === 'string' && changes.length > 0 && changes.every(isChange);
}
export function Activation(form:ResourceEditorFormProps){
 const [identity,setIdentity]=useState({actions:form.actions,patch:form.patch,generation:0});
 if(identity.actions!==form.actions||identity.patch!==form.patch)setIdentity({actions:form.actions,patch:form.patch,generation:identity.generation+1});
 return <ActivationSession key={`${identity.generation}/${form.draft.sessionID}/${form.draft.revision}/${form.context.connectionID}/${form.context.uid}/${form.context.resourceVersion}`} {...form} />;
}
function ActivationSession(form: ResourceEditorFormProps) {
 const [plan,setPlan]=useState<Plan|null>(null);
 const [confirmed,setConfirmed]=useState<ReadonlySet<string>>(new Set());
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [outcome,setOutcome]=useState<{status:string;applied:Change[];pending:Change[];uncertain?:Change}|null>(null);
 const generation=useRef(0);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>{generation.current++;controller.current?.abort();return()=>{generation.current++;controller.current?.abort();};},[form.patch,form.actions]);
 const allowed=form.context.capabilities.actions[protocol]==='available';
 async function run(execute:boolean){
  if (!allowed || execute && (!plan || !plan.changes.every(change=>confirmed.has(change.uid)))) return;
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const current=++generation.current;
  setBusy(true);setMessage('');setOutcome(null);
  try{
   const result=await form.actions.execute({protocol,sessionID:form.draft.sessionID,generation:current,signal:abort.signal,input:execute?{phase:'execute',plan,confirmed:plan!.changes.map(({name,uid,resourceVersion})=>({name,uid,resourceVersion}))}:{phase:'preview'}});
   if(abort.signal.aborted||generation.current!==current)return;
   if(result.status!=='ready'){setMessage(result.message);if(execute)setPlan(null);return;}
   if(!execute){if(isPlan(result.output)){setPlan(result.output);setConfirmed(new Set());}else setMessage('Activation review returned an unsupported response. No changes were requested.');}
   else {
    const value: unknown = result.output;
    setPlan(null);setConfirmed(new Set());
    const applied: readonly unknown[] = record(value) && Array.isArray(value.applied) ? value.applied : [];
    const pending: readonly unknown[] = record(value) && Array.isArray(value.pending) ? value.pending : [];
    if(record(value)&&(value.status==='completed'||value.status==='partial'||value.status==='failed')&&Array.isArray(value.applied)&&Array.isArray(value.pending)&&applied.every(isChange)&&pending.every(isChange)&&(value.uncertain===undefined||isChange(value.uncertain))){
     setOutcome({status:value.status,applied:[...applied],pending:[...pending],uncertain:value.uncertain});
     setMessage(value.status==='completed'?'Activation writes completed. Controller health is not established.':value.status==='partial'?'Activation partially applied. Inspect each revision before retrying.':'Activation failed. Inspect revision state before retrying.');
    }else setMessage('Activation result is unknown. Inspect revisions before retrying.');
   }
  }catch{if(!abort.signal.aborted&&generation.current===current){setPlan(null);setMessage(execute?'Activation outcome is unknown. Inspect revisions before retrying.':'Activation review could not be loaded.');}}
  finally{if(!abort.signal.aborted&&generation.current===current)setBusy(false);}
 }
 return <EditorSection title="Revision activation"><Button size="sm" disabled={!allowed||busy} onClick={()=>void run(false)}>Review activation</Button>{!allowed&&<span role="status">Activation action permission is not available.</span>}{plan&&<div><p>Package {plan.owner.name} · Manual activation. Writes are not atomic.</p>{plan.changes.map(change=><label key={change.uid} style={{display:'block'}}><input type="checkbox" checked={confirmed.has(change.uid)} disabled={busy} onChange={event=>setConfirmed(previous=>{const next=new Set(previous);if(event.target.checked)next.add(change.uid);else next.delete(change.uid);return next;})}/>{change.name}: {change.from} → {change.to}<small> · revision {change.resourceVersion}</small></label>)}<Button size="sm" disabled={busy||!allowed||!plan.changes.every(change=>confirmed.has(change.uid))} onClick={()=>void run(true)}>Confirm every revision and activate</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setPlan(null);setConfirmed(new Set());}}>Cancel review</Button></div>}{message&&<div role="status">{message}</div>}{outcome&&<div>{outcome.applied.map(change=><div key={change.uid}>Applied: {change.name} → {change.to}</div>)}{outcome.pending.map(change=><div key={change.uid}>Pending: {change.name} → {change.to}</div>)}{outcome.uncertain&&<div>Unknown write outcome: {outcome.uncertain.name}. Refresh before retrying.</div>}</div>}</EditorSection>;
}
