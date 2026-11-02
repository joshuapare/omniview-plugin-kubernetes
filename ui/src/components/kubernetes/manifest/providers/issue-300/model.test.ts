import { describe, expect, it } from 'vitest';
import { sampling, placementOperations, readOnly, validate } from './model';
import type { ResourceEditorDraft, ResourceEditorContext } from '@omniviewdev/runtime';
describe('Telemetry policy safety',()=>{
 it('retains explicit zero and rejects partial, negative and out-of-range sampling',()=>{
  expect(sampling('0')).toEqual({valid:true,value:0});
  expect(sampling('99.5')).toEqual({valid:true,value:99.5});
  for(const text of ['1.','-1','101','NaN','']) expect(sampling(text).valid).toBe(false);
 });
 it.each([0n, 100n, 0, 100, 99.5])('accepts canonical sampling %s without converting or changing source', value => {
  const root = { spec: { tracing: [{ randomSamplingPercentage: value }], future: { exact: 9007199254740993n } } };
  const draft: ResourceEditorDraft = { sessionID: 'telemetry-sampling', revision: 0, get(path) { return path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, root); }, has(path) { return this.get(path) !== undefined; } };
  expect(validate(draft)).toEqual([]);
  expect(root.spec.tracing[0].randomSamplingPercentage).toBe(value);
  expect(root.spec.future.exact).toBe(9007199254740993n);
 });
 it.each([-1n, 101n, 9007199254740993n, -1, 100.5, Number.NaN, Number.POSITIVE_INFINITY, '0', '99.5', false, {}, []])('rejects invalid sampling %s without coercion', value => {
  const root = { spec: { tracing: [{ randomSamplingPercentage: value }] } };
  const draft: ResourceEditorDraft = { sessionID: 'telemetry-sampling', revision: 0, get(path) { return path.reduce<unknown>((node, key) => node && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, root); }, has(path) { return this.get(path) !== undefined; } };
  expect(validate(draft)).toEqual([{ path: ['spec', 'tracing', 0, 'randomSamplingPercentage'], message: 'Sampling must be between 0 and 100.' }]);
  expect(root.spec.tracing[0].randomSamplingPercentage).toBe(value);
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
