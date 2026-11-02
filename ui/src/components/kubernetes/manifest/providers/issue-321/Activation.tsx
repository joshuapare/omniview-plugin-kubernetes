import { useEffect, useRef, useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorSection } from '../../editor-controls';
const protocol='kubernetes.crossplane-revision-activation.v1';
interface Change {resource:string;name:string;uid:string;resourceVersion:string;from:'Active'|'Inactive';to:'Active'|'Inactive'}
interface Plan {owner:{name:string;uid:string;resourceVersion:string;activationPolicy:'Manual'};target:{name:string;uid:string;resourceVersion:string};changes:Change[];atomic:false}
function isPlan(value:unknown):value is Plan {
 if(!value||typeof value!=='object')return false;
 const plan=value as Plan;
 return plan.atomic===false&&plan.owner?.activationPolicy==='Manual'&&typeof plan.owner.name==='string'&&typeof plan.target?.uid==='string'&&Array.isArray(plan.changes)&&plan.changes.length>0&&plan.changes.every(change=>typeof change.name==='string'&&typeof change.uid==='string'&&typeof change.resourceVersion==='string'&&['Active','Inactive'].includes(change.from)&&['Active','Inactive'].includes(change.to));
}
export function Activation(form:ResourceEditorFormProps){
 const [plan,setPlan]=useState<Plan|null>(null);
 const [confirmed,setConfirmed]=useState<ReadonlySet<string>>(new Set());
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [outcome,setOutcome]=useState<{status:string;applied:Change[];pending:Change[];uncertain?:Change}|null>(null);
 const generation=useRef(0);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>{generation.current++;controller.current?.abort();setPlan(null);setConfirmed(new Set());setBusy(false);setMessage('');setOutcome(null);return()=>{generation.current++;controller.current?.abort();};},[form.draft.sessionID,form.draft.revision,form.patch,form.actions,form.context.connectionID,form.context.uid,form.context.resourceVersion]);
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
    const value=result.output as {status?:unknown;applied?:unknown;pending?:unknown;uncertain?:Change};
    setPlan(null);setConfirmed(new Set());
    if(value&&['completed','partial','failed'].includes(String(value.status))&&Array.isArray(value.applied)&&Array.isArray(value.pending)){
     setOutcome({status:String(value.status),applied:value.applied,pending:value.pending,uncertain:value.uncertain});
     setMessage(value.status==='completed'?'Activation writes completed. Controller health is not established.':value.status==='partial'?'Activation partially applied. Inspect each revision before retrying.':'Activation failed. Inspect revision state before retrying.');
    }else setMessage('Activation result is unknown. Inspect revisions before retrying.');
   }
  }catch{if(!abort.signal.aborted&&generation.current===current){setPlan(null);setMessage(execute?'Activation outcome is unknown. Inspect revisions before retrying.':'Activation review could not be loaded.');}}
  finally{if(!abort.signal.aborted&&generation.current===current)setBusy(false);}
 }
 return <EditorSection title="Revision activation"><Button size="sm" disabled={!allowed||busy} onClick={()=>void run(false)}>Review activation</Button>{!allowed&&<span role="status">Activation action permission is not available.</span>}{plan&&<div><p>Package {plan.owner.name} · Manual activation. Writes are not atomic.</p>{plan.changes.map(change=><label key={change.uid} style={{display:'block'}}><input type="checkbox" checked={confirmed.has(change.uid)} disabled={busy} onChange={event=>setConfirmed(previous=>{const next=new Set(previous);if(event.target.checked)next.add(change.uid);else next.delete(change.uid);return next;})}/>{change.name}: {change.from} → {change.to}<small> · revision {change.resourceVersion}</small></label>)}<Button size="sm" disabled={busy||!allowed||!plan.changes.every(change=>confirmed.has(change.uid))} onClick={()=>void run(true)}>Confirm every revision and activate</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setPlan(null);setConfirmed(new Set());}}>Cancel review</Button></div>}{message&&<div role="status">{message}</div>}{outcome&&<div>{outcome.applied.map(change=><div key={change.uid}>Applied: {change.name} → {change.to}</div>)}{outcome.pending.map(change=><div key={change.uid}>Pending: {change.name} → {change.to}</div>)}{outcome.uncertain&&<div>Unknown write outcome: {outcome.uncertain.name}. Refresh before retrying.</div>}</div>}</EditorSection>;
}
