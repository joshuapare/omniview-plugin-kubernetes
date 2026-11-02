import { describe, expect, it } from 'vitest';
import { sampling, placementOperations, readOnly } from './model';
import type { ResourceEditorDraft, ResourceEditorContext } from '@omniviewdev/runtime';
describe('Telemetry policy safety',()=>{
 it('retains explicit zero and rejects partial, negative and out-of-range sampling',()=>{
  expect(sampling('0')).toEqual({valid:true,value:0});
  expect(sampling('99.5')).toEqual({valid:true,value:99.5});
  for(const text of ['1.','-1','101','NaN','']) expect(sampling(text).valid).toBe(false);
 });
 it('changes placement with one exclusive atomic operation batch',()=>{
  const operations=placementOperations('targetRefs');
  expect(operations.filter(op=>op.op==='remove').map(op=>op.path)).toEqual([['spec','selector'],['spec','targetRef'],['spec','targetRefs']]);
  expect(operations[3]).toEqual({op:'set',path:['spec','targetRefs'],value:[]});
 });
 it('never treats unknown or controller ownership as authoring permission',()=>{
  const draft={get:()=>undefined} as unknown as ResourceEditorDraft;
  expect(readOnly(draft,{intent:'edit'} as ResourceEditorContext)).toBe(true);
  expect(readOnly(draft,{intent:'edit',ownership:{status:'controller'}} as ResourceEditorContext)).toBe(true);
  expect(readOnly(draft,{intent:'edit',ownership:{status:'application'}} as ResourceEditorContext)).toBe(false);
 });
});
