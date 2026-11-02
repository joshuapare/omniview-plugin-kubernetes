import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { entryReadOnly, validate } from './domain';
function draft(value: unknown): ResourceEditorDraft {
 const get=(path:readonly(string|number)[])=>path.reduce<unknown>((v,key)=>v!==null&&typeof v==='object'?(v as Record<string|number,unknown>)[key]:undefined,value);
 return {sessionID:'fixture',revision:1,get,has:path=>get(path)!==undefined};
}
describe('Istio traffic and registration safety',()=>{
 it('blocks invalid traffic distribution without coercing text weights',()=>{
  expect(validate('VirtualService',draft({spec:{http:[{route:[{weight:70},{weight:20}]}]}}))).toHaveLength(1);
  expect(validate('VirtualService',draft({spec:{http:[{route:[{weight:'70'},{weight:30}]}]}}))).toHaveLength(1);
  expect(validate('VirtualService',draft({spec:{http:[{route:[{weight:70n},{weight:30n}]}]}}))).toEqual([]);
 });
 it('requires trusted application ownership and rejects registration evidence',()=>{
  const context={ownership:{status:'application'}} as ResourceEditorContext;
  expect(entryReadOnly(draft({}),context)).toBe(false);
  expect(entryReadOnly(draft({}),{} as ResourceEditorContext)).toBe(true);
  expect(entryReadOnly(draft({metadata:{ownerReferences:[{kind:'WorkloadGroup'}]}}),context)).toBe(true);
  expect(entryReadOnly(draft({metadata:{annotations:{'istio.io/autoRegistrationGroup':'group'}}}),context)).toBe(true);
 });
});
