import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { resourceEditors } from './index';
function validate(kind: string, spec: unknown) {
 const draft:ResourceEditorDraft={sessionID:'test',revision:1,has:()=>true,get:path=>path.reduce<unknown>((value,key)=>value&&typeof value==='object'?(value as Record<string|number,unknown>)[key]:undefined,{spec})};
 return resourceEditors.find(editor=>editor.targets[0].kind===kind)!.validate!(draft,{} as ResourceEditorContext);
}
describe('Strimzi cross-field validation',()=>{
 it('rejects unknown MirrorMaker aliases and self replication',()=>{
  expect(validate('KafkaMirrorMaker2',{connectCluster:'missing',clusters:[{alias:'a'}],mirrors:[{sourceCluster:'a',targetCluster:'a'}]})).toHaveLength(2);
 });
 it('accepts explicit distinct replication direction',()=>{
  expect(validate('KafkaMirrorMaker2',{connectCluster:'target',clusters:[{alias:'source'},{alias:'target'}],mirrors:[{sourceCluster:'source',targetCluster:'target'}]})).toEqual([]);
 });
 it('requires broker IDs only for broker-specific rebalance',()=>{
  expect(validate('KafkaRebalance',{mode:'full'})).toEqual([]);
  expect(validate('KafkaRebalance',{mode:'remove-brokers',brokers:[]})).toHaveLength(1);
 });
 it('rejects duplicate names and reserved listener ports',()=>{
  expect(validate('Kafka',{kafka:{listeners:[{name:'internal',port:9092},{name:'internal',port:9404}]}})).toHaveLength(2);
 });
});
