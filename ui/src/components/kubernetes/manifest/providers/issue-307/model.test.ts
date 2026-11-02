import { describe,it,expect } from 'vitest';
import { parseField,ruleBranch,unsupported } from './model';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
describe('monitoring domain edits',()=>{
 it('keeps incomplete duration invalid instead of converting units',()=>{
  expect(parseField({key:'interval',label:'Interval',type:'duration'},'30').error).toBeTruthy();
  expect(parseField({key:'interval',label:'Interval',type:'duration'},'1h30m').value).toBe('1h30m');
 });
 it('rejects unsafe replica values before number conversion',()=>{
  expect(parseField({key:'replicas',label:'Replicas',type:'integer'},'9007199254740993').error).toBeTruthy();
  expect(parseField({key:'replicas',label:'Replicas',type:'integer'},'3').value).toBe(3);
 });
 it('rejects embedded credentials and non HTTP remote write',()=>{
  for(const value of ['https://user:secret@example.invalid','file:///etc/passwd']) expect(parseField({key:'url',label:'URL',type:'url'},value).error).toBeTruthy();
 });
 it('changes rule branch atomically without rewriting expressions or labels',()=>{
  const operations=ruleBranch(['spec','groups',2,'rules',4],'record');
  expect(operations).toContainEqual({op:'remove',path:['spec','groups',2,'rules',4,'alert']});
  expect(operations).toContainEqual({op:'remove',path:['spec','groups',2,'rules',4,'for']});
  expect(operations).toContainEqual({op:'set',path:['spec','groups',2,'rules',4,'record'],value:''});
  expect(operations.some(op=>op.path.includes('expr')||op.path.includes('labels'))).toBe(false);
 });
 it('does not enable gated agent DaemonSet merely from installed schema',()=>{
  const draft={get:()=> 'DaemonSet'} as unknown as ResourceEditorDraft;
  expect(unsupported(draft,'PrometheusAgent')).toContain('feature gate');
  expect(unsupported(draft,'Prometheus')).toBeNull();
 });
});
