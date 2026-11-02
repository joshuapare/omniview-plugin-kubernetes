import {describe,it,expect} from 'vitest';
import type {ResourceEditorDraft,ResourceEditorPath} from '@omniviewdev/runtime';
import {validateMonitoring} from './validation';
function draft(spec:unknown):ResourceEditorDraft {const root={spec};const get=(path:ResourceEditorPath):unknown=>path.reduce<unknown>((value,key)=>value&&typeof value==='object'?(value as Record<string|number,unknown>)[key]:undefined,root);return {sessionID:'fixture',revision:0,get,has:path=>get(path)!==undefined};}
describe('monitoring submission validation',()=>{
 it('accepts preserved numeric PodMonitor portNumber without forcing named port',()=>{expect(validateMonitoring(draft({podMetricsEndpoints:[{portNumber:9090}]}),'PodMonitor')).toEqual([]);});
 it('requires scrape endpoints instead of accepting metadata-only monitor',()=>{expect(validateMonitoring(draft({selector:{}}),'ServiceMonitor')).toContainEqual({path:['spec','endpoints'],message:'Add at least one row.'});});
 it('rejects alert timing on recording rules without changing source',()=>{const source=draft({groups:[{name:'g',rules:[{record:'job:up:sum',expr:'sum(up)',for:'5m'}]}]});expect(validateMonitoring(source,'PrometheusRule').some(issue=>issue.message.includes('Recording rules'))).toBe(true);expect(source.get(['spec','groups',0,'rules',0,'for'])).toBe('5m');});
 it('rejects routes to undefined receivers',()=>{expect(validateMonitoring(draft({route:{receiver:'missing'},receivers:[{name:'existing'}]}),'AlertmanagerConfig')).toContainEqual({path:['spec','route','receiver'],message:'Choose a receiver defined in this configuration.'});});
 it('preserves alternate Probe ingress discovery instead of requiring static targets',()=>{expect(validateMonitoring(draft({prober:{url:'blackbox:9115'},targets:{ingress:{selector:{}}}}),'Probe')).toEqual([]);});
});
