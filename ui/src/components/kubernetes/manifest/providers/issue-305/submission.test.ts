import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorActionResult, ResourceEditorContext, ResourceEditorReferenceService } from '@omniviewdev/runtime';
import { createResourceEditorDraft } from '../../resourceEditorController';
import { CALICO_330_IMAGES } from './evidence';
import { validateTigeraSubmission } from './submission';
const context:ResourceEditorContext = {group:'operator.tigera.io',version:'v1',kind:'ImageSet',resource:'imagesets',scope:'Cluster',connectionID:'fixture',intent:'create',ownership:{status:'application'},capabilities:{create:'available',update:'available',delete:'denied',list:'available',get:'available',actions:{}},discovery:{status:'available',features:{}},schema:{status:'available'}};
const references:ResourceEditorReferenceService = {list:async()=>({status:'ready',items:[]})};
const source = {metadata:{name:'calico-v3.30.0'},spec:{images:CALICO_330_IMAGES.map(image=>({image,digest:'sha256:'+'a'.repeat(64)}))}};
const evidence = {controller:{status:'ready',deployments:[{images:[{name:'tigera-operator',image:'quay.io/tigera/operator:v1.38.0'}]}]},installation:{status:'ready',observed:{variant:'Calico',calicoVersion:'v3.30.0'}},goldmane:{status:'ready'}};
describe('Tigera canonical submission admission',()=>{
 it('blocks an incomplete ImageSet before querying prerequisites',async()=>{
  const execute = vi.fn(async()=>({status:'ready' as const,output:evidence}));
  const draft = createResourceEditorDraft(JSON.stringify({...source,spec:{images:source.spec.images.slice(1)}}),'fixture',7);
  expect(await validateTigeraSubmission(draft,context,{references,actions:{execute}},new AbortController().signal)).not.toEqual([]);
  expect(execute).not.toHaveBeenCalled();
 });
 it('admits full inventory only with actual matching cohort evidence',async()=>{
  const draft = createResourceEditorDraft(JSON.stringify(source),'fixture',7);
  expect(await validateTigeraSubmission(draft,context,{references,actions:{execute:async()=>({status:'ready',output:evidence})}},new AbortController().signal)).toEqual([]);
  expect(await validateTigeraSubmission(draft,context,{references,actions:{execute:async()=>({status:'ready',output:{...evidence,installation:{status:'ready',observed:{variant:'Calico',calicoVersion:'v3.31.0'}}}})}},new AbortController().signal)).not.toEqual([]);
 });
 it('does not admit a delayed result after cancellation',async()=>{
  const controller = new AbortController();
  const {promise:result,resolve:complete} = Promise.withResolvers<ResourceEditorActionResult>();
  const pending = validateTigeraSubmission(createResourceEditorDraft(JSON.stringify(source),'fixture',7),context,{references,actions:{execute:()=>result}},controller.signal);
  controller.abort();
  complete({status:'ready',output:evidence});
  expect(await pending).toEqual([{path:[],message:'Submission validation cancelled.'}]);
 });
 it('reports denied lookup without leaking backend error payloads',async()=>{
  const errors = await validateTigeraSubmission(createResourceEditorDraft(JSON.stringify(source),'fixture',7),context,{references,actions:{execute:async()=>({status:'denied',message:'backend-private-detail'})}},new AbortController().signal);
  expect(errors).toEqual([{path:[],message:'Installed operator evidence denied.'}]);
 });
});
